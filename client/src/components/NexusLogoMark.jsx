import React from 'react';

const NexusLogoMark = ({ size = 116 }) => (
  <img
    src="/nexus-logo.png"
    alt="Nexus CRM Logo"
    width={size}
    height={size}
    draggable={false}
    style={{
      width: size,
      height: size,
      objectFit: 'contain',
      display: 'block',
      filter: 'drop-shadow(0 10px 28px rgba(34, 211, 238, 0.35)) drop-shadow(0 4px 16px rgba(99, 102, 241, 0.35))',
      userSelect: 'none',
    }}
  />
);

export default NexusLogoMark;
