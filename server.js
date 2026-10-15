const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6, pingInterval: 25000, pingTimeout: 20000 });
const PORT = Number(process.env.PORT || 3000);
const LOCUTOR_USER = process.env.LOCUTOR_USER || 'admin';
const LOCUTOR_PASSWORD = process.env.LOCUTOR_PASSWORD;
const MAX_TEXT = 240;
const MAX_HISTORY = 150;
let hostSocketId = null;
let isLive = false;
const listeners = new Set();
const chatHistory = [];
const requestHistory = [];

app.disable('x-powered-by');
app.use((req, res, next) => {
  if (['/server.js', '/package.json', '/README.md'].includes(req.path)) return res.sendStatus(404);
  next();
});
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));
app.get('/health', (_req, res) => res.json({ ok: true, hostOnline: Boolean(hostSocketId), listeners: listeners.size }));

function cleanText(value, max = MAX_TEXT) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}
function hostEmit(event, payload) {
  if (hostSocketId) io.to(hostSocketId).emit(event, payload);
}
function hostOffline() {
  if (!hostSocketId) return;
  const previous = hostSocketId;
  hostSocketId = null;
  isLive = false;
  io.emit('radio:host-offline', { hostId: previous });
}

io.on('connection', socket => {
  socket.data.isHost = false;
  socket.data.isListener = false;

  socket.on('listener:ready', () => {
    if (socket.data.isHost) return;
    socket.data.isListener = true;
    listeners.add(socket.id);
    socket.emit('radio:status', { hostOnline: Boolean(hostSocketId), isLive });
    socket.emit('chat:history', { chat: chatHistory, requests: requestHistory });
    if (hostSocketId) {
      socket.emit('radio:host-online', { hostId: hostSocketId });
      if (isLive) socket.emit('radio:live');
      hostEmit('listener:ready', { listenerId: socket.id });
    }
  });

  socket.on('host:authenticate', (credentials, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const username = cleanText(credentials?.username, 80);
    const password = String(credentials?.password ?? '');
    if (!LOCUTOR_PASSWORD) return reply({ ok: false, message: 'Configure LOCUTOR_PASSWORD nas variáveis do servidor antes de liberar o painel.' });
    if (username !== LOCUTOR_USER || password !== LOCUTOR_PASSWORD) return reply({ ok: false, message: 'Usuário ou senha incorretos.' });
    if (hostSocketId && hostSocketId !== socket.id) return reply({ ok: false, message: 'Já existe um locutor conectado. Encerre a sessão anterior primeiro.' });
    socket.data.isHost = true;
    socket.data.isListener = false;
    listeners.delete(socket.id);
    hostSocketId = socket.id;
    isLive = false;
    reply({ ok: true });
    socket.emit('host:authenticated', { hostId: socket.id });
    io.emit('radio:host-online', { hostId: socket.id });
    for (const listenerId of listeners) socket.emit('listener:ready', { listenerId });
  });

  socket.on('host:request-listeners', () => {
    if (!socket.data.isHost || hostSocketId !== socket.id) return;
    for (const listenerId of listeners) socket.emit('listener:ready', { listenerId });
  });

  socket.on('host:program-config', data => {
    if (!socket.data.isHost || hostSocketId !== socket.id) return;
    const locutorName = cleanText(data?.locutorName, 100);
    const showTitle = cleanText(data?.showTitle, 120);
    io.emit('radio:program-config', { locutorName, showTitle });
  });

  socket.on('host:now-playing', data => {
    if (!socket.data.isHost || hostSocketId !== socket.id) return;
    const name = cleanText(data?.name, 160);
    if (name) io.emit('radio:now-playing', { name });
  });

  socket.on('host:go-live', () => {
    if (!socket.data.isHost || hostSocketId !== socket.id) return;
    isLive = true;
    io.emit('radio:live');
  });
  socket.on('host:stop-live', () => {
    if (!socket.data.isHost || hostSocketId !== socket.id) return;
    isLive = false;
    io.emit('radio:stopped');
  });

  socket.on('host:logout', () => {
    if (!socket.data.isHost) return;
    socket.data.isHost = false;
    hostOffline();
    socket.data.isListener = true;
    listeners.add(socket.id);
    socket.emit('radio:status', { hostOnline: false, isLive: false });
  });

  socket.on('webrtc:offer', data => {
    if (!socket.data.isHost || !listeners.has(data?.targetId) || !data?.sdp) return;
    io.to(data.targetId).emit('webrtc:offer', { hostId: socket.id, sdp: data.sdp });
  });
  socket.on('webrtc:answer', data => {
    if (!socket.data.isListener || !data?.targetId || !data?.sdp || data.targetId !== hostSocketId) return;
    io.to(data.targetId).emit('webrtc:answer', { fromId: socket.id, sdp: data.sdp });
  });
  socket.on('webrtc:ice', data => {
    if (!data?.targetId || !data?.candidate) return;
    if (socket.data.isHost && listeners.has(data.targetId)) io.to(data.targetId).emit('webrtc:ice', { fromId: socket.id, candidate: data.candidate });
    else if (socket.data.isListener && data.targetId === hostSocketId) io.to(data.targetId).emit('webrtc:ice', { fromId: socket.id, candidate: data.candidate });
  });

  socket.on('chat:send', data => {
    const name = cleanText(data?.name, 48);
    const msg = cleanText(data?.msg, MAX_TEXT);
    if (!name || !msg) return;
    const item = { name, msg, createdAt: new Date().toISOString() };
    chatHistory.push(item);
    if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
    io.emit('chat:new', item);
  });

  socket.on('request:send', data => {
    const name = cleanText(data?.name, 48);
    const city = cleanText(data?.city, 60);
    const song = cleanText(data?.song, 100);
    const msg = cleanText(data?.msg, MAX_TEXT);
    if (!name || !song) return;
    const item = { type: 'request', name: '🎵 Pedido Musical (' + name + ')', msg: song + (city ? ' (' + city + ')' : '') + (msg ? ' — ' + msg : ''), createdAt: new Date().toISOString() };
    requestHistory.push(item);
    if (requestHistory.length > MAX_HISTORY) requestHistory.shift();
    io.emit('request:new', item);
  });

  socket.on('disconnect', () => {
    listeners.delete(socket.id);
    if (socket.data.isHost && hostSocketId === socket.id) hostOffline();
    if (hostSocketId) hostEmit('listener:left', { listenerId: socket.id });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Gazeta FM server listening on port ' + PORT);
  if (!LOCUTOR_PASSWORD) console.warn('Configure LOCUTOR_PASSWORD para habilitar o login do locutor.');
});
