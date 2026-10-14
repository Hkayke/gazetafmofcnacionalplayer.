const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-session-secret-before-deploying';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Gazeta@2026Change';
const MUSIC_DIR = path.join(__dirname, 'public', 'music');
const AUTO_DJ_RESCAN_MS = 5000;
const activeListeners = new Set();
let musicLibrary = [];
let currentTrackIndex = 0;
let autoDjPaused = false;
let autoDjRunning = false;
let currentTrackStream = null;

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return { users: [], messages: [], requests: [], station: { online: false, nowPlaying: 'Programação automática GAZETA FM', dj: null } }; }
}
let db = loadData();
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
async function ensureAdmin() {
  const exists = db.users.some(u => u.username.toLowerCase() === ADMIN_USER.toLowerCase());
  if (!exists) {
    db.users.push({ id: cryptoId(), username: ADMIN_USER, email: '', passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12), role: 'admin', status: 'approved', createdAt: new Date().toISOString() });
    saveData();
    console.log(`Conta principal criada: ${ADMIN_USER}. Configure uma senha forte por variável de ambiente.`);
  }
}
function cryptoId() { return require('crypto').randomBytes(12).toString('hex'); }
function publicUser(u) { return { id: u.id, username: u.username, email: u.email, role: u.role, status: u.status, createdAt: u.createdAt }; }
function currentUser(req) { return db.users.find(u => u.id === req.session.userId); }
function requireLogin(req, res, next) { const u = currentUser(req); if (!u) return res.status(401).json({ error: 'Entre na sua conta para continuar.' }); if (u.status !== 'approved') return res.status(403).json({ error: 'Sua conta ainda não foi aprovada.' }); req.user = u; next(); }
function requireStaff(req, res, next) { requireLogin(req, res, () => { if (!['admin', 'director', 'broadcaster'].includes(req.user.role)) return res.status(403).json({ error: 'Acesso exclusivo à equipe da rádio.' }); next(); }); }
function requireManagement(req, res, next) { requireLogin(req, res, () => { if (!['admin', 'director'].includes(req.user.role)) return res.status(403).json({ error: 'Acesso exclusivo à administração e diretoria.' }); next(); }); }
app.use(express.json({ limit: '1mb' }));
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 } }));
app.use(express.static(path.join(__dirname, 'public')));

// AutoDJ: transmite arquivos MP3 em sequência pelo endpoint /radio.mp3.
// Coloque as faixas em public/music/ (também aceita MP3 na raiz de public/).
function scanMusicLibrary() {
  try {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
    const root = path.join(__dirname, 'public');
    const files = [];
    for (const folder of [root, MUSIC_DIR]) {
      if (!fs.existsSync(folder)) continue;
      for (const name of fs.readdirSync(folder)) {
        if (!name.toLowerCase().endsWith('.mp3') || name.toLowerCase() === 'radio.mp3') continue;
        const fullPath = path.join(folder, name);
        try { if (fs.statSync(fullPath).isFile()) files.push({ name, fullPath }); } catch {}
      }
    }
    const unique = new Map(files.map(f => [f.fullPath, f]));
    musicLibrary = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (currentTrackIndex >= musicLibrary.length) currentTrackIndex = 0;
    console.log(`[AutoDJ] ${musicLibrary.length} faixa(s) encontrada(s).`);
  } catch (error) {
    console.error('[AutoDJ] Falha ao procurar músicas:', error.message);
  }
}

function broadcastAudio(chunk) {
  for (const res of activeListeners) {
    if (res.destroyed || res.writableEnded) { activeListeners.delete(res); continue; }
    // Evita que um ouvinte com conexão muito lenta acumule memória sem limite.
    if (res.writableLength > 2 * 1024 * 1024) {
      activeListeners.delete(res);
      res.end();
      continue;
    }
    try { res.write(chunk); } catch { activeListeners.delete(res); }
  }
}

function updateAutoDjTrack(track) {
  if (!track) return;
  db.station.nowPlaying = track.name.replace(/\.mp3$/i, '');
  saveData();
  io.emit('station:update', db.station);
  console.log(`[AutoDJ 24H] Tocando: ${track.name}`);
}

function runAutoDj() {
  if (autoDjPaused || autoDjRunning) return;
  if (!musicLibrary.length) {
    scanMusicLibrary();
    if (!musicLibrary.length) {
      setTimeout(runAutoDj, AUTO_DJ_RESCAN_MS);
      return;
    }
  }
  const track = musicLibrary[currentTrackIndex % musicLibrary.length];
  currentTrackIndex = (currentTrackIndex + 1) % musicLibrary.length;
  autoDjRunning = true;
  updateAutoDjTrack(track);
  currentTrackStream = fs.createReadStream(track.fullPath);
  currentTrackStream.on('data', chunk => {
    if (!autoDjPaused) broadcastAudio(chunk);
  });
  currentTrackStream.on('end', () => {
    autoDjRunning = false;
    currentTrackStream = null;
    if (!autoDjPaused) setImmediate(runAutoDj);
  });
  currentTrackStream.on('error', error => {
    console.error(`[AutoDJ] Erro ao tocar ${track.name}:`, error.message);
    autoDjRunning = false;
    currentTrackStream = null;
    setTimeout(runAutoDj, 1000);
  });
}

function pauseAutoDj() {
  autoDjPaused = true;
  // A leitura atual termina em segundo plano, mas seus blocos deixam de ser enviados.
}
function resumeAutoDj() {
  autoDjPaused = false;
  if (!autoDjRunning) runAutoDj();
}

app.get('/radio.mp3', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Access-Control-Allow-Origin': '*'
  });
  activeListeners.add(res);
  res.on('close', () => activeListeners.delete(res));
});

app.get('/api/status', (req, res) => res.json({ station: db.station, listenerFeaturesEnabled: !!db.station.online, nowPlaying: db.station.nowPlaying }));
app.get('/api/me', (req, res) => { const u = currentUser(req); res.json({ user: u ? publicUser(u) : null }); });
app.post('/api/register', async (req, res) => {
  const { username, email, password, accountType } = req.body || {};
  const cleanUsername = String(username || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '');
  const type = accountType === 'broadcaster' ? 'broadcaster' : 'listener';
  if (!cleanUsername || !cleanEmail || !cleanPassword) return res.status(400).json({ error: 'Preencha usuário, e-mail e senha.' });
  if (cleanUsername.length < 3 || cleanPassword.length < 8) return res.status(400).json({ error: 'O usuário precisa ter 3 caracteres e a senha, no mínimo 8.' });
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return res.status(400).json({ error: 'Informe um e-mail válido.' });

  const existingByUsername = db.users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
  const existingByEmail = db.users.find(u => String(u.email || '').toLowerCase() === cleanEmail);

  // Quem já criou uma conta de ouvinte pode pedir acesso de locutor usando
  // a mesma conta, desde que informe usuário, e-mail e senha correspondentes.
  if (type === 'broadcaster' && existingByUsername && existingByEmail && existingByUsername.id === existingByEmail.id) {
    const existing = existingByUsername;
    if (!(await bcrypt.compare(cleanPassword, existing.passwordHash))) {
      return res.status(401).json({ error: 'Essa conta já existe. Confira a senha da conta para solicitar acesso de locutor.' });
    }
    if (existing.role === 'broadcaster' && existing.status === 'pending') {
      return res.status(409).json({ error: 'Sua solicitação de locutor já foi enviada e está aguardando aprovação.' });
    }
    if (existing.role === 'broadcaster' && existing.status === 'approved') {
      return res.status(409).json({ error: 'Essa conta já está aprovada como locutor. Faça login para entrar no estúdio.' });
    }
    if (['admin', 'director'].includes(existing.role)) {
      return res.status(409).json({ error: 'Essa conta já tem acesso à equipe da rádio. Faça login normalmente.' });
    }
    existing.role = 'broadcaster';
    existing.status = 'pending';
    existing.createdAt = new Date().toISOString();
    saveData();
    io.emit('admin:update');
    return res.status(201).json({ message: 'Solicitação enviada usando sua conta existente! Aguarde a aprovação da diretoria.' });
  }

  if (existingByUsername) return res.status(409).json({ error: type === 'broadcaster' ? 'Esse usuário já pertence a outra conta. Se você já tem uma conta de ouvinte, informe também o mesmo e-mail e a senha dessa conta.' : 'Esse usuário já existe. Se já tem cadastro, use “Fazer login” abaixo.' });
  if (existingByEmail) return res.status(409).json({ error: type === 'broadcaster' ? 'Esse e-mail já pertence a outra conta. Confira o usuário e a senha da conta existente.' : 'Esse e-mail já está cadastrado. Se já tem cadastro, use “Fazer login” abaixo.' });

  const user = { id: cryptoId(), username: cleanUsername, email: cleanEmail, passwordHash: await bcrypt.hash(cleanPassword, 12), role: type, status: type === 'broadcaster' ? 'pending' : 'approved', createdAt: new Date().toISOString() };
  db.users.push(user); saveData();
  if (type === 'listener') { req.session.userId = user.id; return res.status(201).json({ user: publicUser(user), message: 'Conta criada com sucesso!' }); }
  io.emit('admin:update');
  res.status(201).json({ message: 'Solicitação enviada! Aguarde a aprovação da administração.' });
});
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = db.users.find(u => u.username.toLowerCase() === String(username || '').trim().toLowerCase());
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  if (user.status === 'pending') return res.status(403).json({ error: 'Sua solicitação ainda está aguardando aprovação.' });
  if (user.status === 'rejected') return res.status(403).json({ error: 'Sua solicitação de locutor foi recusada. Fale com a diretoria.' });
  req.session.userId = user.id; res.json({ user: publicUser(user), message: 'Login realizado.' });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ message: 'Você saiu da conta.' })));
app.get('/api/messages', (req, res) => res.json({ messages: db.messages.slice(-100) }));
app.post('/api/messages', requireLogin, (req, res) => {
  if (!db.station.online && req.user.role === 'listener') return res.status(409).json({ error: 'O chat fica disponível quando a rádio está ao vivo.' });
  const text = String(req.body.text || '').trim(); if (!text || text.length > 500) return res.status(400).json({ error: 'A mensagem deve ter entre 1 e 500 caracteres.' });
  const message = { id: cryptoId(), username: req.user.username, text, at: new Date().toISOString(), role: req.user.role };
  db.messages.push(message); db.messages = db.messages.slice(-300); saveData(); io.emit('chat:message', message); res.status(201).json({ message });
});
app.get('/api/requests', requireLogin, (req, res) => {
  if (req.user.role === 'listener' && !db.station.online) return res.status(409).json({ error: 'Os pedidos de música ficam disponíveis quando a rádio está ao vivo.' });
  res.json({ requests: db.requests.slice(-100), canManage: ['admin','director','broadcaster'].includes(req.user.role) });
});
app.post('/api/requests', requireLogin, (req, res) => {
  if (req.user.role === 'listener' && !db.station.online) return res.status(409).json({ error: 'Os pedidos de música ficam disponíveis quando a rádio está ao vivo.' });
  const song = String(req.body.song || '').trim(); const artist = String(req.body.artist || '').trim();
  if (!song) return res.status(400).json({ error: 'Informe o nome da música.' });
  const item = { id: cryptoId(), song: song.slice(0,120), artist: artist.slice(0,120), username: req.user.username, status: 'pending', at: new Date().toISOString() };
  db.requests.push(item); saveData(); io.emit('requests:update'); res.status(201).json({ request: item });
});
app.patch('/api/requests/:id', requireStaff, (req, res) => {
  const item = db.requests.find(r => r.id === req.params.id); if (!item) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const allowed = ['pending','accepted','played','rejected']; if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Estado inválido.' });
  item.status = req.body.status; saveData(); io.emit('requests:update'); res.json({ request: item });
});
app.get('/api/admin/users', requireManagement, (req, res) => res.json({ users: db.users.filter(u => u.role === 'broadcaster' || u.role === 'director').map(publicUser) }));
app.patch('/api/admin/users/:id', requireManagement, (req, res) => {
  const target = db.users.find(u => u.id === req.params.id); if (!target) return res.status(404).json({ error: 'Conta não encontrada.' });
  if (!['approved','rejected'].includes(req.body.status)) return res.status(400).json({ error: 'Decisão inválida.' });
  target.status = req.body.status; if (req.body.status === 'approved') target.role = req.body.role === 'director' && req.user.role === 'admin' ? 'director' : 'broadcaster'; saveData(); io.emit('admin:update'); res.json({ user: publicUser(target), message: `Conta ${target.status === 'approved' ? 'aprovada' : 'recusada'}.` });
});
app.post('/api/station/takeover', requireStaff, (req, res) => {
  pauseAutoDj();
  db.station.online = true; db.station.dj = req.user.username; db.station.startedAt = new Date().toISOString(); saveData(); io.emit('station:update', db.station); res.json({ station: db.station, message: 'O AutoDJ foi pausado para a entrada do locutor. O áudio ao vivo precisa ser enviado pelo sistema de transmissão.' });
});
app.post('/api/station/return-auto', requireStaff, (req, res) => {
  db.station.online = false; db.station.dj = null; db.station.startedAt = null; db.station.nowPlaying = 'Programação automática GAZETA FM'; saveData(); io.emit('station:update', db.station); resumeAutoDj(); res.json({ station: db.station, message: 'Programação automática retomada.' });
});
app.post('/api/station/now-playing', requireStaff, (req, res) => { db.station.nowPlaying = String(req.body.title || 'Programação automática GAZETA FM').slice(0,180); saveData(); io.emit('station:update', db.station); res.json({ station: db.station }); });

io.on('connection', socket => { socket.emit('station:update', db.station); });
scanMusicLibrary();
runAutoDj();
ensureAdmin().then(() => server.listen(PORT, () => console.log(`GAZETA FM disponível na porta ${PORT}`)));
