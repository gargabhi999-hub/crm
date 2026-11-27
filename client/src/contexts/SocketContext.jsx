import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getAccessToken } from '../utils/api';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { isAuthenticated, user } = useAuth();

  const userId = user?._id || user?.id;

  useEffect(() => {
    if (isAuthenticated && userId) {
      const token = getAccessToken();
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const serverUrl =
        import.meta.env.VITE_SERVER_URL ||
        (apiUrl ? apiUrl.replace(/\/api\/?$/, '') : 'http://localhost:4000');
      const newSocket = io(serverUrl, {
        withCredentials: true,
        ...(token ? { auth: { token } } : {}),
      });

      newSocket.on('connect', () => {
        console.log('Connected to real-time server');
      });

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
      };
    } else if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  }, [isAuthenticated, userId]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};
