// Print server test client (dry run - koi print nahi hoga)
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', { timeout: 5000 });

const timeout = setTimeout(() => {
  console.log('TIMEOUT: 20s me response nahi mila');
  process.exit(1);
}, 20000);

socket.on('connect', () => {
  console.log('CONNECTED:', socket.id);
  socket.emit('print-job', {
    jobId: 'test-123',
    token: 'TKN-TEST',
    // Chhota test image (200x200 PNG)
    url: 'https://picsum.photos/200',
    fileName: 'test.png',
    type: 'image',
    copies: 1,
    dryRun: true,
  });
});

socket.on('hello', (d) => console.log('HELLO:', JSON.stringify(d)));

socket.on('print-status', (d) => {
  console.log('PRINT-STATUS:', JSON.stringify(d));
  clearTimeout(timeout);
  process.exit(d.ok ? 0 : 1);
});
