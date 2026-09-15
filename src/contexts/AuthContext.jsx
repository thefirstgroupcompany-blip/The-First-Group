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
      const currentSessionId = sessionStorage.getItem('tfg_session_id');
      if (currentSessionId) {
        import('../services/sessionService').then(({ terminateSession }) => {
          terminateSession(currentSessionId, 'تسجيل خروج طبيعي');
        }).catch(() => {});
      }
      sessionStorage.removeItem('ms_user');
      localStorage.removeItem('ms_user');
      sessionStorage.removeItem('tfg_session_id');
    } catch (e) {}
    setUser(null);
  };

  // Live session registration, heartbeat, and remote kill watcher
  useEffect(() => {
    if (!user?.id) return;
    let unsubUser = null;
    let unsubSession = null;
    let heartbeatInterval = null;

    import('../services/sessionService').then(({ registerActiveSession, sendSessionHeartbeat, watchSessionStatus, getOrCreateSessionId }) => {
      const sessionId = getOrCreateSessionId();
      registerActiveSession(user);

      // 1. Listen for remote termination by Admin
      unsubSession = watchSessionStatus(sessionId, (termData) => {
        logout();
        alert('⚠️ تم إنهاء هذه الجلسة عن بُعد من قِبل إدارة النظام لأسباب أمنية (' + (termData.terminatedBy || 'المدير') + ').');
        window.location.replace('/');
      });

      // 2. Periodic heartbeat every 45 seconds
      heartbeatInterval = setInterval(() => {
        sendSessionHeartbeat(sessionId);
      }, 45000);
    }).catch(err => {
      console.warn('[SessionService] Init failed:', err);
    });

    // 3. Live user account status watcher
    try {
      import('../firebase').then(({ db }) => {
        import('firebase/firestore').then(({ doc, onSnapshot }) => {
          unsubUser = onSnapshot(doc(db, 'users', user.id), (snap) => {
            if (!snap.exists()) {
              logout();
              alert('تم حذف هذا الحساب من قِبل إدارة النظام.');
              window.location.replace('/');
              return;
            }
            const data = snap.data();
            if (data.status === 'disabled') {
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
      if (unsubUser) unsubUser();
      if (unsubSession) unsubSession();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
  }, [user?.id]);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
