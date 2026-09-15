// System & Mobile PWA Notifications Engine with Audio Chime & Vibration
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('متصفحك لا يدعم الإشعارات المباشرة.');
    return 'unsupported';
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      sendSystemNotification('The First Group 🏢✨', 'تم تفعيل الإشعارات بنجاح على جهازك!');
    }
    return perm;
  } catch (e) {
    console.error('Error requesting notif permission:', e);
    return 'denied';
  }
}

export function playChimeSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    // Pleasant double chime: D5 -> A5
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) {
    // AudioContext autoplay might be blocked before first user interaction
  }
}

export function sendSystemNotification(title, body, tag = 'tfg-system') {
  try {
    playChimeSound();
  } catch (e) {}

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([150, 80, 150]);
    } catch (e) {}
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/favicon.png',
          vibrate: [150, 80, 150],
          tag,
          renotify: true
        });
      }).catch(() => {
        try {
          new Notification(title, { body, icon: '/pwa-192x192.png', badge: '/favicon.png' });
        } catch (e) {}
      });
    } else {
      try {
        new Notification(title, { body, icon: '/pwa-192x192.png', badge: '/favicon.png' });
      } catch (e) {}
    }
  }
}
