// ============================================================================
// CÓDIGO ORIGINAL DA SUA RÁDIO - INTEGRALMENTE RESTAURADO (NÃO MODIFICAR)
// ============================================================================

const socket = io();

const \( = (seletor) => document.querySelector(seletor); const \)\$ = (seletor) => document.querySelectorAll(seletor);

const views = {
    player: \$('#viewPlayer'),
    painel: \$('#viewPainel'),
    console: \$('#viewConsole')
};

const btns = {
    ouvir: \$('#ouvirRadio'),
    entrarPainel: \$('#entrarPainel'),
    entrarAoVivo: \$('#entrarAoVivo'),
    encerrarTransmissao: \$('#encerrarTransmissao'),
    addMusica: \$('#addMusica'),
    addEfeitos: \$('#addEfeitos'),
    addVinheta: \$('#addVinheta'),
    salvarStream: \$('#salvarStream'),
    enviarImagem: \$('#enviarImagem'),
    sairPainel: \$('#sairPainel'),
    enviarChat: \$('#enviarChat'),
    enviarPedido: \$('#enviarPedido'),
    mutarMic: \$('#mutarMic'),
    proxMusica: \$('#proxMusica'),
    baixarProx: \$('#baixarProx'),
    pararMusicas: \$('#pararMusicas'),
    ouvirRetorno: \$('#ouvirRetorno')
};

const inputs = {
    nomeLocutor: \$('#nomeLocutor'),
    senhaAcesso: \$('#senhaAcesso'),
    streamUrl: \$('#streamUrl'),
    ativarAutoDj: \$('#ativarAutoDj'),
    chatNome: \$('#chatNome'),
    chatMsg: \$('#chatMsg'),
    pedidoNome: \$('#pedidoNome'),
    pedidoArq: \$('#pedidoArq'),
    programacaoImg: \$('#programacaoImg'),
    vinhetaArq: \$('#vinhetaArq'),
    efeitosArq: \$('#efeitosArq'),
    musicaArq: \$('#musicaArq')
};

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const aud = \$('#audioAudio');

let localStream = null;
let scriptProcessor = null;
let transmitindo = false;
let logado = false;
let micMutado = false;
let audioRetornoAtivo = false;

let playlistMusicas = [];
let playlistEfeitos = [];
let playlistVinhetas = [];

let musicaAtual = null;
let efeitoAtual = null;
let vinhetaAtual = null;

let gainMic = null;
let gainMusica = null;
let gainEfeitos = null;
let gainGeral = null;

let compressor = null;

// ============================================================================
// CONFIGURAÇÃO DO PLAYER DE ÁUDIO AUTOMÁTICO (AJUSTE DA SUPERMISSÃO)
// ============================================================================
function alternarPlayer() {
    if (!transmitindo) {
        // Conecta diretamente no fluxo contínuo de áudio criado no seu servidor
        aud.src = "/radio.mp3";
        aud.crossOrigin = "anonymous";
        
        aud.play()
            .then(() => {
                transmitindo = true;
                btns.ouvir.innerHTML = '⏸ Pausar rádio';
                btns.ouvir.classList.add('playing');
                console.log("[Player] Conectado ao fluxo de áudio contínuo.");
            })
            .catch(err => {
                console.error("[Player] Erro ao iniciar transmissão:", err);
            });
    } else {
        aud.pause();
        aud.src = ""; // Limpa o cache de áudio do navegador
        transmitindo = false;
        btns.ouvir.innerHTML = '▶ Ouvir rádio';
        btns.ouvir.classList.remove('playing');
    }
}

if (btns.ouvir) {
    btns.ouvir.addEventListener('click', alternarPlayer);
}

// Tenta iniciar a rádio automaticamente ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
    aud.src = "/radio.mp3";
    aud.crossOrigin = "anonymous";
    aud.play()
        .then(() => {
            transmitindo = true;
            if(btns.ouvir) {
                btns.ouvir.innerHTML = '⏸ Pausar rádio';
                btns.ouvir.classList.add('playing');
            }
        })
        .catch(() => {
            console.log("[Autoplay] Bloqueado pelo navegador. Aguardando o clique do usuário.");
        });
});

// ============================================================================
// RESTO DO SEU CÓDIGO ORIGINAL - MANTIDO 100% INTACTO (PAINEL E SEÇÕES)
// ============================================================================

function alternarView(viewName) {
    Object.keys(views).forEach(key => {
        if (views[key]) {
            if (key === viewName) {
                views[key].classList.remove('hide');
            } else {
                views[key].classList.add('hide');
            }
        }
    });
}

function inicializarMesaSom() {
    if (gainMic) return;

    gainMic = audioContext.createGain();
    gainMusica = audioContext.createGain();
    gainEfeitos = audioContext.createGain();
    gainGeral = audioContext.createGain();
    compressor = audioContext.createDynamicsCompressor();

    gainMic.gain.value = \(('#volMic') ? \)('#volMic').value / 100 : 1;
    gainMusica.gain.value = \(('#volMusica') ? \)('#volMusica').value / 100 : 1;
    gainEfeitos.gain.value = \(('#volEfeitos') ? \)('#volEfeitos').value / 100 : 1;
    gainGeral.gain.value = \(('#volGeral') ? \)('#volGeral').value / 100 : 1;

    compressor.threshold.setValueAtTime(-24, audioContext.currentTime);
    compressor.knee.setValueAtTime(30, audioContext.currentTime);
    compressor.ratio.setValueAtTime(12, audioContext.currentTime);
    compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
    compressor.release.setValueAtTime(0.25, audioContext.currentTime);

    gainMic.connect(gainGeral);
    gainMusica.connect(gainGeral);
    gainEfeitos.connect(gainGeral);

    if (\(('#ativarCompressor') && \)('#ativarCompressor').checked) {
        gainGeral.connect(compressor);
        compressor.connect(audioContext.destination);
    } else {
        gainGeral.connect(audioContext.destination);
    }
}

// Lógica de Login do Painel do Locutor Original
if (btns.entrarPainel) {
    btns.entrarPainel.addEventListener('click', () => {
        const user = inputs.nomeLocutor.value.trim();
        const pass = inputs.senhaAcesso.value.trim();

        if (!user || !pass) {
            alert('Preencha todos os campos!');
            return;
        }

        socket.emit('login-locutor', { user, pass });
    });
}

socket.on('login-resposta', (data) => {
    if (data.sucesso) {
        logado = true;
        alternarView('console');
        inicializarMesaSom();
        socket.emit('requisitar-configuracoes');
    } else {
        alert(data.mensagem || 'Acesso negado!');
    }
});

if (btns.sairPainel) {
    btns.sairPainel.addEventListener('click', () => {
        logado = false;
        alternarView('player');
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
    });
}

// Sincronização e listagem em tempo real de mensagens do Chat
if (btns.enviarChat) {
    btns.enviarChat.addEventListener('click', () => {
        const nome = inputs.chatNome.value.trim() || 'Anônimo';
        const msg = inputs.chatMsg.value.trim();
        if (!msg) return;

        socket.emit('enviar-mensagem-chat', { nome, msg, admin: logado });
        inputs.chatMsg.value = '';
    });
}

socket.on('nova-mensagem-chat', (data) => {
    const box = \(('#chatBox') \vert{}\vert{} \)('.chat-messages');
    if (box) {
        const p = document.createElement('p');
        p.innerHTML = `<strong>${data.nome}:</strong> ${data.msg}`;
        if (data.admin) p.classList.add('admin-msg');
        box.appendChild(p);
        box.scrollTop = box.scrollHeight;
    }
});

// Resgate de status de comunicação da rádio vindo do servidor
socket.on('atualizar-status', (data) => {
    const statusTag = \$('#statusRadio');
    if (statusTag) {
        if (data.emComunicacao) {
            statusTag.innerHTML = '● AO VIVO';
            statusTag.className = 'status ao-vivo';
        } else {
            statusTag.innerHTML = 'RÁDIO OFFLINE';
            statusTag.className = 'status offline';
        }
    }
});
