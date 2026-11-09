# QR Print Server (Local Automatic Printing)

Ye local server aapke shop PC par chalta hai aur automatic printing karta hai — bilkul reference site (मौर्या ऑनलाइन सेंटर) jaisa.

## Setup (sirf ek baar)

1. **SumatraPDF install karo** (PDF auto-print ke liye, free ~5MB):
   https://www.sumatrapdfreader.org/download-free-pdf-viewer
   - Default location mein install karo (`C:\Program Files\SumatraPDF\`)
   - Images (JPG/PNG) bina iske bhi print ho jaate hain

2. **Server start karo** (project folder mein):
   ```
   node server/print-server.js
   ```
   - Pehli baar Windows Firewall puchega → **Allow** karo
   - Ye window/terminal band mat karna

3. **Counter page kholo** (`/counter`) aur login karo
   - Control modal mein "Server Status: Connected" dikhega
   - Ab har online-paid order auto-print hoga (countdown ke baad)

## Kaise kaam karta hai

```
Customer QR scan → Upload → Razorpay payment → Order Firebase mein
     ↓
Counter page (browser) order dikha + countdown 5 sec
     ↓
Countdown khatam → file URL local server ko bheja (Socket.IO, port 3000)
     ↓
Server file download karta hai → Windows default printer par print
     ↓
Counter par green toast: "Print bhej diya gaya ✓"
```

- **Cash order:** "Cash Received - Print" click karne par bhi waise hi print hota hai
- **Server band ho to:** counter khud document khol dega, operator Ctrl+P se print kar sakta hai (fallback)

## Health check

Browser mein kholo: `http://localhost:3000/health`

## Test mode

Bina print kiye test karne ke liye counter page ke browser console mein:
```js
// Test sirf download tak (print nahi hoga)
```
Ya server start karte waqt:
```
node server/print-server.js
```
aur counter se order bhejte waqt `dryRun: true` bhejo (code mein already supported).

## Printer badalna

Windows Settings → Printers → jo printer default hai wahi use hoga.
Specific printer ke liye `DEFAULT_PRINTER` environment variable set karo:
```
set DEFAULT_PRINTER=Epson L3250 && node server/print-server.js
```
