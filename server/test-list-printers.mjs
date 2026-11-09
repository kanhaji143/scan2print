// list-printers socket event test
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', { timeout: 5000 });

const timeout = setTimeout(() => {
  console.log('TIMEOUT: 20s me response nahi mila');
  process.exit(1);
}, 20000);

socket.on('connect', () => {
  console.log('CONNECTED:', socket.id);
  socket.emit('list-printers', (res) => {
    console.log('LIST-PRINTERS:', JSON.stringify(res, null, 2));
    clearTimeout(timeout);
    process.exit(res?.ok ? 0 : 1);
  });
});

socket.on('connect_error', (e) => {
  console.log('CONNECT_ERROR:', e.message);
  process.exit(1);
});
