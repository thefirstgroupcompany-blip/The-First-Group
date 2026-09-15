import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = sessionStorage.getItem('ms_user') || localStorage.getItem('ms_user');
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      // Verify session expiry (24 hours)
      if (parsed?._sessionAt) {
        const age = Date.now() - parsed._sessionAt;
        const maxAge = 24 * 60 * 60 * 1000;
        if (age > maxAge) {
          sessionStorage.removeItem('ms_user');
          localStorage.removeItem('ms_user');
          return null;
        }
      }
      return parsed;
    } catch (e) {
      return null;
    }
  });

  const login = (userData) => {
    try {
      // Security: Strip passwordHash before saving to storage or state
      const { passwordHash, ...safeUserData } = userData || {};
      const sessionUser = { ...safeUserData, _sessionAt: Date.now() };
      sessionStorage.setItem('ms_user', JSON.stringify(sessionUser));
      localStorage.setItem('ms_user', JSON.stringify(sessionUser));
      setUser(sessionUser);
    } catch (e) {
      const { passwordHash, ...safeUserData } = userData || {};
      setUser(safeUserData);
    }
  };

  const logout = () => {
    try {
      sessionStorage.removeItem('ms_user');
      localStorage.removeItem('ms_user');
    } catch (e) {}
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
