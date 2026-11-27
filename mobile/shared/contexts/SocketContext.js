import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getAccessToken, getServerUrl } from '../services/api';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const { isAuthenticated, user, serverUrl } = useAuth();

  const userId = user?._id || user?.id;

  useEffect(() => {
    if (isAuthenticated && userId) {
      const token = getAccessToken();
      const targetUrl = serverUrl || getServerUrl();
      const newSocket = io(targetUrl, {
        transports: ['websocket', 'polling'],
        auth: token ? { token } : {},
      });

      newSocket.on('connect', () => setConnected(true));
      newSocket.on('disconnect', () => setConnected(false));

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
        setConnected(false);
      };
    } else if (socket) {
      socket.disconnect();
      setSocket(null);
      setConnected(false);
    }
  }, [isAuthenticated, userId, serverUrl]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};
