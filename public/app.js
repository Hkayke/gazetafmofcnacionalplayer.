const socket = io({ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 800, reconnectionDelayMax: 5000 });
const $ = id => document.getElementById(id);
let isLive = false, hostMode = false, hostName = '', hostPassword = '', intendedLive = false, listenerMode = true, radioConfig = {streamUrl:'/radio.mp3',autoDjEnabled:true,nowPlaying:'Programação automática'};
let micStream = null, audioContext = null, mixDestination = null, micSource = null;
let micGain = null, musicGain = null, effectGain = null, masterGain = null, compressor = null, micFilter = null, voiceMonitorGain = null;
let musicAnalyser = null, voiceAnalyser = null, effectAnalyser = null, musicMonitorGain = null, musicIndex = -1, currentMusicAudio = null, currentMusicSource = null;
let musicFiles = [], jingleFiles = [], wakeLock = null, meterFrame = null, reconnectingLive = false;
const peers = new Map(), activeEffects = new Map();
function setMessage(message) { if ($('audioMessage')) $('audioMessage').textContent = message; }
function state(s) {
  isLive = !!s.live;
  $('liveDot').classList.toggle('live', isLive);
  $('liveStatus').textContent = isLive ? 'RÁDIO AO VIVO' : 'RÁDIO OFFLINE';
  $('hostLabel').textContent = isLive ? 'Com ' + (s.hostName || 'locutor no ar') : 'Aguardando locutor';
  $('consoleDot').classList.toggle('live', isLive);
  $('consoleStatus').textContent = isLive ? 'Você está AO VIVO' : 'Transmissão offline';
  $('goLiveBtn').disabled = isLive;
  $('offLiveBtn').disabled = !isLive;
  const interactionEnabled = isLive;
  ['chatText','chatName'].forEach(id=>{ if($(id)) $(id).disabled=!interactionEnabled; });
  const requestButton=$('requestForm')?.querySelector('button[type=submit]'); if(requestButton) requestButton.disabled=!interactionEnabled;
  if($('requestMessage')) $('requestMessage').textContent=interactionEnabled?'A rádio está ao vivo: envie seu pedido de música.':'Chat e pedidos ficam disponíveis quando a rádio estiver ao vivo.';
}
socket.on('radio-state', s => { state(s); if (listenerMode) applyRadioConfig({}); });
function applyRadioConfig(c) {
  radioConfig={...radioConfig,...c};
  const title=radioConfig.nowPlaying || 'Programação automática';
  if ($('trackTitle') && (!isLive || radioConfig.autoDjEnabled)) $('trackTitle').textContent=title;
  if ($('trackSub')) $('trackSub').textContent=radioConfig.autoDjEnabled ? 'Auto DJ • programação contínua' : (isLive?'Transmissão ao vivo':'Aguardando locutor');
  if ($('streamUrlInput')) $('streamUrlInput').value=radioConfig.streamUrl||'';
  if ($('autoDjToggle')) $('autoDjToggle').checked=!!radioConfig.autoDjEnabled;
  if ($('autoDjMessage')) $('autoDjMessage').textContent=radioConfig.streamUrl ? (radioConfig.autoDjEnabled?'Auto DJ ativado. O stream está configurado.':'Auto DJ desligado; locutores ao vivo têm prioridade.') : 'Informe a URL pública do stream Icecast para habilitar a programação 24h.';
  if (listenerMode && $('autoDjAudio')) {
    if (radioConfig.autoDjEnabled && radioConfig.streamUrl) {
    const a = $('#autodjAudio')[0];
    const streamSrc = new URL(radioConfig.streamUrl, window.location.href).href;
    if (a.src !== streamSrc) { a.src = streamSrc; }
    
    // Força o início no mudo para o navegador liberar o som
    a.muted = true;
    
    a.play().then(() => {
        $('#listenHint').textContent = 'Conectado à programação automática 24h.';
    }).catch(() => {
        $('#listenHint').textContent = 'Clique na tela para ouvir.';
    });

    // Ativa o som no primeiro movimento na tela
    const ativarSom = () => {
        a.muted = false;
        ['click', 'touchstart', 'scroll'].forEach(ev => document.removeEventListener(ev, ativarSom));
    };
    ['click', 'touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, ativarSom));
}}
socket.on('radio-config', applyRadioConfig);
fetch('/api/radio-config').then(r=>r.json()).then(applyRadioConfig).catch(()=>{});
socket.on('connect', () => {
  if (hostMode && hostPassword) {
    socket.emit('host-login', { username: $('hostUsername')?.value.trim() || '', password: hostPassword, name: hostName || 'Locutor' });
    if (intendedLive) reconnectingLive = true;
  }
});
socket.on('connect_error', () => { if (hostMode) setMessage('Conexão instável com o servidor. Tentando reconectar automaticamente…'); });
socket.on('disconnect', () => { if (hostMode) setMessage('Conexão perdida. Reconectando… mantenha esta página aberta.'); });
socket.on('now-playing', d => { $('trackTitle').textContent = d.title; $('trackSub').textContent = 'Transmissão ao vivo • GAZETA FM NACIONAL PLAYER'; if(radioConfig.autoDjEnabled) applyRadioConfig({nowPlaying:d.title}); });
socket.on('stream-unavailable', () => { $('listenHint').textContent = 'A rádio está offline. Tente novamente quando o locutor entrar no ar.'; });
socket.on('host-login-result', r => {
  if (!r.ok) { $('loginMessage').textContent = r.message; return; }
  hostMode = true;
  $('loginView').classList.add('hidden'); $('controlView').classList.remove('hidden');
  refreshMics();
  if (reconnectingLive && intendedLive) {
    reconnectingLive = false;
    if (audioContext && audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    socket.emit('go-live');
    rebuildPeerStreams();
    setMessage('Conexão recuperada. Verifique se a transmissão voltou a ser ouvida pelos ouvintes.');
  }
});
socket.on('listener-wants-stream', async ({ listenerId }) => {
  if (!hostMode || !mixDestination) return;
  try {
    const old = peers.get(listenerId); if (old) old.close();
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peers.set(listenerId, pc);
    mixDestination.stream.getTracks().forEach(t => pc.addTrack(t, mixDestination.stream));
    pc.onicecandidate = e => { if (e.candidate) socket.emit('webrtc-ice', { target: listenerId, candidate: e.candidate }); };
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) { pc.close(); peers.delete(listenerId); } };
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit('webrtc-offer', { target: listenerId, offer });
  } catch (e) { console.error('Falha ao conectar ouvinte', e); }
});
socket.on('webrtc-offer', async ({ from, offer }) => {
  try {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }); peers.set(from, pc);
    pc.ontrack = e => { $('remoteAudio').srcObject = e.streams[0]; $('remoteAudio').play().catch(() => {}); $('listenHint').textContent = 'Conectado à transmissão ao vivo.'; };
    pc.onicecandidate = e => { if (e.candidate) socket.emit('webrtc-ice', { target: from, candidate: e.candidate }); };
    await pc.setRemoteDescription(offer); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); socket.emit('webrtc-answer', { target: from, answer });
  } catch (e) { $('listenHint').textContent = 'Não foi possível conectar. Tente novamente.'; }
});
socket.on('webrtc-answer', async ({ from, answer }) => { const p = peers.get(from); if (p) await p.setRemoteDescription(answer).catch(() => {}); });
socket.on('webrtc-ice', async ({ from, candidate }) => { const p = peers.get(from); if (p && candidate) await p.addIceCandidate(candidate).catch(() => {}); });
$('openPanel').onclick = () => $('panelModal').classList.remove('hidden');
$('closePanel').onclick = () => $('panelModal').classList.add('hidden');
$('panelModal').onclick = e => { if (e.target === $('panelModal')) $('panelModal').classList.add('hidden'); };
$('loginBtn').onclick = () => { hostName = $('hostName').value.trim() || 'Locutor'; hostPassword = $('hostPassword').value; socket.emit('host-login', { username: $('hostUsername')?.value.trim() || '', password: hostPassword, name: hostName }); };
const directorEntry=document.createElement('button'); directorEntry.className='outline full'; directorEntry.type='button'; directorEntry.textContent='Acesso da diretoria'; directorEntry.onclick=()=>{$('loginView').classList.add('hidden');$('directorView').classList.remove('hidden');}; $('loginView').appendChild(directorEntry);
$('hostRegisterBtn').onclick = async () => { const username=$('hostUsername').value.trim(), password=$('hostPassword').value, name=$('hostName').value.trim(); const msg=$('loginMessage'); if(!username||!password||!name){msg.textContent='Preencha usuário, nome e senha para solicitar cadastro.';return;} msg.textContent='Enviando solicitação…'; try {const r=await fetch('/api/accounts/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,name,email:$('hostEmail').value.trim(),role:'host'})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível solicitar cadastro.');msg.textContent='Solicitação enviada! Aguarde a aprovação da diretoria.';}catch(e){msg.textContent=e.message;} };
$('directorLoginBtn').onclick=async()=>{const msg=$('directorMessage');msg.textContent='Verificando acesso…';try{const r=await fetch('/api/director/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('directorUsername').value.trim(),password:$('directorPassword').value})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Acesso negado.');window.directorToken=d.token;msg.textContent='Acesso autorizado.';loadDirectorRequests();}catch(e){msg.textContent=e.message;}};
async function loadDirectorRequests(){const box=$('directorRequests');try{const r=await fetch('/api/director/requests',{headers:{Authorization:'Bearer '+window.directorToken}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao carregar solicitações.');box.innerHTML='';if(!d.requests.length){box.innerHTML='<p class=empty>Nenhuma solicitação pendente.</p>';return;}d.requests.forEach(a=>{const row=document.createElement('div');row.className='file-row';const info=document.createElement('span');info.className='file-name';info.textContent=a.name+' (@'+a.username+')';const yes=document.createElement('button');yes.className='primary';yes.textContent='Aprovar';yes.onclick=()=>decideAccount(a.username,'approve');const no=document.createElement('button');no.className='remove';no.textContent='Recusar';no.onclick=()=>decideAccount(a.username,'reject');row.append(info,yes,no);box.append(row);});}catch(e){box.innerHTML='<p class=empty>'+e.message+'</p>';}}
async function decideAccount(username,decision){try{const r=await fetch('/api/director/decision',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+window.directorToken},body:JSON.stringify({username,decision})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao atualizar conta.');$('directorMessage').textContent=d.message;loadDirectorRequests();}catch(e){$('directorMessage').textContent=e.message;}}
$('directorLogoutBtn').onclick=()=>{$('directorView').classList.add('hidden');$('loginView').classList.remove('hidden');};
$('logoutBtn').onclick = async () => { await endLive(); hostMode = false; hostPassword = ''; $('controlView').classList.add('hidden'); $('loginView').classList.remove('hidden'); };
$('listenBtn').onclick = async () => {
  listenerMode = true;
  if (isLive) {
    $('autoDjAudio').pause();
    $('listenHint').textContent = 'Conectando à transmissão ao vivo…';
    $('remoteAudio').play().catch(() => {}); socket.emit('listener-join');
  } else if (radioConfig.autoDjEnabled && radioConfig.streamUrl) {
    const a=$('autoDjAudio'); const streamSrc=new URL(radioConfig.streamUrl,window.location.href).href; if(a.src!==streamSrc) a.src=streamSrc;
    try { await a.play(); $('listenHint').textContent='Você está ouvindo a programação automática.'; }
    catch (_) { $('listenHint').textContent='Não foi possível iniciar o stream. Confira se há músicas no Auto DJ e tente novamente.'; }
  } else {
    $('listenHint').textContent = 'A rádio está offline. Aguarde um locutor entrar ao vivo ou ative o Auto DJ.';
  }
};
$('saveRadioConfig').onclick = async () => {
  const msg=$('autoDjMessage'); msg.textContent='Salvando configuração…';
  try {
    const r=await fetch('/api/radio-config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('hostUsername')?.value.trim()||'',password:hostPassword,streamUrl:$('streamUrlInput').value.trim(),autoDjEnabled:$('autoDjToggle').checked})});
    const d=await r.json(); if(!r.ok) throw new Error(d.error||'Não foi possível salvar.');
    applyRadioConfig(d.settings); msg.textContent='Configuração salva.';
  } catch(e) { msg.textContent='Erro ao salvar: '+e.message+' Entre no painel com sua senha antes de salvar.'; }
};
$('autoDjToggle').onchange = () => { if (!radioConfig.streamUrl && $('autoDjToggle').checked) $('autoDjMessage').textContent='Atenção: configure a URL do stream antes de ativar o Auto DJ.'; };
function connectMaster() {
  if (!audioContext || !masterGain || !mixDestination) return;
  try { masterGain.disconnect(); if (compressor) compressor.disconnect(); } catch (_) {}
  if ($('compressorToggle').checked) { masterGain.connect(compressor); compressor.connect(mixDestination); }
  else masterGain.connect(mixDestination);
}
async function ensureAudio() {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    mixDestination = audioContext.createMediaStreamDestination();
    micGain = audioContext.createGain(); musicGain = audioContext.createGain(); effectGain = audioContext.createGain(); masterGain = audioContext.createGain(); voiceMonitorGain = audioContext.createGain();
    compressor = audioContext.createDynamicsCompressor(); compressor.threshold.value = -18; compressor.knee.value = 20; compressor.ratio.value = 4; compressor.attack.value = .004; compressor.release.value = .22;
    micFilter = audioContext.createBiquadFilter(); micFilter.type = 'highpass'; micFilter.frequency.value = 85;
    musicAnalyser = audioContext.createAnalyser(); voiceAnalyser = audioContext.createAnalyser(); effectAnalyser = audioContext.createAnalyser();
    [musicAnalyser, voiceAnalyser, effectAnalyser].forEach(a => { a.fftSize = 256; a.smoothingTimeConstant = .78; });
    micGain.connect(voiceAnalyser); voiceAnalyser.connect(masterGain); voiceMonitorGain.gain.value = $('voiceMonitorToggle')?.checked ? .5 : 0; micGain.connect(voiceMonitorGain); voiceMonitorGain.connect(audioContext.destination);
    musicGain.connect(musicAnalyser); musicAnalyser.connect(masterGain);
    effectGain.connect(effectAnalyser); effectAnalyser.connect(masterGain);
    musicMonitorGain = audioContext.createGain(); musicMonitorGain.gain.value = $('musicMonitorToggle').checked ? .8 : 0;
    musicGain.connect(musicMonitorGain); musicMonitorGain.connect(audioContext.destination);
    connectMaster(); applyVolumes(); startMeters();
    audioContext.onstatechange = () => { if (audioContext && audioContext.state === 'suspended' && (intendedLive || currentMusicAudio || activeEffects.size)) audioContext.resume().catch(() => {}); };
  }
  if (audioContext.state === 'suspended') await audioContext.resume();
}
async function ensureMic() {
  await ensureAudio();
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não oferece acesso ao microfone.');
  if (!micStream || !micStream.getAudioTracks().some(t => t.readyState === 'live')) {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (micSource) try { micSource.disconnect(); } catch (_) {}
    micSource = audioContext.createMediaStreamSource(micStream); micSource.connect(micFilter); micFilter.connect(micGain);
  }
}
function applyVolumes() {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  if (micGain) micGain.gain.setTargetAtTime($('micMuteState').checked ? 0 : Number($('micVol').value) / 100, now, .025);
  if (musicGain) musicGain.gain.setTargetAtTime(Number($('mediaVol').value) / 100, now, .025);
  if (effectGain) effectGain.gain.setTargetAtTime(Number($('effectVol').value) / 100, now, .025);
  if (masterGain) masterGain.gain.setTargetAtTime(Number($('masterVol').value) / 100, now, .025);
  if (musicMonitorGain) musicMonitorGain.gain.setTargetAtTime($('musicMonitorToggle').checked ? .8 : 0, now, .025);
  if (voiceMonitorGain) voiceMonitorGain.gain.setTargetAtTime($('voiceMonitorToggle')?.checked ? .5 : 0, now, .025);
  $('micVolValue').textContent = $('micVol').value + '%'; $('mediaVolValue').textContent = $('mediaVol').value + '%'; $('effectVolValue').textContent = $('effectVol').value + '%'; $('masterVolValue').textContent = $('masterVol').value + '%';
  if (compressor && masterGain) connectMaster();
}
['micVol', 'mediaVol', 'effectVol', 'masterVol'].forEach(id => $(id).addEventListener('input', applyVolumes));
$('musicMonitorToggle').onchange = async () => { if (audioContext) await audioContext.resume().catch(() => {}); applyVolumes(); $('monitorMessage').textContent = $('musicMonitorToggle').checked ? 'Retorno local da música ligado. Use fones para evitar eco.' : 'Retorno local da música desligado.'; };
if ($('voiceMonitorToggle')) $('voiceMonitorToggle').onchange = async () => { if (audioContext) await audioContext.resume().catch(() => {}); applyVolumes(); $('monitorMessage').textContent = $('voiceMonitorToggle').checked ? 'Retorno local da voz ligado. Use fones para evitar microfonia e eco.' : 'Retorno local da voz desligado.'; };
$('compressorToggle').onchange = () => { if (audioContext) connectMaster(); $('audioMessage').textContent = $('compressorToggle').checked ? 'Compressor de áudio ativado.' : 'Compressor de áudio desativado.'; };
async function refreshMics() {
  try { const ds = await navigator.mediaDevices.enumerateDevices(); $('micSelect').innerHTML = '<option value="">Microfone padrão do dispositivo</option>'; ds.filter(d => d.kind === 'audioinput').forEach((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || `Microfone ${i + 1}`; $('micSelect').appendChild(o); }); } catch (_) {}
}
$('micSelect').onchange = async () => {
  try { await ensureAudio(); if (micStream) micStream.getTracks().forEach(t => t.stop());
    micStream = await navigator.mediaDevices.getUserMedia({ audio: $('micSelect').value ? { deviceId: { exact: $('micSelect').value }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } : { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (micSource) try { micSource.disconnect(); } catch (_) {} try { micFilter.disconnect(); } catch (_) {} micSource = audioContext.createMediaStreamSource(micStream); micSource.connect(micFilter); micFilter.connect(micGain); $('audioMessage').textContent = 'Microfone selecionado com redução de ruído do navegador.';
  } catch (e) { $('audioMessage').textContent = 'Não foi possível acessar esse microfone: ' + e.message; }
};
async function requestWakeLock() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {} }
async function releaseWakeLock() { if (wakeLock) { try { await wakeLock.release(); } catch (_) {} wakeLock = null; } }
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    if (audioContext && audioContext.state === 'suspended' && (intendedLive || currentMusicAudio || activeEffects.size)) await audioContext.resume().catch(() => {});
    if (intendedLive) await requestWakeLock();
  } else if (intendedLive) {
    setMessage('Transmissão em segundo plano: o navegador ou o sistema pode limitar o áudio. Para maior estabilidade, mantenha a tela ativa; esta página não consegue impedir todos os bloqueios do Android.');
  }
});
$('goLiveBtn').onclick = async () => {
  const btn = $('goLiveBtn'); btn.disabled = true; btn.textContent = 'Preparando transmissão…';
  try {
    await ensureMic(); if (!socket.connected) await new Promise((resolve, reject) => { const timer = setTimeout(() => { cleanup(); reject(new Error('Tempo esgotado ao conectar ao servidor.')); }, 9000); const onConnect = () => { cleanup(); resolve(); }; function cleanup() { clearTimeout(timer); socket.off('connect', onConnect); } socket.on('connect', onConnect); socket.connect(); });
    intendedLive = true; socket.emit('go-live'); await requestWakeLock(); $('audioMessage').textContent = 'Microfone e transmissão preparados. Evite fechar a aba; o navegador pode suspender áudio em segundo plano.';
  } catch (e) { intendedLive = false; $('audioMessage').textContent = 'Não foi possível iniciar: ' + (e.message || 'verifique a permissão do microfone e a conexão.'); }
  finally { btn.textContent = '● Entrar ao vivo'; btn.disabled = false; }
};
function rebuildPeerStreams() { peers.forEach(p => p.close()); peers.clear(); }
async function endLive() {
  intendedLive = false; socket.emit('go-offline'); rebuildPeerStreams(); stopMusic(); stopEffects(); await releaseWakeLock();
  if (micStream) micStream.getTracks().forEach(t => t.stop()); micStream = null; micSource = null;
  if (audioContext) { if (meterFrame) cancelAnimationFrame(meterFrame); await audioContext.close().catch(() => {}); audioContext = null; mixDestination = null; micGain = musicGain = effectGain = masterGain = compressor = micFilter = musicAnalyser = voiceAnalyser = effectAnalyser = musicMonitorGain = voiceMonitorGain = null; }
  $('micMuteState').checked = false; $('micToggle').textContent = 'Mutar microfone';
}
$('offLiveBtn').onclick = endLive;
$('micToggle').onclick = () => { $('micMuteState').checked = !$('micMuteState').checked; if (!micGain) return setMessage('Entre ao vivo primeiro.'); applyVolumes(); $('micToggle').textContent = $('micMuteState').checked ? 'Ativar microfone' : 'Mutar microfone'; };
function render(arr, target, type) {
  const c = $(target); c.innerHTML = '';
  if (!arr.length) { c.innerHTML = '<p class="empty">Nenhum arquivo adicionado.</p>'; return; }
  arr.forEach((f, i) => { const row = document.createElement('div'); row.className = 'file-row'; const n = document.createElement('span'); n.className = 'file-name'; n.textContent = (type === 'music' ? 'Slot ' : 'Slot ') + (i + 1) + ' • ' + f.name; const p = document.createElement('button'); p.textContent = type === 'music' ? 'Tocar' : 'Disparar'; p.onclick = () => type === 'music' ? playMusic(f, i) : playEffect(f); const r = document.createElement('button'); r.className = 'remove'; r.textContent = 'Remover'; r.onclick = () => { if (type === 'music' && currentMusicAudio && currentMusicAudio._file === f) stopMusic(); arr.splice(i, 1); render(arr, target, type); if (type === 'jingle') renderTriggers(); }; row.append(n, p, r); c.append(row); }); if (type === 'jingle') renderTriggers();
}
function renderTriggers() { const c = $('triggerList'); c.innerHTML = ''; if (!jingleFiles.length) { c.innerHTML = '<p class="empty">Adicione vinhetas, anúncios ou efeitos acima.</p>'; return; } jingleFiles.forEach((f, i) => { const row = document.createElement('div'); row.className = 'trigger-row'; const n = document.createElement('span'); n.className = 'file-name'; n.textContent = 'Slot ' + (i + 1) + ' • ' + f.name; const b = document.createElement('button'); b.textContent = '▶ Disparar'; b.onclick = () => playEffect(f); const rm = document.createElement('button'); rm.className='remove'; rm.textContent='Remover'; rm.onclick=()=>{ const idx=jingleFiles.indexOf(f); if(idx>=0)jingleFiles.splice(idx,1); render(jingleFiles,'jingleList','jingle'); renderTriggers(); }; row.append(n, b, rm); c.append(row); }); }
$('musicFiles').onchange = e => { musicFiles = musicFiles.concat(Array.from(e.target.files || [])).slice(0, 5); render(musicFiles, 'musicList', 'music'); e.target.value = ''; setMessage(musicFiles.length + '/5 músicas na playlist.'); };
$('jingleFiles').onchange = e => { jingleFiles = jingleFiles.concat(Array.from(e.target.files || [])).slice(0, 10); render(jingleFiles, 'jingleList', 'jingle'); renderTriggers(); e.target.value = ''; setMessage(jingleFiles.length + '/10 efeitos, vinhetas ou anúncios adicionados.'); };
function announceTrack(f) { socket.emit('now-playing', { title: f.name.replace(/\.[^/.]+$/, '') }); }
async function playMusic(f, index = musicFiles.indexOf(f)) {
  try {
    await ensureAudio(); stopMusic(); const audio = new Audio(); audio.preload = 'auto'; audio.src = URL.createObjectURL(f); audio._file = f; currentMusicAudio = audio; currentMusicSource = audioContext.createMediaElementSource(audio); currentMusicSource.connect(musicGain);
    audio.onended = () => { if (currentMusicAudio === audio) { stopMusic(); if (musicFiles.length) nextMusic(); } };
    audio.onerror = () => { if (currentMusicAudio === audio) setMessage('Erro ao ler esta música. Tente um arquivo MP3, WAV ou OGG válido.'); };
    await audio.play(); musicIndex = index; announceTrack(f); $('musicMonitorTitle').textContent = f.name; setMessage('Tocando música: ' + f.name);
  } catch (e) { setMessage('Não foi possível tocar ' + f.name + ': ' + (e.message || 'formato não suportado')); }
}
async function playEffect(f) {
  try {
    await ensureAudio(); const audio = new Audio(); audio.preload = 'auto'; audio.src = URL.createObjectURL(f); const source = audioContext.createMediaElementSource(audio); source.connect(effectGain); activeEffects.set(audio, { source, url: audio.src });
    const cleanup = () => { const item = activeEffects.get(audio); if (!item) return; try { item.source.disconnect(); } catch (_) {} URL.revokeObjectURL(item.url); activeEffects.delete(audio); };
    audio.onended = cleanup; audio.onerror = () => { cleanup(); setMessage('Não foi possível ler o efeito ' + f.name + '.'); };
    await audio.play(); setMessage('Efeito disparado: ' + f.name);
  } catch (e) { setMessage('Não foi possível disparar ' + f.name + ': ' + (e.message || 'formato não suportado')); }
}
function stopMusic() { if (currentMusicAudio) { const a = currentMusicAudio; a.onended = null; a.onerror = null; a.pause(); const url = a.src; try { a.removeAttribute('src'); a.load(); } catch (_) {} if (url.startsWith('blob:')) URL.revokeObjectURL(url); currentMusicAudio = null; } if (currentMusicSource) { try { currentMusicSource.disconnect(); } catch (_) {} currentMusicSource = null; } }
function stopEffects() { activeEffects.forEach((item, audio) => { audio.onended = null; audio.pause(); try { audio.removeAttribute('src'); audio.load(); item.source.disconnect(); } catch (_) {} if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url); }); activeEffects.clear(); }
function stopAllAudio() { stopMusic(); stopEffects(); }
function nextMusic() { if (!musicFiles.length) return setMessage('Adicione músicas à playlist primeiro.'); musicIndex = (musicIndex + 1) % musicFiles.length; playMusic(musicFiles[musicIndex], musicIndex); }
$('playMusicBtn').onclick = nextMusic;
$('fadeNextBtn').onclick = () => { if (!currentMusicAudio || !audioContext || !musicGain) return nextMusic(); if (!musicFiles.length) return setMessage('Adicione músicas à playlist primeiro.'); const now = audioContext.currentTime; currentMusicAudio.onended = null; musicGain.gain.cancelScheduledValues(now); musicGain.gain.setValueAtTime(musicGain.gain.value, now); musicGain.gain.linearRampToValueAtTime(0, now + 1.5); setMessage('Diminuindo a música e preparando a próxima…'); setTimeout(() => { if (currentMusicAudio) { stopMusic(); musicGain.gain.cancelScheduledValues(audioContext.currentTime); applyVolumes(); nextMusic(); } }, 1550); };
$('stopAudioBtn').onclick = () => { stopAllAudio(); setMessage('Músicas e efeitos parados. O microfone continua ativo.'); };
function drawMeter(analyser, fillId, valueId) { if (!analyser) return; const data = new Uint8Array(analyser.frequencyBinCount); analyser.getByteTimeDomainData(data); let sum = 0; for (const v of data) { const n = (v - 128) / 128; sum += n * n; } const rms = Math.sqrt(sum / data.length); const percent = Math.min(100, Math.max(0, Math.round(rms * 240))); $(fillId).style.width = percent + '%'; $(valueId).textContent = percent < 3 ? 'Sem sinal' : percent + '%'; }
function startMeters() { if (meterFrame) cancelAnimationFrame(meterFrame); const loop = () => { if (!audioContext) return; drawMeter(musicAnalyser, 'musicMeterFill', 'musicMeterValue'); drawMeter(voiceAnalyser, 'voiceMeterFill', 'voiceMeterValue'); drawMeter(effectAnalyser, 'effectMeterFill', 'effectMeterValue'); meterFrame = requestAnimationFrame(loop); }; loop(); }
window.addEventListener('beforeunload', () => { if (hostMode) socket.emit('go-offline'); });

// Conta do ouvinte: autenticação verificada no servidor; só guardamos o nome de exibição localmente.
let listenerAccount=null; try{listenerAccount=JSON.parse(localStorage.getItem('gazetaListenerAccount')||'null');}catch(_){}
function updateListenerAccountUI(){const logged=!!listenerAccount;const name=logged?(listenerAccount.name||listenerAccount.username):'';if($('listenerAccountBtn'))$('listenerAccountBtn').textContent=logged?'Ouvinte: '+name:'Conta do ouvinte';if($('chatName')&&logged)$('chatName').value=name;if($('requestName')&&logged)$('requestName').value=name;}
$('listenerAccountBtn').onclick=()=>{$('listenerAuthModal').classList.remove('hidden');updateListenerAccountUI();};
$('closeListenerAuth').onclick=()=>$('listenerAuthModal').classList.add('hidden');
$('listenerAuthModal').onclick=e=>{if(e.target===$('listenerAuthModal'))$('listenerAuthModal').classList.add('hidden');};
$('listenerRegisterBtn').onclick=async()=>{const msg=$('listenerAuthMessage');try{const r=await fetch('/api/accounts/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('listenerUsername').value.trim(),password:$('listenerPassword').value,name:$('listenerName').value.trim(),email:$('listenerEmail').value.trim(),role:'listener'})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível criar a conta.');msg.textContent='Conta criada! Agora entre com seu usuário e senha.';}catch(e){msg.textContent=e.message;}};
$('listenerLoginBtn').onclick=async()=>{const msg=$('listenerAuthMessage');try{const r=await fetch('/api/accounts/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('listenerUsername').value.trim(),password:$('listenerPassword').value})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível entrar.');listenerAccount=d.account;localStorage.setItem('gazetaListenerAccount',JSON.stringify(listenerAccount));updateListenerAccountUI();msg.textContent='Login realizado. Bem-vindo à GAZETA FM!';$('listenerAuthModal').classList.add('hidden');}catch(e){msg.textContent=e.message;}};
$('listenerLogoutBtn').onclick=()=>{listenerAccount=null;localStorage.removeItem('gazetaListenerAccount');updateListenerAccountUI();$('listenerAuthMessage').textContent='Você saiu da sua conta.';};
updateListenerAccountUI();
// Recursos públicos: chat, pedidos de música e arte da programação.
const siteMenu = $('siteMenu');
$('menuBtn').onclick = () => siteMenu.classList.toggle('hidden');
$('menuPanel').onclick = () => { siteMenu.classList.add('hidden'); $('openPanel').click(); };
$('menuChat').onclick = () => { siteMenu.classList.add('hidden'); $('chatSection').scrollIntoView({behavior:'smooth'}); };
$('menuRequest').onclick = () => { siteMenu.classList.add('hidden'); $('requestSection').scrollIntoView({behavior:'smooth'}); };
$('menuSchedule').onclick = () => { siteMenu.classList.add('hidden'); $('scheduleSection').classList.remove('hidden'); $('scheduleSection').scrollIntoView({behavior:'smooth'}); socket.emit('schedule-image'); };
function renderChatLine(box,m) { if(!box)return; const empty=box.querySelector('.empty'); if(empty)empty.remove(); const row=document.createElement('div'); row.className='chat-line'; const who=document.createElement('b'); who.textContent=m.name+': '; const msg=document.createElement('span'); msg.textContent=m.text; row.append(who,msg); box.append(row); while(box.children.length>60)box.firstChild.remove(); box.scrollTop=box.scrollHeight; }
function addChatMessage(m) { renderChatLine($('chatMessages'),m); renderChatLine($('hostChatMessages'),m); }
socket.on('chat-message',addChatMessage);
socket.on('song-request',m=>{if(!$('hostRequests'))return;const box=$('hostRequests');const empty=box.querySelector('.empty');if(empty)box.innerHTML='';const row=document.createElement('div');row.className='file-row';row.dataset.requestId=m.id;const name=document.createElement('span');name.className='file-name';name.textContent=m.by+' pediu: '+m.name;const download=document.createElement('a');download.href=m.url;download.download=m.name;download.textContent='Baixar';download.className='request-download';const remove=document.createElement('button');remove.className='remove';remove.textContent='Concluir';remove.onclick=()=>{socket.emit('delete-song-request',{id:m.id});row.remove();if(!box.children.length)box.innerHTML='<p class="empty">Nenhum pedido recebido ainda.</p>';};row.append(name,download);if(hostMode)row.append(remove);box.append(row);});
socket.on('song-request-removed',d=>{const row=document.querySelector('[data-request-id="'+CSS.escape(d.id)+'"]');if(row)row.remove();});
function setSchedule(item){if(!item||!item.url)return;$('scheduleImage').src=item.url;$('scheduleImage').classList.remove('hidden');$('scheduleEmpty').classList.add('hidden');$('scheduleSection').classList.remove('hidden');}
socket.on('schedule-image',setSchedule);
$('chatForm').onsubmit=e=>{e.preventDefault();if(!listenerAccount){$('listenerAuthModal').classList.remove('hidden');$('listenerAuthMessage').textContent='Entre na sua conta para conversar no chat.';return;}if(!isLive){$('requestMessage').textContent='O chat funciona quando a rádio estiver ao vivo.';return;}const text=$('chatText').value.trim();if(!text)return;socket.emit('chat-message',{name:listenerAccount?.name||listenerAccount?.username||'Ouvinte',text});$('chatText').value='';};
$('requestForm').onsubmit=async e=>{e.preventDefault();if(!listenerAccount){$('listenerAuthModal').classList.remove('hidden');$('listenerAuthMessage').textContent='Entre na sua conta para pedir músicas.';return;}if(!isLive){$('requestMessage').textContent='Os pedidos de música ficam disponíveis quando a rádio estiver ao vivo.';return;}const file=$('requestFile').files[0];if(!file)return;const msg=$('requestMessage');msg.textContent='Enviando arquivo…';try{const fd=new FormData();fd.append('song',file);fd.append('name',listenerAccount.name||listenerAccount.username);fd.append('username',listenerAccount.username);const r=await fetch('/api/upload-song',{method:'POST',body:fd});const data=await r.json();if(!r.ok)throw new Error(data.error||'Falha no envio');msg.textContent='Pedido enviado! O locutor já pode baixar o arquivo.';$('requestFile').value='';}catch(err){msg.textContent='Não foi possível enviar: '+err.message;}};
$('scheduleFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;const msg=$('scheduleUploadMessage');if(!hostMode||!hostPassword){msg.textContent='Somente o administrador autenticado no painel pode publicar a programação.';e.target.value='';return;}msg.textContent='Enviando imagem…';try{const fd=new FormData();fd.append('password',hostPassword);fd.append('username',$('hostUsername')?.value.trim()||'');fd.append('image',file);const r=await fetch('/api/upload-schedule',{method:'POST',body:fd});const data=await r.json();if(!r.ok)throw new Error(data.error||'Falha no envio');setSchedule(data.item);msg.textContent='Imagem publicada para os ouvintes.';}catch(err){msg.textContent='Não foi possível publicar: '+err.message;}e.target.value='';};
fetch('/api/public-data').then(r=>r.json()).then(data=>{(data.chatHistory||[]).forEach(addChatMessage);(data.requestHistory||[]).forEach(m=>{const already=document.querySelector('[data-request-id="'+CSS.escape(m.id)+'"]');if(!already){const box=$('hostRequests');if(box.querySelector('.empty'))box.innerHTML='';const row=document.createElement('div');row.className='file-row';row.dataset.requestId=m.id;const n=document.createElement('span');n.className='file-name';n.textContent=m.by+' pediu: '+m.name;const a=document.createElement('a');a.href=m.url;a.download=m.name;a.className='request-download';a.textContent='Baixar';row.append(n,a);box.append(row);}});if(data.scheduleImage)setSchedule(data.scheduleImage);}).catch(()=>{});

const autoDjUploadInput = $('autoDjSongFile');
if (autoDjUploadInput) autoDjUploadInput.onchange = async e => {
  const file=e.target.files[0]; if(!file)return;
  const msg=$('autoDjUploadMessage');
  if(!hostMode || !hostPassword){msg.textContent='Entre no painel do locutor antes de enviar músicas para o Auto DJ.';e.target.value='';return;}
  if(!/\.mp3$/i.test(file.name)){msg.textContent='Selecione um arquivo MP3.';e.target.value='';return;}
  msg.textContent='Enviando música para o servidor…';
  try { const fd=new FormData(); fd.append('password',hostPassword); fd.append('username',$('hostUsername')?.value.trim()||''); fd.append('song',file); const r=await fetch('/api/auto-dj/upload',{method:'POST',body:fd}); const d=await r.json(); if(!r.ok)throw new Error(d.error||'Falha no envio'); msg.textContent='Música adicionada à programação automática. Total de faixas: '+d.count+'.'; }
  catch(err){msg.textContent='Não foi possível enviar: '+err.message;}
  e.target.value='';
};

const originalLoginHandler = $('loginBtn').onclick;
$('loginBtn').onclick = async () => { hostPassword=$('hostPassword').value; hostName=$('hostName').value.trim()||'Locutor'; if(originalLoginHandler) await originalLoginHandler(); };
