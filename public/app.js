const socket = io();
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let me = null, station = { online:false, nowPlaying:'Programação automática GAZETA FM', dj:null }, allRequests = [], adminUsers = [];
let toastTimer;
const radioAudio = document.getElementById('radioAudio');
let autoPlayWarningShown = false;
function startRadioPlayback(){
  if(!radioAudio) return;
  if(!radioAudio.src || !radioAudio.src.includes('/radio.mp3')) radioAudio.src = `${location.origin}/radio.mp3`;
  radioAudio.volume = Number($('#listenerVolume')?.value ?? 75) / 100;
  const attempt = radioAudio.play();
  if(attempt && typeof attempt.catch === 'function') attempt.catch(() => {
    const note = $('#autoplayNote');
    if(note) note.textContent = 'Seu navegador bloqueou o som automático. Toque em “Ouvir a rádio” uma vez para liberar a reprodução.';
    if(!autoPlayWarningShown){ autoPlayWarningShown = true; const hint=$('#playerHint'); if(hint) hint.textContent='Toque em “Ouvir a rádio” para liberar o som neste navegador.'; }
  });
}

function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200)}
async function api(url, options={}){const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});let data={};try{data=await r.json()}catch{}if(!r.ok)throw new Error(data.error||'Não foi possível concluir a operação.');return data}
function openModal(tab='choose'){ $('#authModal').classList.add('open');$('#authModal').setAttribute('aria-hidden','false');switchAuth(tab);$('#authMessage').textContent=''; }
function closeModal(){ $('#authModal').classList.remove('open');$('#authModal').setAttribute('aria-hidden','true'); }
function switchAuth(tab){const map={login:'#loginForm',register:'#registerForm','register-dj':'#registerDjForm'};$('#authChoice').hidden=tab!=='choose';$$('.auth-form').forEach(f=>f.hidden=true);if(map[tab])$(map[tab]).hidden=false;$('#authMessage').textContent='';}
function showAuthMessage(msg,type=''){const el=$('#authMessage');el.textContent=msg;el.className='form-message '+type}
function setUser(user){me=user;$('#accountButton').textContent=user?`${user.username} · Sair`:'Entrar / Criar conta';const staff=!!(user&&['admin','director','broadcaster'].includes(user.role));const management=!!(user&&['admin','director'].includes(user.role));$('[data-page=locutor]').hidden=!staff;$('[data-page=diretoria]').hidden=!management;$$('[data-studio-view]').forEach(b=>b.hidden=!staff);if(!staff&&$('#page-locutor').classList.contains('active'))$('[data-page=ouvinte]').click();else if(!management&&$('#page-diretoria').classList.contains('active'))$('[data-page=ouvinte]').click();$('#studioLocked').hidden=staff;$('#studioPanel').hidden=!staff;$('#adminLocked').hidden=management;$('#adminPanel').hidden=!management;$('#djName').textContent=user?.username||'Locutor';refreshGates();if(user){if(management)loadAdmin();if(staff){loadRequests();loadMessages();loadMediaSlots()}}}
function refreshGates(){const canChat=!!me;$('#chatStatus').textContent=station.online?'Locutor ao vivo':'Programação automática';$('#listenerMessage').disabled=!canChat;$('#listenerChatForm button').disabled=!canChat;$('#songName').disabled=!canChat;$('#songArtist').disabled=!canChat;$('#requestSubmit').disabled=!canChat;$('#requestHint').textContent=!me?'Entre na sua conta para enviar um pedido musical.':station.online?'Seu pedido será enviado diretamente ao estúdio.':'Seu pedido ficará registrado para a equipe da rádio.';$('#listenerChatForm').querySelector('input').placeholder=!me?'Entre na sua conta para conversar':'Escreva sua mensagem...';$('#djChatForm input').disabled=!(me&&['admin','director','broadcaster'].includes(me.role));$('#djChatForm button').disabled=$('#djChatForm input').disabled;}
function renderStation(){const online=!!station.online;['#liveBadge','#adminLiveBadge'].forEach(s=>{const el=$(s);el.classList.toggle('online',online);el.classList.toggle('offline',!online);el.innerHTML=`<i></i> ${online?'AO VIVO':'PROGRAMAÇÃO AUTOMÁTICA'}`});$('#heroTrack').textContent=station.nowPlaying||'Programação GAZETA FM';$('#heroDj').textContent=online?`No ar com ${station.dj||'locutor'}`:'Programação automática';$('#trackTitle').textContent=station.nowPlaying||'Programação automática GAZETA FM';$('#trackSubtitle').textContent=online?`Ao vivo com ${station.dj||'locutor'}`:'A trilha da sua vida começa aqui';$('#playerHint').textContent=online?'Locutor ao vivo • AutoDJ pausado':'Programação automática GAZETA FM • Auto DJ';$('#adminStationTitle').textContent=station.nowPlaying||'Programação automática GAZETA FM';$('#adminStationSub').textContent=online?`No ar com ${station.dj||'locutor'}`:'Sem locutor no ar';$('#adminRadioStatus').textContent=online?'Ao vivo':'Offline';$('#studioStatusText').textContent=online?`AO VIVO • ${station.dj||'Locutor'} assumiu o painel`:'PROGRAMAÇÃO AUTOMÁTICA • Auto DJ selecionado';$('#startBroadcast').disabled=online;$('#endBroadcast').disabled=!online;$('#startBroadcast').textContent=online?'● Transmissão iniciada':'● Iniciar transmissão';$('#chatStatus').textContent=online?'Locutor ao vivo':'Programação automática';$('#wave').classList.toggle('playing',online);refreshGates()}
function renderMessages(messages, target){const el=$(target);if(!messages.length){el.innerHTML='<div class="empty-state"><span>◌</span><b>Nenhuma mensagem por enquanto</b><small>As mensagens novas aparecerão aqui.</small></div>';return}el.innerHTML=messages.map(m=>`<div class="chat-message"><div class="meta"><b>${escapeHtml(m.username)}</b><time>${new Date(m.at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time></div><p>${escapeHtml(m.text)}</p></div>`).join('');el.scrollTop=el.scrollHeight}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function loadMessages(){try{const d=await api('/api/messages');renderMessages(d.messages,'#listenerChat');renderMessages(d.messages,'#djChat')}catch(e){}}
function requestStatus(s){return ({pending:'Pendente',accepted:'Na fila',played:'Tocada',rejected:'Recusada'})[s]||s}
function renderRequests(items){allRequests=items;const mine=items.filter(r=>me&&r.username===me.username).slice().reverse().slice(0,5);$('#myRequests').innerHTML=mine.length?mine.map(r=>`<div class="request-item"><div class="req-main"><b>${escapeHtml(r.song)}</b><small>${escapeHtml(r.artist||'Artista não informado')} · ${escapeHtml(r.username)}</small></div><span class="status-pill ${r.status}">${requestStatus(r.status)}</span></div>`).join(''):'<div class="empty-line">Você ainda não enviou pedidos.</div>';const staff=me&&['admin','director','broadcaster'].includes(me.role);const list=items.slice().reverse();$('#djRequests').innerHTML=list.length?list.map(r=>`<div class="request-item"><div class="req-main"><b>${escapeHtml(r.song)}</b><small>${escapeHtml(r.artist||'Artista não informado')} · pedido de ${escapeHtml(r.username)}</small></div><select class="request-status" data-request-id="${r.id}" aria-label="Status do pedido"><option value="pending" ${r.status==='pending'?'selected':''}>Pendente</option><option value="accepted" ${r.status==='accepted'?'selected':''}>Na fila</option><option value="played" ${r.status==='played'?'selected':''}>Tocada</option><option value="rejected" ${r.status==='rejected'?'selected':''}>Recusada</option></select></div>`).join(''):'<div class="empty-line">Nenhum pedido recebido.</div>';$('#djRequests').querySelectorAll('select').forEach(s=>{s.disabled=!staff;s.addEventListener('change',async()=>{try{await api(`/api/requests/${s.dataset.requestId}`,{method:'PATCH',body:JSON.stringify({status:s.value})});toast('Pedido atualizado.');loadRequests()}catch(e){toast(e.message)}})});}
async function loadRequests(){try{const d=await api('/api/requests');renderRequests(d.requests)}catch(e){$('#djRequests').innerHTML='<div class="empty-line">'+escapeHtml(e.message)+'</div>'}}
async function loadAdmin(){try{const d=await api('/api/admin/users');adminUsers=d.users;const pending=d.users.filter(u=>u.status==='pending');$('#pendingCount').textContent=pending.length;$('#approvedCount').textContent=d.users.filter(u=>u.status==='approved').length;$('#approvalList').innerHTML=d.users.length?d.users.slice().reverse().map(u=>`<div class="approval-item"><div class="req-main"><b>${escapeHtml(u.username)} <span class="status-pill ${u.status}">${u.status==='pending'?'Pendente':u.status==='approved'?'Aprovado':'Recusado'}</span></b><small>${escapeHtml(u.email)} · ${u.role==='director'?'Diretoria':'Locutor'} · cadastro ${new Date(u.createdAt).toLocaleDateString('pt-BR')}</small></div>${u.status==='pending'?`<div class="approval-actions"><button class="btn btn-primary" data-user-action="approved" data-user-id="${u.id}">Aprovar</button><button class="btn btn-danger" data-user-action="rejected" data-user-id="${u.id}">Recusar</button></div>`:''}</div>`).join(''):'<div class="empty-line">Nenhuma solicitação de locutor até agora.</div>';$('#approvalList').querySelectorAll('[data-user-action]').forEach(b=>b.addEventListener('click',async()=>{try{const d=await api(`/api/admin/users/${b.dataset.userId}`,{method:'PATCH',body:JSON.stringify({status:b.dataset.userAction})});toast(d.message);loadAdmin()}catch(e){toast(e.message)}}))}catch(e){$('#approvalList').innerHTML='<div class="empty-line">'+escapeHtml(e.message)+'</div>'}}
let queue=[];
const audioFiles = { music: [], effect: [] };
let audioContext = null, streamDestination = null, micMonitorStream = null, micMonitorSource = null;
let micGain = null, musicGain = null, fxGain = null, monitorBus = null, monitorGain = null;
let currentMusicAudio = null;
const activeMediaAudio = new Set();
const broadcastPeers = new Map(), listenerPeers = new Map();
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
async function loadRtcConfig(){try{const r=await fetch('/api/rtc-config');if(r.ok){const d=await r.json();if(Array.isArray(d.iceServers)&&d.iceServers.length)rtcConfig.iceServers=d.iceServers}}catch{}}

function makeSlots(){
  const music=$('#musicSlots'),effects=$('#effectSlots');
  for(let i=1;i<=5;i++){
    const row=document.createElement('div');row.className='slot';row.dataset.slot=String(i);
    row.innerHTML=`<span class="slot-number">${i}</span><span class="slot-name">Nenhum arquivo</span><input type="file" accept=".mp3,audio/mpeg" aria-label="Arquivo de música ${i}"><button type="button" class="slot-btn load">Enviar</button><button type="button" class="slot-btn fire" disabled>▶ Tocar</button><button type="button" class="slot-btn remove">Limpar</button>`;
    const file=row.querySelector('input[type=file]'),name=row.querySelector('.slot-name'),play=row.querySelector('.fire');
    row.querySelector('.load').addEventListener('click',()=>file.click());
    file.addEventListener('change',async()=>{if(!file.files[0])return;try{const d=await uploadAudio(file.files[0],'music',i);row.dataset.url=d.url;row.dataset.name=d.name;name.textContent=d.name;name.title=d.name;play.disabled=false;audioFiles.music[i]=d;addQueue(d.name,d.url,i);toast(d.message)}catch(e){toast(e.message)}finally{file.value=''}});
    play.addEventListener('click',async()=>{if(row.dataset.url){const idx=queue.findIndex(q=>q.slot===i);if(idx>=0)queue.splice(idx,1);renderQueue();await playAudio(row.dataset.url,'music',row.dataset.name||`Música ${i}`)}});
    row.querySelector('.remove').addEventListener('click',async()=>{try{await api(`/api/media/slots/music/${i}`,{method:'DELETE'})}catch{}row.dataset.url='';row.dataset.name='';name.textContent='Nenhum arquivo';play.disabled=true;audioFiles.music[i]=null;queue=queue.filter(q=>q.slot!==i);renderQueue();toast(`Slot de música ${i} limpo.`)});
    music.append(row);
  }
  for(let i=1;i<=10;i++){
    const row=document.createElement('div');row.className='slot';row.dataset.slot=String(i);
    row.innerHTML=`<span class="slot-number">${i}</span><span class="slot-name">Efeito vazio</span><input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm" aria-label="Arquivo de efeito ${i}"><button type="button" class="slot-btn load">Enviar</button><button type="button" class="slot-btn fire" disabled>▶ Disparar</button><button type="button" class="slot-btn remove">Limpar</button>`;
    const file=row.querySelector('input[type=file]'),name=row.querySelector('.slot-name'),fire=row.querySelector('.fire');
    row.querySelector('.load').addEventListener('click',()=>file.click());
    file.addEventListener('change',async()=>{if(!file.files[0])return;try{const d=await uploadAudio(file.files[0],'effect',i);row.dataset.url=d.url;row.dataset.name=d.name;name.textContent=d.name;name.title=d.name;fire.disabled=false;audioFiles.effect[i]=d;toast(d.message)}catch(e){toast(e.message)}finally{file.value=''}});
    fire.addEventListener('click',async()=>{if(row.dataset.url)await playAudio(row.dataset.url,'effect',row.dataset.name||`Efeito ${i}`)});
    row.querySelector('.remove').addEventListener('click',async()=>{try{await api(`/api/media/slots/effect/${i}`,{method:'DELETE'})}catch{}row.dataset.url='';row.dataset.name='';name.textContent='Efeito vazio';fire.disabled=true;audioFiles.effect[i]=null;toast(`Slot de efeito ${i} limpo.`)});
    effects.append(row);
  }
}
async function uploadAudio(file,kind,slot){
  if(!me||!['admin','director','broadcaster'].includes(me.role))throw new Error('Entre no painel de locutor para enviar arquivos.');
  const body=new FormData();body.append('file',file);
  const response=await fetch(`/api/media/upload?kind=${kind}&slot=${slot}`,{method:'POST',body,credentials:'same-origin'});let data={};try{data=await response.json()}catch{}
  if(!response.ok)throw new Error(data.error||'Falha ao enviar áudio.');return data;
}
async function loadMediaSlots(){try{const d=await api('/api/media/slots');for(const kind of ['music','effect']){const slots=d.slots?.[kind]||{};for(const [number,item] of Object.entries(slots)){const row=document.querySelector(`#${kind==='music'?'musicSlots':'effectSlots'} .slot[data-slot="${number}"]`);if(!row||!item?.url)continue;row.dataset.url=item.url;row.dataset.name=item.name||'Áudio carregado';const label=row.querySelector('.slot-name');if(label){label.textContent=item.name||'Áudio carregado';label.title=item.name||''}const action=row.querySelector('.fire');if(action)action.disabled=false;if(kind==='music'&&!queue.some(q=>q.slot===Number(number)))addQueue(item.name||'Música',item.url,Number(number));}}}catch(e){console.warn('Slots salvos:',e.message)}}
function createAudioGraph(){
  if(audioContext)return;
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw new Error('Seu navegador não oferece suporte ao áudio do estúdio.');
  audioContext=new AC();streamDestination=audioContext.createMediaStreamDestination();
  micGain=audioContext.createGain();musicGain=audioContext.createGain();fxGain=audioContext.createGain();monitorBus=audioContext.createGain();monitorGain=audioContext.createGain();
  micGain.gain.value=($('#muteMic').dataset.muted==='true')?0:Number($('#micVolume').value)/100;musicGain.gain.value=Number($('#musicVolume').value)/100;fxGain.gain.value=Number($('#fxVolume').value)/100;monitorGain.gain.value=$('#monitorToggle').checked?1:0;
  for(const gain of [micGain,musicGain,fxGain]){gain.connect(streamDestination);gain.connect(monitorBus)}monitorBus.connect(monitorGain);monitorGain.connect(audioContext.destination);
}
async function ensureMicCapture(){
  createAudioGraph();if(!micMonitorStream){if(!navigator.mediaDevices?.getUserMedia)throw new Error('Permita o microfone em uma conexão HTTPS.');micMonitorStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});micMonitorSource=audioContext.createMediaStreamSource(micMonitorStream);micMonitorSource.connect(micGain)}
  await audioContext.resume();
}
function updateAudioGains(){if(micGain)micGain.gain.value=$('#muteMic').dataset.muted==='true'?0:Number($('#micVolume').value)/100;if(musicGain)musicGain.gain.value=Number($('#musicVolume').value)/100;if(fxGain)fxGain.gain.value=Number($('#fxVolume').value)/100;if(monitorGain)monitorGain.gain.value=$('#monitorToggle').checked?1:0;}
async function playAudio(url,kind,title){
  try{createAudioGraph();await audioContext.resume();const audio=new Audio(url);audio.preload='auto';audio.crossOrigin='anonymous';const source=audioContext.createMediaElementSource(audio);source.connect(kind==='effect'?fxGain:musicGain);
    if(kind==='music'&&currentMusicAudio){try{currentMusicAudio.pause();currentMusicAudio.currentTime=0}catch{}}
    if(kind==='music')currentMusicAudio=audio;activeMediaAudio.add(audio);
    audio.addEventListener('ended',()=>{activeMediaAudio.delete(audio);if(kind==='music'&&currentMusicAudio===audio){currentMusicAudio=null;const next=queue.shift();renderQueue();if(next)playAudio(next.url,'music',next.title)}});
    await audio.play();updateAudioGains();if(kind==='music'){try{await api('/api/station/now-playing',{method:'POST',body:JSON.stringify({title})})}catch{}toast(`Tocando: ${title}`)}else toast(`Efeito disparado: ${title}`);
  }catch(e){toast(`Não foi possível reproduzir o áudio: ${e.message}`)}
}
function addQueue(title,url,slot){queue.push({title,url,slot});renderQueue()}
function renderQueue(){const el=$('#musicQueue');el.innerHTML=queue.length?queue.map((q,i)=>`<div class="request-item"><span class="slot-number">${i+1}</span><div class="req-main"><b>${escapeHtml(q.title)}</b><small>Slot ${q.slot}</small></div><button type="button" class="slot-btn fire" data-queue-play="${i}">▶</button><button type="button" class="slot-btn remove" data-queue-index="${i}">Remover</button></div>`).join(''):'<div class="empty-line">Nenhuma faixa adicionada.</div>';el.querySelectorAll('[data-queue-index]').forEach(b=>b.addEventListener('click',()=>{queue.splice(Number(b.dataset.queueIndex),1);renderQueue()}));el.querySelectorAll('[data-queue-play]').forEach(b=>b.addEventListener('click',()=>{const q=queue.splice(Number(b.dataset.queuePlay),1)[0];renderQueue();if(q)playAudio(q.url,'music',q.title)}));}

function closePeerMap(map){for(const pc of map.values()){try{pc.close()}catch{}}map.clear()}
async function createBroadcasterPeer(viewerId){
  if(!streamDestination||!station.online||!me||station.djUserId!==me.id)return;
  if(broadcastPeers.has(viewerId))return;
  const pc=new RTCPeerConnection(rtcConfig);broadcastPeers.set(viewerId,pc);
  streamDestination.stream.getTracks().forEach(track=>pc.addTrack(track,streamDestination.stream));
  pc.onicecandidate=e=>{if(e.candidate)socket.emit('live:ice',{to:viewerId,candidate:e.candidate})};
  pc.onconnectionstatechange=()=>{if(['failed','closed','disconnected'].includes(pc.connectionState)){try{pc.close()}catch{}broadcastPeers.delete(viewerId)}};
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);socket.emit('live:offer',{to:viewerId,offer:pc.localDescription});
}
async function handleLiveOffer({from,offer}){
  if(me&&station.djUserId===me.id)return;
  const pc=new RTCPeerConnection(rtcConfig);listenerPeers.set(from,pc);
  pc.ontrack=e=>{if(e.streams&&e.streams[0]){radioAudio.srcObject=e.streams[0];radioAudio.volume=Number($('#listenerVolume')?.value??75)/100;radioAudio.play().catch(()=>{const h=$('#playerHint');if(h)h.textContent='Toque em “Ouvir a rádio” para liberar o áudio ao vivo.'})}};
  pc.onicecandidate=e=>{if(e.candidate)socket.emit('live:ice',{to:from,candidate:e.candidate})};
  pc.onconnectionstatechange=()=>{if(['failed','closed','disconnected'].includes(pc.connectionState))listenerPeers.delete(from)};
  try{await pc.setRemoteDescription(offer);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);socket.emit('live:answer',{to:from,answer:pc.localDescription})}catch(e){console.warn('WebRTC answer:',e)}
}
async function startLiveTransmission(){
  await ensureMicCapture();
  const d=await api('/api/station/takeover',{method:'POST'});station=d.station;renderStation();toast('Transmissão ao vivo iniciada. Confira o retorno e use fones.');
}
async function stopLiveTransmission(){
  for(const audio of activeMediaAudio){try{audio.pause();audio.currentTime=0}catch{}}activeMediaAudio.clear();currentMusicAudio=null;
  try{const d=await api('/api/station/return-auto',{method:'POST'});station=d.station;renderStation();closePeerMap(broadcastPeers);toast(d.message)}catch(e){toast(e.message)}
}
function setStudioView(view){const mapping={home:['mixer','music','effects','chat','requests'],music:['music'],effects:['effects'],listeners:['chat'],requests:['requests'],chat:['chat'],program:['mixer'],reports:['mixer'],settings:['mixer']};const allowed=mapping[view]||mapping.home;$$('[data-studio-card]').forEach(card=>{card.hidden=!allowed.includes(card.dataset.studioCard)});$$('[data-studio-view]').forEach(b=>b.classList.toggle('active',b.dataset.studioView===view));const title=document.querySelector('#page-locutor .section-heading h2');if(title){const labels={home:'Painel inicial do locutor.',music:'Músicas do estúdio.',effects:'Vinhetas e efeitos.',listeners:'Ouvintes da rádio.',requests:'Pedidos musicais.',chat:'Chat da rádio.',program:'Programação da rádio.',reports:'Relatórios do estúdio.',settings:'Configurações do estúdio.'};title.textContent=labels[view]||labels.home;}}
$$('[data-studio-view]').forEach(b=>b.addEventListener('click',()=>setStudioView(b.dataset.studioView)));
$$('[data-page]').forEach(b=>b.addEventListener('click',()=>{const page=b.dataset.page;$$('[data-page]').forEach(x=>x.classList.toggle('active',x===b));$$('.page').forEach(x=>x.classList.toggle('active',x.id===`page-${page}`));document.body.classList.toggle('studio-mode',page==='locutor');document.body.classList.toggle('admin-mode',page==='diretoria');if(page!=='locutor')setStudioView('home');if(page==='locutor')setStudioView('home');if(page==='diretoria'&&me&&['admin','director'].includes(me.role))loadAdmin();if(page==='locutor'&&me&&['admin','director','broadcaster'].includes(me.role)){loadMessages();loadRequests()}}));
$$('[data-open]').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.open==='register-dj'?'register-dj':b.dataset.open==='register'?'register':'choose')));$$('[data-close]').forEach(b=>b.addEventListener('click',closeModal));$$('[data-auth-tab]').forEach(b=>b.addEventListener('click',()=>switchAuth(b.dataset.authTab)));document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
$('#accountButton').addEventListener('click',async()=>{if(me){try{await api('/api/logout',{method:'POST'});setUser(null);toast('Você saiu da conta.')}catch(e){toast(e.message)}}else openModal('choose')});
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{const d=await api('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(fd))});setUser(d.user);socket.disconnect();socket.connect();closeModal();toast('Login realizado com sucesso!');loadMessages();loadRequests();if(['admin','director'].includes(me.role))loadAdmin()}catch(err){showAuthMessage(err.message,'error')}});
async function registerSubmit(e,type){e.preventDefault();const fd=new FormData(e.currentTarget);try{const d=await api('/api/register',{method:'POST',body:JSON.stringify({...Object.fromEntries(fd),accountType:type})});if(d.user){setUser(d.user);closeModal();toast(d.message)}else{showAuthMessage(d.message,'success');e.currentTarget.reset();if(type==='broadcaster')setTimeout(closeModal,2500)}}catch(err){showAuthMessage(err.message,'error')}}$('#registerForm').addEventListener('submit',e=>registerSubmit(e,'listener'));$('#registerDjForm').addEventListener('submit',e=>registerSubmit(e,'broadcaster'));
async function sendChat(input){const text=input.value.trim();if(!text)return;try{await api('/api/messages',{method:'POST',body:JSON.stringify({text})});input.value=''}catch(e){toast(e.message)}}$('#listenerChatForm').addEventListener('submit',e=>{e.preventDefault();if(!me)return openModal('login');sendChat($('#listenerMessage'))});$('#djChatForm').addEventListener('submit',e=>{e.preventDefault();sendChat($('#djMessage'))});
$('#requestForm').addEventListener('submit',async e=>{e.preventDefault();if(!me)return openModal('login');try{await api('/api/requests',{method:'POST',body:JSON.stringify({song:$('#songName').value,artist:$('#songArtist').value})});$('#requestForm').reset();toast('Pedido enviado ao estúdio!');loadRequests()}catch(err){toast(err.message)}});
$('#startBroadcast').addEventListener('click',async()=>{try{await startLiveTransmission()}catch(e){toast(e.message)}});$('#endBroadcast').addEventListener('click',stopLiveTransmission);
function slider(range,out,meter){const el=$(range);const update=()=>{const val=Number(el.value);$(out).textContent=`${val}%`;$(meter).style.height=`${val}%`};el.addEventListener('input',update);update()}slider('#musicVolume','#musicOut','#musicMeter');slider('#micVolume','#micOut','#micMeter');slider('#fxVolume','#fxOut','#fxMeter');$('#listenerVolume').addEventListener('input',e=>{ $('#listenerVolumeValue').textContent=`${e.target.value}%`; if(radioAudio) radioAudio.volume=Number(e.target.value)/100; });$('#muteMic').dataset.muted='false';
$('#muteMic').addEventListener('click',()=>{const muted=$('#muteMic').dataset.muted!=='true';$('#muteMic').dataset.muted=String(muted);$('#muteMic').textContent=muted?'Microfone mutado':'Mutar microfone';$('#micMeter').style.height=muted?'0%':`${$('#micVolume').value}%`;updateAudioGains();toast(muted?'Microfone silenciado na transmissão e no retorno.':'Microfone reativado.')});
$('#openMic').addEventListener('click',async()=>{try{await ensureMicCapture();$('#muteMic').dataset.muted='false';$('#muteMic').textContent='Mutar microfone';$('#micMeter').style.height=`${$('#micVolume').value}%`;updateAudioGains();toast('Microfone autorizado e pronto para o estúdio.')}catch(e){toast(e.message)}});
$('#monitorToggle').addEventListener('change',async e=>{try{if(e.target.checked){await ensureMicCapture();updateAudioGains();toast('Retorno da voz e das músicas ativado. Use fones para evitar microfonia.')}else{updateAudioGains();toast('Retorno de áudio desligado.')}}catch(err){e.target.checked=false;updateAudioGains();toast(err.message)}});
$('#micVolume').addEventListener('input',updateAudioGains);$('#musicVolume').addEventListener('input',updateAudioGains);$('#fxVolume').addEventListener('input',updateAudioGains);
window.addEventListener('beforeunload',()=>{closePeerMap(broadcastPeers);closePeerMap(listenerPeers);if(micMonitorStream)micMonitorStream.getTracks().forEach(t=>t.stop());if(audioContext)audioContext.close()});
$('#refreshUsers').addEventListener('click',loadAdmin);$('#listenButton').addEventListener('click',()=>{startRadioPlayback();document.querySelector('.player-strip').scrollIntoView({behavior:'smooth',block:'center'});toast('Conectando à rádio GAZETA FM...')});
socket.on('chat:message',m=>{loadMessages()});socket.on('requests:update',()=>{loadRequests()});socket.on('station:update',s=>{const wasOnline=!!station.online;station=s;renderStation();if(station.online){if(!me||station.djUserId!==me.id)socket.emit('live:watch')}else{closePeerMap(listenerPeers);if(radioAudio.srcObject){radioAudio.srcObject=null;startRadioPlayback()}}});
socket.on('live:viewer-joined',({viewerId})=>{createBroadcasterPeer(viewerId).catch(e=>console.warn('Conexão do ouvinte:',e))});
socket.on('live:offer',payload=>{handleLiveOffer(payload).catch(e=>console.warn('Oferta ao vivo:',e))});
socket.on('live:answer',async({from,answer})=>{const pc=broadcastPeers.get(from);if(pc)try{await pc.setRemoteDescription(answer)}catch(e){console.warn(e)}});
socket.on('live:ice',async({from,candidate})=>{const pc=broadcastPeers.get(from)||listenerPeers.get(from);if(pc)try{await pc.addIceCandidate(candidate)}catch(e){console.warn(e)}});
socket.on('live:ended',()=>{closePeerMap(listenerPeers);if(radioAudio.srcObject){radioAudio.srcObject=null;startRadioPlayback()}});
socket.on('live:prepare',()=>{if(me&&station.djUserId===me.id)toast('Estúdio ao vivo: conectando ouvintes...')});socket.on('admin:update',()=>{if(me&&['admin','director'].includes(me.role))loadAdmin()});
(async function init(){makeSlots();$('#year').textContent=new Date().getFullYear();try{const [s,u]=await Promise.all([api('/api/status'),api('/api/me'),loadRtcConfig()]);station=s.station;setUser(u.user);renderStation();if(station.online&&(!u.user||station.djUserId!==u.user.id))socket.emit('live:watch');startRadioPlayback();await loadMessages();}catch(e){console.error(e)}refreshGates()})();
