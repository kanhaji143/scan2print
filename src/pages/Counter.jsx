import { useState, useEffect, useRef } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  doc,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import QRCode from 'qrcode';
import { io } from 'socket.io-client';
import {
  playOrderChime,
  requestNotificationPermission,
  sendDesktopNotification,
  startTitleBlink,
  stopTitleBlink,
  startCashAlertLoop,
  stopCashAlertLoop,
} from '../lib/notifications';
import { formatINR } from '../lib/pricing';
import { BRAND, applyBrandTitle } from '../lib/branding';

function formatDate(ts) {
  if (!ts) return '-';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}

export default function Counter() {
  // Auth states
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  // Data states
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoPrintOrder, setAutoPrintOrder] = useState(null);
  const [manualOrder, setManualOrder] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [showLedger, setShowLedger] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showControl, setShowControl] = useState(false);
  const [ledgerData, setLedgerData] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [printerName, setPrinterName] = useState(() => {
    try { return localStorage.getItem('qrPrinterName') || 'Windows Default Printer'; } catch { return 'Windows Default Printer'; }
  });
  const [printerList, setPrinterList] = useState([]); // [{ name, isDefault }]
  const [printersLoading, setPrintersLoading] = useState(false);
  const [lanIP, setLanIP] = useState('');

  // Persist printer selection to localStorage
  useEffect(() => {
    try { localStorage.setItem('qrPrinterName', printerName); } catch {}
  }, [printerName]);
  const [countdownSeconds, setCountdownSeconds] = useState(5);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [counterQrUrl, setCounterQrUrl] = useState('');
  const [serverConnected, setServerConnected] = useState(false);
  const [printToast, setPrintToast] = useState(null);
  // Undo/Revoke system — galti bina refresh ke sudharo
  const [undoToast, setUndoToast] = useState(null); // { message, undo }
  // Settings: local network IP for print server
  const [serverHost, setServerHost] = useState(() => {
    try { return localStorage.getItem('qrPrintServerHost') || 'localhost'; } catch { return 'localhost'; }
  });
  const [serverHostInput, setServerHostInput] = useState('');
  const [resetting, setResetting] = useState(false);

  const seenRef = useRef(new Set());
  const countdownTimerRef = useRef(null);
  const undoTimerRef = useRef(null);
  const socketRef = useRef(null);
  const jobsRef = useRef(new Map()); // jobId -> order (print fail par file kholne ke liye)

  // Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Generate QR locally for the upload URL
  useEffect(() => {
    applyBrandTitle('Counter');
    QRCode.toDataURL(window.location.origin + '/', { width: 400, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
    // Mobile remote QR — counter page ka URL (shop WiFi par mobile se chalao)
    QRCode.toDataURL(window.location.origin + '/counter', { width: 300, margin: 2 })
      .then(setCounterQrUrl)
      .catch(() => setCounterQrUrl(''));
  }, []);

  /** Print server se installed printers ki list mango (dropdown ke liye) */
  const fetchPrinters = () => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    setPrintersLoading(true);
    socket.emit('list-printers', (res) => {
      setPrintersLoading(false);
      if (res?.ok && Array.isArray(res.printers) && res.printers.length) {
        setPrinterList(res.printers);
        if (res.lanIP) setLanIP(res.lanIP);
        // Saved printer list me na ho to default printer auto-select karo
        setPrinterName((prev) => {
          if (res.printers.some((p) => p.name === prev)) return prev;
          const def = res.printers.find((p) => p.isDefault);
          return def?.name || prev;
        });
      }
    });
  };

  /** Clipboard copy + toast feedback */
  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setPrintToast({ ok: true, message: `${label} copy ho gaya ✓`, at: Date.now() });
    } catch {
      setPrintToast({ ok: false, message: 'Copy nahi hua — link manually select karke copy karo.', at: Date.now() });
    }
  };

  /** Customer QR poster (A4 standee) — naye window me kholo, wahan se print */
  const openPoster = () => {
    if (!qrDataUrl) return;
    const w = window.open('', '_blank');
    if (!w) {
      setPrintToast({ ok: false, message: 'Popup blocked hai — browser me popups allow karo.', at: Date.now() });
      return;
    }
    const origin = window.location.origin;
    w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Scan to Print Poster</title>
<style>
  @page { size: A4; margin: 0; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; }
  .poster { width: 794px; min-height: 1123px; margin: 0 auto; background: linear-gradient(160deg,#0f0c29,#302b63); color: #fff; text-align: center; padding: 60px 40px; box-sizing: border-box; }
  h1 { font-size: 44px; margin: 0 0 8px; }
  h2 { font-size: 24px; font-weight: 400; opacity: .85; margin: 0 0 30px; }
  .qr-card { background: #fff; border-radius: 24px; display: inline-block; padding: 28px; }
  .qr-card img { width: 420px; height: 420px; display: block; }
  .steps { margin: 30px auto 0; font-size: 22px; line-height: 1.8; opacity: .95; }
  .rates { margin-top: 28px; display: flex; gap: 20px; justify-content: center; }
  .rate { background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.3); border-radius: 14px; padding: 14px 26px; font-size: 22px; }
  .url { margin-top: 26px; font-size: 18px; opacity: .8; word-break: break-all; }
  @media print { body { background: #0f0c29; } .no-print { display: none; } }
</style></head>
<body>
  <div class="poster">
    <h1>Scan to Print</h1>
    <h2>अपना दस्तावेज़ खुद अपलोड करें — तुरंत प्रिंट पाएं</h2>
    <div class="qr-card"><img src="${qrDataUrl}" alt="QR" /></div>
    <div class="steps"><strong>स्टेप्स:</strong><br/>1. QR स्कैन करें ➔ 2. डॉक्यूमेंट अपलोड करें ➔ 3. प्रिंट पाएं</div>
    <div class="rates">
      <div class="rate">⚫⚪ B&amp;W: ₹10/पेज</div>
      <div class="rate">🌈 कलर: ₹15/पेज</div>
    </div>
    <div class="url">${origin}</div>
  </div>
  <div class="no-print" style="text-align:center;padding:20px;">
    <button onclick="window.print()" style="font-size:20px;padding:12px 30px;cursor:pointer;">🖨️ यह पोस्टर प्रिंट करें</button>
  </div>
</body></html>`);
    w.document.close();
  };

  /** Fullscreen toggle */
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };

  // Connect to the local print server (if running on the shop PC)
  useEffect(() => {
    const socket = io(`http://${serverHost}:3000`, {
      reconnectionAttempts: 5,
      timeout: 4000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setServerConnected(true);
      // Server milte hi installed printers ki list maango (dropdown ke liye)
      fetchPrinters();
    });
    socket.on('disconnect', () => setServerConnected(false));
    socket.on('connect_error', () => setServerConnected(false));

    socket.on('hello', (info) => {
      // Sirf LAN IP update karo — printer selection operator ke paas rehne do
      if (info?.lanIP) setLanIP(info.lanIP);
    });

    socket.on('print-status', (data) => {
      setPrintToast({ ...data, at: Date.now() });
      // Print fail hua to order ki file khol do (manual print fallback)
      if (data && !data.ok && data.jobId) {
        const order = jobsRef.current.get(data.jobId);
        if (order) openDocumentFor(order);
        jobsRef.current.delete(data.jobId);
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [serverHost]);

  // Auto-hide print toast
  useEffect(() => {
    if (!printToast) return;
    const t = setTimeout(() => setPrintToast(null), 8000);
    return () => clearTimeout(t);
  }, [printToast]);

  /** Send print job to local server; returns false if server offline */
  const sendPrintJob = (order) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return false;

    const file =
      order?.pdfFile?.name
        ? order.pdfFile
        : order?.image1?.name
          ? order.image1
          : order?.image2;
    const url = file?.downloadUrl || file?.previewUrl;
    if (!url) return false;

    const isPdf = /\.pdf$/i.test(file?.name || '') || Boolean(order?.pdfFile?.name);
    jobsRef.current.set(order.id, order);
    socket.emit('print-job', {
      jobId: order.id,
      token: order.token || '',
      url,
      fileName: file?.name || 'document',
      type: isPdf ? 'pdf' : 'image',
      copies: order.copies || 1,
      printer: printerName,
    });
    return true;
  };

  const clearCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(
    () => () => {
      clearCountdown();
      stopCashAlertLoop();
      stopTitleBlink();
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    },
    []
  );

  /** Undo toast dikhao (10 sec) — har action ke baad galti turant sudharo, bina refresh */
  const showUndoToast = (message, undoFn) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast({ message, undo: undoFn });
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 10000);
  };

  const hideUndoToast = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast(null);
  };

  /** Open the uploaded document so the operator can print it */
  const openDocumentFor = (order) => {
    const url =
      order?.pdfFile?.downloadUrl ||
      order?.image1?.previewUrl ||
      order?.image2?.previewUrl;
    if (url) window.open(url, '_blank', 'noopener');
  };

  const completeOrder = async (order) => {
    if (!order) return;
    // Pehle local print server try karo (automatic printing)
    const sent = sendPrintJob(order);
    if (!sent) openDocumentFor(order); // fallback: file khol do, operator Ctrl+P kare
    try {
      await updateDoc(doc(db, 'printRequests', order.id), {
        printStatus: 'COMPLETED',
        status: 'Printed', // Dashboard sync
      });
    } catch (err) {
      console.error(err);
    }
    setAutoPrintOrder(null);
  };

  const startCountdown = (order) => {
    clearCountdown();
    setCountdown(countdownSeconds);
    let remaining = countdownSeconds;
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearCountdown();
        completeOrder(order);
      }
    }, 1000);
  };

  // Live listener for print requests
  useEffect(() => {
    if (!user) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'printRequests'), orderBy('uploadedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRequests(items);
        setLoading(false);

        for (const item of items) {
          // Paid online -> auto-print countdown
          if (
            item.printStatus === 'WAITING_CONFIRMATION' &&
            item.paymentMode === 'RAZORPAY' &&
            !seenRef.current.has(item.id)
          ) {
            seenRef.current.add(item.id);
            playOrderChime();
            sendDesktopNotification(
              'New Online Print Order!',
              `Amount: ${formatINR(item.totalAmount)} | Token: ${item.token}`,
              `order-${item.id}`
            );
            setAutoPrintOrder((prev) => (prev && prev.id === item.id ? prev : item));
            startCountdown(item);
          }
          // Cash at counter -> manual confirmation
          if (
            item.printStatus === 'WAITING_OPERATOR_CONFIRMATION' &&
            item.paymentMode === 'MANUAL_PAY' &&
            !seenRef.current.has(item.id)
          ) {
            seenRef.current.add(item.id);
            playOrderChime();
            startCashAlertLoop();
            startTitleBlink(
              `Cash Order! ${formatINR(item.totalAmount)}`,
              `Print System - ${item.token}`
            );
            sendDesktopNotification(
              'Cash Print Order!',
              `Amount: ${formatINR(item.totalAmount)} | Token: ${item.token}`,
              `order-${item.id}`
            );
            setManualOrder((prev) => (prev && prev.id === item.id ? prev : item));
          }
        }
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleCancelAutoPrint = async () => {
    clearCountdown();
    if (autoPrintOrder) {
      const order = autoPrintOrder;
      // Undo: cancel paylaan kar do — countdown modal phir se aayega
      showUndoToast(`#${order.token} cancel ho gaya — 10 sec tak Undo possible`, () => {
        seenRef.current.delete(order.id);
        updateDoc(doc(db, 'printRequests', order.id), {
          printStatus: 'WAITING_CONFIRMATION',
          status: 'Pending', // Dashboard sync
        }).catch((err) => console.error(err));
      });
      try {
        await updateDoc(doc(db, 'printRequests', order.id), {
          printStatus: 'CANCELLED',
          status: 'Cancelled', // Dashboard sync
        });
      } catch (err) {
        console.error(err);
      }
    }
    setAutoPrintOrder(null);
  };

  const handleImmediatePrint = () => {
    clearCountdown();
    completeOrder(autoPrintOrder);
  };

  /** Kisi bhi pending order ko queue se bahar (out-of-order) print karo */
  const printOrderNow = async (order) => {
    if (!order) return;
    // Agar koi aur auto-print modal open hai, use defer karo (cancel nahi) — order pending rehta hai
    if (autoPrintOrder && autoPrintOrder.id !== order.id) {
      clearCountdown();
      setAutoPrintOrder(null);
    }
    // Cash order: pehle cash confirm karo
    if (
      order.paymentMode === 'MANUAL_PAY' &&
      order.printStatus === 'WAITING_OPERATOR_CONFIRMATION'
    ) {
      await confirmCash(order);
      return;
    }
    // Online pending: turant print
    await completeOrder(order);
  };

  /** Printed/complete order ko wapas pending karo (Revoke — bina refresh) */
  const revertCompleted = async (order) => {
    if (!order) return;
    const isOnline = order.paymentMode === 'RAZORPAY';
    seenRef.current.delete(order.id); // modal + chime dobara trigger ho
    try {
      await updateDoc(doc(db, 'printRequests', order.id), {
        printStatus: isOnline
          ? 'WAITING_CONFIRMATION'
          : 'WAITING_OPERATOR_CONFIRMATION',
        ...(isOnline ? {} : { paymentStatus: 'PENDING' }),
        status: 'Pending', // Dashboard sync
      });
    } catch (err) {
      console.error(err);
    }
  };

  /** Shared: cash milne par order print karo (modal ya queue se) */
  const confirmCash = async (order) => {
    if (!order) return;
    const prevPayment = order.paymentStatus || 'PENDING';
    try {
      await updateDoc(doc(db, 'printRequests', order.id), {
        paymentStatus: 'PAID',
        printStatus: 'COMPLETED',
        status: 'Printed', // Dashboard sync
      });
    } catch (err) {
      console.error(err);
    }
    // Pehle local print server try karo (automatic printing)
    const sent = sendPrintJob(order);
    if (!sent) openDocumentFor(order); // fallback: file khol do
    stopCashAlertLoop();
    stopTitleBlink();
    setManualOrder(null);
    // Galti se confirm ho gaya? Undo se wapas cash pending (bina refresh)
    showUndoToast(`#${order.token} print ho gaya — galti thi? Undo dabao`, () => {
      seenRef.current.delete(order.id);
      updateDoc(doc(db, 'printRequests', order.id), {
        paymentStatus: prevPayment,
        printStatus: 'WAITING_OPERATOR_CONFIRMATION',
        status: 'Pending', // Dashboard sync
      }).catch((err) => console.error(err));
    });
  };

  /** Cancelled/baaki pade order ko baad mein print karo (mistake recovery) */
  const reprintOrder = async (order) => {
    if (!order) return;
    const sent = sendPrintJob(order);
    if (!sent) openDocumentFor(order);
    try {
      await updateDoc(doc(db, 'printRequests', order.id), {
        printStatus: 'COMPLETED',
        status: 'Printed', // Dashboard sync
      });
    } catch (err) {
      console.error(err);
    }
    showUndoToast(`#${order.token} print ho gaya — Undo karne ke liye dabao`, () => {
      seenRef.current.delete(order.id);
      updateDoc(doc(db, 'printRequests', order.id), {
        printStatus: 'CANCELLED',
        status: 'Cancelled', // Dashboard sync
      }).catch((err) => console.error(err));
    });
  };

  const handleConfirmManual = () => confirmCash(manualOrder);

  const handleLaterManual = () => {
    const order = manualOrder;
    stopCashAlertLoop();
    stopTitleBlink();
    setManualOrder(null);
    if (order) {
      showUndoToast(
        `#${order.token} pending list mein hai — kabhi bhi recover karo`,
        () => {
          // Undo: modal + alert turant wapas (bina refresh)
          setManualOrder(order);
          startCashAlertLoop();
          startTitleBlink(
            `Cash Order! ${formatINR(order.totalAmount)}`,
            `Print System - ${order.token}`
          );
        }
      );
    }
  };

  const loadLedger = async () => {
    try {
      const snap = await getDocs(collection(db, 'printRequests'));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const now = Date.now();
      const cutoff48h = now - 48 * 60 * 60 * 1000;

      const tsOf = (r) => {
        const t = r.uploadedAt?.toDate?.() || new Date(r.uploadedAt || Date.now());
        return t.getTime();
      };

      const active = all.filter(
        (r) => tsOf(r) >= cutoff48h && r.paymentStatus === 'PAID'
      );
      const archived = all.filter(
        (r) => tsOf(r) < cutoff48h && r.paymentStatus === 'PAID'
      );

      const activeTotal = active.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
      const archivedTotal = archived.reduce(
        (sum, r) => sum + (r.totalAmount || 0),
        0
      );

      setLedgerData({
        transactions: active.sort((a, b) => tsOf(b) - tsOf(a)),
        activeTotal,
        activeCount: active.length,
        archivedTotal,
        archivedCount: archived.length,
        grandTotal: activeTotal + archivedTotal,
      });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (showLedger) loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLedger]);

  const handleNotificationToggle = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      sendDesktopNotification(
        'Notifications Active!',
        'You will receive pop-up alerts for new orders.',
        'test-notif'
      );
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setSigningIn(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setAuthError(err?.message || 'Login failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  /** Fresh Start: saare old/dummy records delete karo (Reset to 0) */
  const handleFreshStart = async () => {
    if (
      !window.confirm(
        'Saare purane records aur dummy data delete ho jayenge. Kya aap sure hain? (Reset to 0)'
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const snap = await getDocs(collection(db, 'printRequests'));
      await Promise.all(
        snap.docs.map((d) => deleteDoc(doc(db, 'printRequests', d.id)))
      );
      setRequests([]);
      setShowSettings(false);
    } catch (err) {
      console.error(err);
      alert('Reset failed: ' + (err?.message || 'unknown error'));
    } finally {
      setResetting(false);
    }
  };

  /** Print a generated test page (reference site jaisa Test Print) */
  const handleTestPrint = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 849; // A4 ratio
    const ctx = canvas.getContext('2d');

    // White page + blue border
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 600, 849);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 24, 552, 801);

    ctx.fillStyle = '#0c2653';
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('QR PRINT SYSTEM', 300, 130);
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#2563eb';
    ctx.fillText('TEST PRINT', 300, 175);

    ctx.fillStyle = '#1f2937';
    ctx.font = '16px Arial';
    ctx.fillText(new Date().toLocaleString(), 300, 220);
    ctx.fillText('Agar ye page printer se nikal gaya,', 300, 300);
    ctx.fillText('to aapka auto-print system bilkul sahi kaam kar raha hai.', 300, 328);
    ctx.fillText('Server: Local Print Server (port 3000)', 300, 380);

    const dataUrl = canvas.toDataURL('image/png');
    if (!socketRef.current?.connected) {
      setPrintToast({
        ok: false,
        message: 'Print server offline hai - pehle server start karo.',
        at: Date.now(),
      });
      return;
    }
    socketRef.current.emit('print-job', {
      jobId: `test-${Date.now()}`,
      token: 'TEST',
      url: dataUrl,
      fileName: 'test-print.png',
      type: 'image',
      copies: 1,
      printer: printerName,
    });
    setPrintToast({ ok: true, message: 'Test print bheja gaya - printer dekho!', at: Date.now() });
  };

  // Loading auth state
  if (authLoading) {
    return (
      <div className="page">
        <h1>Print Counter</h1>
        <p className="subtitle">Loading...</p>
      </div>
    );
  }

  // Login gate (same account as Admin Dashboard)
  if (!user) {
    return (
      <div className="page">
        <h1>Print Counter</h1>
        <p className="subtitle">Sign in with your shop account to use the counter.</p>
        <form onSubmit={handleLogin} className="form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="input"
          />
          {authError && <p className="error">{authError}</p>}
          <button type="submit" className="submit-btn" disabled={signingIn}>
            {signingIn ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="scanner-link-row">
          <a className="scanner-link" href="/">Upload Page</a>
        </p>
      </div>
    );
  }

  const queueCount = requests.filter(
    (r) =>
      r.printStatus === 'WAITING_CONFIRMATION' ||
      r.printStatus === 'WAITING_OPERATOR_CONFIRMATION'
  ).length;

  // Live pending cash list — Firestore listener se real-time update hota hai
  const pendingCashOrders = requests.filter(
    (r) => r.printStatus === 'WAITING_OPERATOR_CONFIRMATION'
  );
  const pendingCashTotal = pendingCashOrders.reduce(
    (sum, r) => sum + (r.totalAmount || 0),
    0
  );

  return (
    <div className="counter-page">
      {/* Header */}
      <header className="counter-header">
        <div className="counter-brand">
          <img
            src={BRAND.logo}
            alt="Logo"
            className="counter-logo"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div>
            <h1>Print Counter</h1>
            <span className="counter-subtitle">
              {BRAND.shopName} — Live Print Dashboard
            </span>
          </div>
        </div>
        <div className="counter-header-actions">
          <span className={`server-badge ${serverConnected ? 'on' : 'off'}`}>
            Server: {serverConnected ? 'On' : 'Off'}
          </span>
          <span className="printer-badge">Printer: {printerName}</span>
          <button
            type="button"
            className={`counter-btn ${notificationPermission === 'granted' ? 'active' : ''}`}
            onClick={handleNotificationToggle}
          >
            {notificationPermission === 'granted' ? 'Notifications On' : 'Enable Notifications'}
          </button>
          <button type="button" className="counter-btn" onClick={() => setShowLedger(true)}>
            Payments
          </button>
          <button type="button" className="counter-btn" onClick={() => { setServerHostInput(serverHost); setShowSettings(true); }}>
            Settings
          </button>
          <button type="button" className="counter-btn" onClick={() => setShowControl(true)}>
            Control
          </button>
          <button type="button" className="counter-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="counter-main">
        {/* QR Code Section */}
        <div className="counter-qr-section">
          <h2>Scan to Print</h2>
          <div className="counter-qr-box">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Print QR Code" className="counter-qr-img" />
            ) : (
              <p className="counter-qr-text">Generating QR...</p>
            )}
          </div>
          <p className="counter-qr-text">Scan this QR to upload documents</p>
          <div className="counter-rates">
            <div className="rate-item">
              <span>B&amp;W:</span>
              <strong>{formatINR(10)}/page</strong>
            </div>
            <div className="rate-item">
              <span>Color:</span>
              <strong>{formatINR(15)}/page</strong>
            </div>
          </div>
        </div>

        {/* Live Queue */}
        <div className="counter-queue-section">
          <div className="queue-header">
            <h2>Live Print Queue</h2>
            <span className="queue-badge">{queueCount} pending</span>
          </div>

          {/* LIVE recovery bar — "Later" dabane par bhi order yahan se wapas aayega, refresh ki zaroorat nahi */}
          {pendingCashOrders.length > 0 && (
            <div className="pending-alert-bar" role="alert">
              <span className="pending-alert-icon">⚠</span>
              <span className="pending-alert-text">
                <strong>
                  {pendingCashOrders.length} cash order pending —{' '}
                  {formatINR(pendingCashTotal)} collect karna hai
                </strong>
                <span className="pending-alert-tokens">
                  {pendingCashOrders.slice(0, 3).map((r) => `#${r.token}`).join(', ')}
                  {pendingCashOrders.length > 3
                    ? ` +${pendingCashOrders.length - 3} more`
                    : ''}
                </span>
              </span>
              <button
                type="button"
                className="pending-alert-btn"
                onClick={() => setManualOrder(pendingCashOrders[0])}
              >
                Recover Now
              </button>
            </div>
          )}

          {loading && <p className="subtitle">Loading...</p>}
          {!loading && requests.length === 0 && (
            <div className="queue-empty">
              <p>No print orders yet</p>
              <p className="queue-empty-sub">New orders will appear here automatically</p>
            </div>
          )}

          <div className="queue-list">
            {requests.map((req) => (
              <div className={`queue-item ${req.printStatus?.toLowerCase()}`} key={req.id}>
                <div className="queue-item-main">
                  <span className="queue-item-title">
                    {req.pdfFile?.name || req.image1?.name || req.image2?.name || 'Document'}
                  </span>
                  <span className="queue-item-token">#{req.token}</span>
                  {req.customerName && (
                    <span className="queue-item-customer">{req.customerName}</span>
                  )}
                  <div className="queue-item-meta">
                    <span>
                      {req.totalPages || 1} page(s) x {req.copies || 1} copy
                    </span>
                    <span>{req.pageColor === 'bw' ? 'B&W' : 'Color'}</span>
                    <span>{formatINR(req.totalAmount || 0)}</span>
                  </div>
                </div>
                <div className="queue-item-status">
                  {req.printStatus === 'WAITING_CONFIRMATION' && (
                    <span className="status-badge printing">Auto-Print</span>
                  )}
                  {req.printStatus === 'WAITING_OPERATOR_CONFIRMATION' && (
                    <span className="status-badge manual">Cash Pending</span>
                  )}
                  {req.printStatus === 'COMPLETED' && (
                    <span className="status-badge completed">Printed</span>
                  )}
                  {req.printStatus === 'CANCELLED' && (
                    <span className="status-badge cancelled">Cancelled</span>
                  )}
                  {req.paymentMode === 'RAZORPAY' ? (
                    <span className="status-badge paid">Online Paid</span>
                  ) : (
                    <span className="status-badge cash">Cash</span>
                  )}
                </div>
                {/* Mistake recovery: bina refresh turant sudharo */}
                {(req.printStatus === 'WAITING_OPERATOR_CONFIRMATION' ||
                  (req.printStatus === 'CANCELLED' && req.paymentMode === 'RAZORPAY') ||
                  req.printStatus === 'COMPLETED' ||
                  req.printStatus === 'WAITING_CONFIRMATION') && (
                  <div className="queue-item-actions">
                    {req.printStatus === 'WAITING_OPERATOR_CONFIRMATION' && (
                      <button
                        type="button"
                        className="queue-action-btn cash"
                        onClick={() => confirmCash(req)}
                      >
                        ✓ Cash Received - Print
                      </button>
                    )}
                    {req.printStatus === 'WAITING_CONFIRMATION' && (
                      <button
                        type="button"
                        className="queue-action-btn printnow"
                        onClick={() => printOrderNow(req)}
                      >
                        ⚡ Print Now
                      </button>
                    )}
                    {req.printStatus === 'CANCELLED' && req.paymentMode === 'RAZORPAY' && (
                      <button
                        type="button"
                        className="queue-action-btn reprint"
                        onClick={() => reprintOrder(req)}
                      >
                        ↻ Print Now
                      </button>
                    )}
                    {req.printStatus === 'COMPLETED' && (
                      <button
                        type="button"
                        className="queue-action-btn revert"
                        onClick={() => revertCompleted(req)}
                        title="Galti se confirm/print ho gaya? Wapas pending karo"
                      >
                        ↩ Revoke
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Auto-Print Countdown Modal */}
      {autoPrintOrder && (
        <div className="modal-backdrop">
          <div className="modal countdown-modal">
            <div className="modal-icon success">✓</div>
            <h3>Online Payment Received!</h3>
            <p className="modal-subtitle">
              Order: <strong>#{autoPrintOrder.token}</strong>
            </p>
            <div className="modal-details">
              <div className="detail-row">
                <span>Document:</span>
                <strong>
                  {autoPrintOrder.pdfFile?.name ||
                    autoPrintOrder.image1?.name ||
                    'Document'}
                </strong>
              </div>
              <div className="detail-row">
                <span>Pages x Copies:</span>
                <strong>
                  {autoPrintOrder.totalPages || 1} x {autoPrintOrder.copies || 1}
                </strong>
              </div>
              <div className="detail-row">
                <span>Amount:</span>
                <strong className="amount">
                  {formatINR(autoPrintOrder.totalAmount || 0)}
                </strong>
              </div>
              <div className="detail-row">
                <span>Printer:</span>
                <strong>{printerName}</strong>
              </div>
            </div>
            <div className="countdown-display">
              <span className="countdown-number">{countdown}</span>
              <span className="countdown-label">seconds</span>
            </div>
            <p className="modal-hint">Document will open for printing automatically</p>
            <div className="modal-actions">
              <button type="button" className="action-btn danger" onClick={handleCancelAutoPrint}>
                Stop / Cancel
              </button>
              <button
                type="button"
                className="action-btn primary"
                onClick={handleImmediatePrint}
              >
                Print Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Cash Confirmation Modal */}
      {manualOrder && (
        <div className="modal-backdrop">
          <div className="modal cash-modal">
            <div className="modal-icon warning">₹</div>
            <h3>Collect Cash at Counter</h3>
            <p className="modal-subtitle">
              Order: <strong>#{manualOrder.token}</strong>
            </p>
            <div className="modal-details cash-details">
              <div className="detail-row">
                <span>Customer:</span>
                <strong>{manualOrder.customerName || '-'}</strong>
              </div>
              <div className="detail-row">
                <span>Document:</span>
                <strong>
                  {manualOrder.pdfFile?.name ||
                    manualOrder.image1?.name ||
                    'Document'}
                </strong>
              </div>
              <div className="detail-row">
                <span>Pages x Copies:</span>
                <strong>
                  {manualOrder.totalPages || 1} x {manualOrder.copies || 1}
                </strong>
              </div>
              <div className="detail-row total">
                <span>Cash to collect:</span>
                <strong className="amount">{formatINR(manualOrder.totalAmount || 0)}</strong>
              </div>
            </div>
            <div className="warning-box">
              <strong>Note:</strong> This will not print until you confirm cash received.
            </div>
            <div className="modal-actions">
              <button type="button" className="action-btn secondary" onClick={handleLaterManual}>
                Later
              </button>
              <button type="button" className="action-btn success" onClick={handleConfirmManual}>
                Cash Received - Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Ledger Modal */}
      {showLedger && (
        <div className="modal-backdrop" onClick={() => setShowLedger(false)}>
          <div className="modal ledger-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Payment Record (48 Hours)</h3>
              <button type="button" className="modal-close" onClick={() => setShowLedger(false)}>
                ×
              </button>
            </div>

            {ledgerData && (
              <>
                <div className="ledger-stats">
                  <div className="ledger-stat">
                    <span className="ledger-stat-label">Active (48h)</span>
                    <span className="ledger-stat-value">{formatINR(ledgerData.activeTotal)}</span>
                    <span className="ledger-stat-count">
                      {ledgerData.activeCount} transactions
                    </span>
                  </div>
                  <div className="ledger-stat">
                    <span className="ledger-stat-label">Carried Over</span>
                    <span className="ledger-stat-value">
                      {formatINR(ledgerData.archivedTotal)}
                    </span>
                    <span className="ledger-stat-count">
                      {ledgerData.archivedCount} old transactions
                    </span>
                  </div>
                  <div className="ledger-stat grand">
                    <span className="ledger-stat-label">Grand Total</span>
                    <span className="ledger-stat-value">
                      {formatINR(ledgerData.grandTotal)}
                    </span>
                    <span className="ledger-stat-count">All time</span>
                  </div>
                </div>

                <div className="ledger-table-wrap">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Token</th>
                        <th>Amount</th>
                        <th>Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerData.transactions.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="ledger-empty">
                            No transactions in last 48 hours
                          </td>
                        </tr>
                      ) : (
                        ledgerData.transactions.map((t) => (
                          <tr key={t.id}>
                            <td>{formatDate(t.uploadedAt)}</td>
                            <td>#{t.token}</td>
                            <td>{formatINR(t.totalAmount || 0)}</td>
                            <td>{t.paymentMode === 'RAZORPAY' ? 'Online' : 'Cash'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>सिस्टम सेटिंग्स</h3>
              <button type="button" className="modal-close" onClick={() => setShowSettings(false)}>
                ×
              </button>
            </div>
            <div className="setting-group">
              <label className="setting-label">
                सक्रिय प्रिंटर चुनें (इस PC पर इंस्टॉल्ड):
                {printersLoading && <span className="setting-hint"> लोड हो रहा है...</span>}
              </label>
              {printerList.length > 0 ? (
                <div className="printer-select-row">
                  <select
                    className="input"
                    value={printerName}
                    onChange={(e) => setPrinterName(e.target.value)}
                  >
                    {printerList.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}{p.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="counter-btn"
                    title="Printer list refresh karo"
                    onClick={fetchPrinters}
                  >
                    ↻
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  className="input"
                  value={printerName}
                  onChange={(e) => setPrinterName(e.target.value)}
                  placeholder="Printer name (उदा. Epson L3250)"
                />
              )}
              {!serverConnected && (
                <p className="setting-hint">
                  Print server offline hai — list ke liye server start karo, abhi manually naam daal sakte ho.
                </p>
              )}
            </div>
            <div className="setting-group">
              <label className="setting-label">ऑटो-प्रिंट काउंटडाउन समय (सेकंड):</label>
              <input
                type="number"
                className="input"
                value={countdownSeconds}
                onChange={(e) =>
                  setCountdownSeconds(
                    Math.min(30, Math.max(2, +e.target.value || 5))
                  )
                }
                min="2"
                max="30"
              />
            </div>
            <div className="setting-group">
              <label className="setting-label">लोकल नेटवर्क IP (यदि आवश्यक हो तो बदलें):</label>
              <input
                type="text"
                className="input"
                value={serverHostInput}
                onChange={(e) => setServerHostInput(e.target.value)}
                placeholder="उदा. 192.168.1.100"
              />
            </div>
            <div className="setting-group">
              <label className="setting-label">डमी डेटा साफ करें व नई शुरुआत (Fresh Start):</label>
              <button
                type="button"
                className="action-btn danger"
                onClick={handleFreshStart}
                disabled={resetting}
                style={{ width: '100%' }}
              >
                {resetting ? 'Resetting...' : 'सभी पुराने रिकॉर्ड व डमी डेटा हटाएं (Reset to 0)'}
              </button>
            </div>
            <div className="modal-actions">
              <button type="button" className="action-btn secondary" onClick={() => setShowSettings(false)}>
                बंद करें
              </button>
              <button
                type="button"
                className="submit-btn"
                onClick={() => {
                  setPrinterName(printerName);
                  try { localStorage.setItem('qrPrinterName', printerName); } catch {}
                  setServerHost(serverHostInput.trim() || 'localhost');
                  try { localStorage.setItem('qrPrintServerHost', serverHostInput.trim() || 'localhost'); } catch {}
                  setShowSettings(false);
                }}
              >
                सेव करें
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Control Modal — Remote Control Center */}
      {showControl && (
        <div className="modal-backdrop" onClick={() => setShowControl(false)}>
          <div className="modal control-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>सॉफ्टवेयर व रिमोट कंट्रोल सेंटर</h3>
              <button type="button" className="modal-close" onClick={() => setShowControl(false)}>
                ×
              </button>
            </div>
            <div className="control-grid">
              <div className="control-item">
                <span className="control-label">Cloud Status</span>
                <span className="control-value active">Connected</span>
              </div>
              <div className="control-item">
                <span className="control-label">Print Server</span>
                <span
                  className={`control-value ${serverConnected ? 'active' : 'inactive'}`}
                >
                  {serverConnected ? 'Connected' : 'Offline'}
                </span>
              </div>
              <div className="control-item">
                <span className="control-label">सक्रिय प्रिंटर</span>
                <span className="control-value">{printerName}</span>
              </div>
              <div className="control-item">
                <span className="control-label">Auto-Print</span>
                <span className="control-value">{countdownSeconds}s countdown</span>
              </div>
            </div>

            {/* 1. Dukandar Mobile Remote (Shop WiFi) */}
            <div className="remote-section">
              <h4 className="remote-title">📱 1. दुकानदार मोबाइल रिमोट (Shop WiFi)</h4>
              <p className="remote-desc">
                दुकान में कहीं भी रहकर अपने मोबाइल पर काउंटर खोलें — QR स्कैन करो या लिंक कॉपी करो:
              </p>
              <div className="remote-qr-row">
                {counterQrUrl ? (
                  <img src={counterQrUrl} alt="Counter QR" className="remote-qr" />
                ) : (
                  <div className="remote-qr remote-qr-placeholder">QR...</div>
                )}
                <div className="remote-url-col">
                  <div className="remote-url-row">
                    <input
                      type="text"
                      className="input"
                      readOnly
                      value={`${window.location.origin}/counter`}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      className="counter-btn"
                      onClick={() => copyToClipboard(`${window.location.origin}/counter`, 'Counter link')}
                    >
                      कॉपी
                    </button>
                  </div>
                  <p className="setting-hint">
                    मोबाइल पर print server connect करने के लिए Settings में यह IP डालें: <strong>{lanIP || serverHost}</strong>
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Customer online upload link */}
            <div className="remote-section">
              <h4 className="remote-title">🌐 2. ग्राहक 4G/5G ऑनलाइन अपलोड लिंक</h4>
              <p className="remote-desc">
                ग्राहक अपने मोबाइल से इस लिंक पर फाइल भेजेंगे और UPI से भुगतान करेंगे:
              </p>
              <div className="remote-url-row">
                <input
                  type="text"
                  className="input"
                  readOnly
                  value={window.location.origin}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  className="counter-btn"
                  onClick={() => copyToClipboard(window.location.origin, 'Upload link')}
                >
                  कॉपी
                </button>
              </div>
              <div className="remote-btn-row">
                <button
                  type="button"
                  className="counter-btn wa"
                  onClick={() =>
                    window.open(
                      `https://wa.me/?text=${encodeURIComponent(
                        `अपने दस्तावेज़ यहाँ से प्रिंट करें: ${window.location.origin}`
                      )}`,
                      '_blank',
                      'noopener'
                    )
                  }
                >
                  WhatsApp पर भेजें
                </button>
                <button type="button" className="counter-btn" onClick={openPoster}>
                  बड़ा QR पोस्टर प्रिंट करें (A4 Standee)
                </button>
              </div>
            </div>

            {/* 3. Hardware & sound test */}
            <div className="remote-section">
              <h4 className="remote-title">🛠️ 3. हार्डवेयर और साउंड टेस्ट</h4>
              <div className="control-actions">
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => {
                    playOrderChime();
                    sendDesktopNotification('Test', 'Sound test successful!', 'test-sound');
                  }}
                >
                  🔔 Test Sound
                </button>
                <button type="button" className="action-btn" onClick={handleTestPrint}>
                  🖨️ Test Print
                </button>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => {
                    if (socketRef.current?.connected) {
                      setPrintToast({ ok: true, message: 'Print server already connected ✓', at: Date.now() });
                    } else {
                      socketRef.current?.connect();
                      setPrintToast({ ok: false, message: 'Reconnecting to print server (port 3000)...', at: Date.now() });
                    }
                  }}
                >
                  {serverConnected ? 'Server: On' : 'Reconnect Server'}
                </button>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => window.location.reload()}
                >
                  Refresh
                </button>
                <button type="button" className="action-btn" onClick={toggleFullscreen}>
                  ⛶ Fullscreen
                </button>
              </div>
            </div>
            <p className="control-upload-url">Upload URL: {window.location.origin}</p>
          </div>
        </div>
      )}

      {/* Undo toast — galti turant sudharo (bina refresh) */}
      {undoToast && (
        <div className="undo-toast">
          <span className="undo-toast-text">{undoToast.message}</span>
          <button
            type="button"
            className="undo-toast-btn"
            onClick={() => {
              const fn = undoToast.undo;
              hideUndoToast();
              fn?.();
            }}
          >
            ↩ Undo
          </button>
          <button type="button" className="toast-close" onClick={hideUndoToast}>
            ×
          </button>
        </div>
      )}

      {/* Print status toast */}
      {printToast && (
        <div className={`print-toast ${printToast.ok ? 'success' : 'error'}`}>
          <span>{printToast.message}</span>
          <button type="button" className="toast-close" onClick={() => setPrintToast(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
