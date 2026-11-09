// Quick test: list-printers PowerShell command jo print-server use karta hai
import { execFile } from 'child_process';

const ps = 'Get-Printer | ForEach-Object { "{0}|{1}" -f $_.Name, $_.Default }';
execFile(
  'powershell.exe',
  ['-NoProfile', '-NonInteractive', '-Command', ps],
  { windowsHide: true, timeout: 20000 },
  (err, stdout) => {
    if (err) {
      console.log('ERR:', err.message);
      process.exit(1);
    }
    const printers = String(stdout || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.lastIndexOf('|');
        return { name: line.slice(0, idx), isDefault: line.slice(idx + 1).trim() === 'True' };
      });
    console.log(JSON.stringify(printers, null, 2));
  }
);
