import React from 'react';
import PropTypes from 'prop-types';
import './Header.css';

const Header = ({ serverStatus }) => {
  const statusClass = serverStatus.collecting ? 'status-online' : 'status-offline';
  const statusText = serverStatus.collecting ? 'Online' : 'Offline';

  return (
    <header className="app-header">
      <div className="header-content">
        <h1 className="app-title">System Monitor Dashboard</h1>
        <div className="server-status">
          <span className={`status-dot ${statusClass}`} title={`Server is ${statusText}`}></span>
          <span>{serverStatus.systemInfo?.hostname || 'Server'}: <strong>{statusText}</strong></span>
        </div>
      </div>
    </header>
  );
};

Header.propTypes = {
  serverStatus: PropTypes.shape({
    collecting: PropTypes.bool,
    connectedClients: PropTypes.number,
    systemInfo: PropTypes.shape({
      hostname: PropTypes.string,
    }),
  }).isRequired,
};

export default Header;