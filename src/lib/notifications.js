// Notification helpers: audio chime, desktop popup, title blink

let audioCtx = null;

/**
 * Play a pleasant two-tone chime
 */
export function playOrderChime() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.setValueAtTime(1174.66, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.7);
  } catch (e) {
    console.warn('Audio chime error:', e);
  }
}

/**
 * Request desktop notification permission
 * @returns {Promise<string>} permission status
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}

/**
 * Send a desktop notification
 * @param {string} title
 * @param {string} body
 * @param {string} tag
 * @param {function} onClick
 */
export function sendDesktopNotification(title, body, tag = '', onClick) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const notif = new Notification(title, {
      body,
      icon: '/favicon.svg',
      tag: tag || `notif-${Date.now()}`,
      requireInteraction: true,
    });
    notif.onclick = function () {
      window.focus();
      onClick?.();
      notif.close();
    };
  } catch (e) {
    console.warn('Desktop notification error:', e);
  }
}

let titleBlinkInterval = null;
let originalTitle = '';

/**
 * Start flashing the document title
 * @param {string} text1
 * @param {string} text2
 */
export function startTitleBlink(text1, text2) {
  stopTitleBlink();
  originalTitle = document.title;
  let toggle = false;
  titleBlinkInterval = setInterval(() => {
    document.title = toggle ? text1 : text2;
    toggle = !toggle;
  }, 900);
}

/**
 * Stop flashing the document title
 */
export function stopTitleBlink() {
  if (titleBlinkInterval) {
    clearInterval(titleBlinkInterval);
    titleBlinkInterval = null;
    document.title = originalTitle;
  }
}

let cashAlarmInterval = null;

/**
 * Start repeating cash alert chime
 */
export function startCashAlertLoop() {
  stopCashAlertLoop();
  playOrderChime();
  cashAlarmInterval = setInterval(() => {
    playOrderChime();
  }, 3500);
}

/**
 * Stop the cash alert loop
 */
export function stopCashAlertLoop() {
  if (cashAlarmInterval) {
    clearInterval(cashAlarmInterval);
    cashAlarmInterval = null;
  }
}
