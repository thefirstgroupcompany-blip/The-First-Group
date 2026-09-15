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

  // Live session invalidation: Listen for account status changes in realtime
  useEffect(() => {
    if (!user?.id) return;
    let unsub = null;
    try {
      import('../firebase').then(({ db }) => {
        import('firebase/firestore').then(({ doc, onSnapshot }) => {
          unsub = onSnapshot(doc(db, 'users', user.id), (snap) => {
            if (!snap.exists()) {
              // User was deleted from system -> revoke session immediately
              logout();
              alert('تم حذف هذا الحساب من قِبل إدارة النظام.');
              window.location.replace('/');
              return;
            }
            const data = snap.data();
            if (data.status === 'disabled') {
              // User was disabled -> revoke session immediately
              logout();
              alert('تم تعطيل هذا الحساب حالياً من قِبل إدارة النظام.');
              window.location.replace('/');
            }
          }, (err) => {
            console.warn('[Auth] Live user heartbeat error:', err);
          });
        });
      });
    } catch (_) {}

    return () => {
      if (unsub) unsub();
    };
  }, [user?.id]);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
