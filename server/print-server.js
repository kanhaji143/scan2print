/**
 * QR Print System - Local Print Server
 * =====================================
 * Ye server aapke PC par chalta hai aur counter page se Socket.IO ke
 * through connect karta hai. Jab koi order print hona hota hai, counter
 * page file ka URL bhejta hai aur ye server usse download karke printer
 * par bhej deta hai (Epal L3250 ya koi bhi default printer).
 *
 * Start:  node server/print-server.js
 * Test:   browser me http://localhost:3000/health kholo
 *
 * PDF auto-print ke liye SumatraPDF install karo (free, ~5MB):
 *   https://www.sumatrapdfreader.org/download-free-pdf-viewer
 * Images (JPG/PNG) bina kisi extra software ke print ho jaate hain.
 */

import { Server } from 'socket.io';
import { createServer } from 'http';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PORT = process.env.PRINT_SERVER_PORT || 3000;

// ------------------------------------------------------------------
// HTTP + Socket.IO server (CORS open for localhost browser clients)
// ------------------------------------------------------------------
const httpServer = createServer();

const io = new Server(httpServer, {
  cors: { origin: true, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 5e6,
});

// Chrome Private Network Access preflight ke liye zaroori
io.engine.on('headers', (headers) => {
  headers['Access-Control-Allow-Private-Network'] = 'true';
});

// /health endpoint (server status check karne ke liye)
httpServer.on('request', (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(
      JSON.stringify({
        ok: true,
        printer: getDefaultPrinterName(),
        os: os.platform(),
        sumatra: findSumatra() ? 'found' : 'missing (PDF auto-print off)',
        lanIP: getLanIP(),
        uptime: Math.round(process.uptime()),
      })
    );
  }
});

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function findSumatra() {
  const candidates = [
    process.env.SUMATRA_PATH,
    'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
    'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'SumatraPDF', 'SumatraPDF.exe'),
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function getDefaultPrinterName() {
  // Windows: default printer read via wmic is slow, so keep it simple.
  return process.env.DEFAULT_PRINTER || 'Windows Default Printer';
}

/** Is PC par installed printers ki list (PowerShell Get-Printer) */
function listPrinters() {
  return new Promise((resolve) => {
    const ps = 'Get-Printer | ForEach-Object { "{0}|{1}" -f $_.Name, $_.Default }';
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { windowsHide: true, timeout: 20000 },
      (err, stdout) => {
        if (err) {
          resolve({ ok: false, printers: [], defaultPrinter: '', error: err.message });
          return;
        }
        const printers = String(stdout || '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const idx = line.lastIndexOf('|');
            const name = idx === -1 ? line : line.slice(0, idx);
            const isDefault = idx === -1 ? false : line.slice(idx + 1).trim() === 'True';
            return { name, isDefault };
          });
        resolve({
          ok: true,
          printers,
          defaultPrinter: printers.find((p) => p.isDefault)?.name || '',
          lanIP: getLanIP(),
        });
      }
    );
  });
}

/** Is PC ka LAN IP (mobile remote ke liye) */
function getLanIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

/** Download a file to temp dir, returns local path */
async function downloadFile(url, suggestedName) {
  // Data URLs (test print page) ko direct decode karo
  if (url.startsWith('data:')) {
    let ext = suggestedName ? path.extname(suggestedName) : '';
    if (!ext) {
      const mime = (url.slice(5).match(/^([^;,]+)/) || [])[1] || 'image/png';
      ext = '.' + (mime.split('/')[1] || 'bin');
    }
    const dataFile = path.join(
      os.tmpdir(),
      `qrprint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
    );
    const b64 = url.slice(url.indexOf(',') + 1);
    fs.writeFileSync(dataFile, Buffer.from(b64, 'base64'));
    return dataFile;
  }

  let ext = suggestedName ? path.extname(suggestedName) : '';
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Download failed (HTTP ${res.status}). File link expired ho sakta hai.`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  if (!ext) {
    try {
      ext = path.extname(new URL(url).pathname);
    } catch {
      /* ignore */
    }
  }
  if (!ext) ext = '.bin';

  const file = path.join(os.tmpdir(), `qrprint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  fs.writeFileSync(file, buf);
  return file;
}

/** Print an image — SumatraPDF ho to selected printer par, warna default printer (Shell verb) */
function printImage(file, printerName) {
  const sumatra = findSumatra();
  if (sumatra) {
    // SumatraPDF images (JPG/PNG/etc.) bhi print karta hai aur -print-to se
    // koi bhi specific printer choose kar sakta hai.
    return new Promise((resolve, reject) => {
      const args =
        printerName && printerName !== 'Windows Default Printer' && printerName !== 'Default Printer'
          ? ['-print-to', printerName]
          : ['-print-to-default'];
      execFile(
        sumatra,
        [...args, '-silent', '-exit-when-done', file],
        { windowsHide: true, timeout: 90000 },
        (err, _stdout, stderr) => {
          if (err) reject(new Error(stderr || err.message));
          else resolve();
        }
      );
    });
  }

  // Fallback: Shell "print" verb — ye sirf DEFAULT printer par jaata hai.
  return new Promise((resolve, reject) => {
    const ps = [
      "$ErrorActionPreference = 'Stop'",
      `$file = '${file.replace(/'/g, "''")}'`,
      "$sh = New-Object -ComObject Shell.Application",
      '$folder = $sh.Namespace((Split-Path $file))',
      '$item = $folder.ParseName((Split-Path $file -Leaf))',
      "$item.InvokeVerb('print')",
    ].join('; ');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { windowsHide: true, timeout: 45000 },
      (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      }
    );
  });
}

/** Print a PDF using SumatraPDF (silent, no dialogs) */
function printPdf(file, printerName) {
  const sumatra = findSumatra();
  if (!sumatra) {
    return Promise.reject(
      new Error(
        'PDF auto-print ke liye SumatraPDF install karo: https://www.sumatrapdfreader.org/download-free-pdf-viewer'
      )
    );
  }
  // Printer name validate karo — installed nahi hai to default printer use karo
  let resolvedPrinter = printerName;
  const installed = listPrinters();
  if (installed.ok && installed.printers.length) {
    const match = installed.printers.find((p) => p.name === printerName);
    if (!match) {
      resolvedPrinter = installed.defaultPrinter || '';
    }
  }
  const useDefault =
    !resolvedPrinter ||
    resolvedPrinter === 'Windows Default Printer' ||
    resolvedPrinter === 'Default Printer' ||
    resolvedPrinter === 'Default';
  const args = useDefault
    ? ['-print-to-default']
    : ['-print-to', resolvedPrinter];
  return new Promise((resolve, reject) => {
    execFile(
      sumatra,
      [...args, '-silent', '-exit-when-done', file],
      { windowsHide: true, timeout: 90000 },
      (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      }
    );
  });
}

/** Safe temp cleanup after print spooler has picked the file */
function cleanupLater(file, delayMs = 20000) {
  setTimeout(() => {
    try {
      fs.unlink(file, () => {});
    } catch {
      /* ignore */
    }
  }, delayMs);
}

async function handlePrintJob(job, emit) {
  const { jobId, token = '', url, fileName = 'document', type = 'image', copies = 1, printer, dryRun } = job;

  if (!url) {
    emit('print-status', { jobId, ok: false, message: 'File URL missing.' });
    return;
  }

  console.log(`\n[${new Date().toLocaleTimeString()}] Print job #${token || jobId}`);
  console.log(`  File: ${fileName} (${type}) x${copies}`);

  if (dryRun) {
    console.log('  [DRY RUN] print skipped, sirf download test hoga.');
  }

  try {
    const localFile = await downloadFile(url, fileName);
    console.log(`  Downloaded: ${localFile}`);

    if (!dryRun) {
      for (let i = 0; i < Math.max(1, Math.min(20, copies)); i++) {
        if (type === 'pdf') {
          await printPdf(localFile, printer);
        } else {
          await printImage(localFile, printer);
        }
        console.log(`  Copy ${i + 1}/${copies} printer ko bheji.`);
      }
    }

    cleanupLater(localFile);
    console.log('  DONE ✓');
    emit('print-status', {
      jobId,
      ok: true,
      message: dryRun
        ? `Dry run OK - file download hui (${fileName}). Print skip kiya.`
        : `Print bhej diya gaya: ${fileName} x${copies}`,
    });
  } catch (err) {
    console.error('  FAILED ✗', err.message);
    emit('print-status', {
      jobId,
      ok: false,
      message: err.message || 'Print failed. Counter se manually print karo.',
    });
  }
}

// ------------------------------------------------------------------
// Socket.IO events
// ------------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`\n[+] Counter page connected: ${socket.handshake.headers.origin || 'unknown'} (${socket.id})`);

  socket.emit('hello', {
    printer: getDefaultPrinterName(),
    sumatra: findSumatra() ? 'found' : 'missing',
    lanIP: getLanIP(),
    version: '1.1.0',
  });

  socket.on('get-status', (ack) => {
    if (typeof ack === 'function') {
      ack({ ok: true, printer: getDefaultPrinterName(), sumatra: findSumatra() ? 'found' : 'missing' });
    }
  });

  // Installed printers ki list bhejo (Counter ke dropdown ke liye)
  socket.on('list-printers', async (ack) => {
    const result = await listPrinters();
    if (typeof ack === 'function') ack(result);
    else socket.emit('printers', result);
  });

  socket.on('print-job', (job) => {
    handlePrintJob(job || {}, (evt, data) => socket.emit(evt, data));
  });

  socket.on('disconnect', (reason) => {
    console.log(`[-] Counter disconnected: ${reason}`);
  });
});

httpServer.listen(PORT, () => {
  console.log('==============================================');
  console.log('  QR PRINT SERVER chal raha hai ✓');
  console.log(`  Port: ${PORT}  |  http://localhost:${PORT}/health`);
  console.log(`  Printer: ${getDefaultPrinterName()}`);
  console.log(`  SumatraPDF: ${findSumatra() ? 'mil gaya (PDF OK)' : 'NAHI MILA (sirf images auto-print)'}`);
  console.log('  Ye window band mat karna jab tak printing chahiye.');
  console.log('==============================================');
});
