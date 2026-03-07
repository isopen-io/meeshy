const { io } = require('socket.io-client');
const https = require('https');

const GATEWAY = 'https://192.168.1.62:3000';

async function main() {
  // 1. Login
  const agent = new https.Agent({ rejectUnauthorized: false });
  
  const resRaw = await fetch(`${GATEWAY}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'atabeth', password: 'pD5p1ir9uxLUf2X2FpNE' }),
    agent,
  });
  const json = await resRaw.json();
  const token = json.data?.token;
  console.log('[LOGIN]', token ? 'OK' : 'FAIL');

  if (!token) {
    console.error('[ERROR] Login failed:', json);
    process.exit(1);
  }

  // 2. Connect WebSocket
  const socket = io(GATEWAY, {
    transports: ['websocket'],
    auth: { token },
    agent,
    rejectUnauthorized: false,
  });

  const CONV_ID = '699f75e6b5e699f0ec4f31fc';

  socket.on('connect', () => {
    console.log('[WS] Connected', socket.id);

    socket.emit('conversation:join', { conversationId: CONV_ID }, (ack) => {
      console.log('[WS] Join ack:', JSON.stringify(ack));
    });

    setTimeout(() => {
      console.log('[WS] Sending test message...');
      socket.emit('message:send', {
        conversationId: CONV_ID,
        content: "J'ai eu une super idée nouvelle pour améliorer la plateforme aujourd'hui!",
        messageType: 'text',
      }, (ack) => {
        console.log('[WS] Send ack:', JSON.stringify(ack));
      });
    }, 1000);
  });

  socket.on('message:new', (msg) => {
    console.log('[MSG:NEW]', JSON.stringify({
      id: msg.id,
      senderId: msg.senderId,
      content: msg.content?.substring(0, 200),
      source: msg.metadata?.source,
    }, null, 2));
  });

  socket.on('connect_error', (err) => {
    console.error('[WS] Connect Error:', err.message);
  });

  socket.on('error', (err) => {
    console.error('[WS] Error:', err);
  });

  // Timeout après 30s
  setTimeout(() => {
    console.log('[TIMEOUT] Fermeture');
    socket.disconnect();
    process.exit(0);
  }, 30000);
}

main().catch(console.error);
