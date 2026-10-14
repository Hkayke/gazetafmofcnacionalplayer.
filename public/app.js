const socket = io();

// Seletores do seu site original
const \( = (seletor) => document.querySelector(seletor); const \)\$ = (seletor) => document.querySelectorAll(seletor);

const views = {
    player: \(('#viewPlayer') \vert{}\vert{} \)('.view-player'),
    painel: \$('#viewPainel') || \(('#painel-do-locutor') \vert{}\vert{} \)('.area-restrita'),
    console: \(('#viewConsole') \vert{}\vert{} \)('.console-locutor')
};

const btns = {
    ouvir: \$('#ouvirRadio') || document.querySelector('button'),
    entrarPainel: \$('#entrarPainel') || document.querySelector('button[type="submit"]'),
    sairPainel: \$('#sairPainel') || document.querySelector('.close'),
    enviarChat: \$('#enviarChat'),
    enviarPedido: \$('#enviarPedido')
};

const inputs = {
    nomeLocutor: \$('#nomeLocutor'),
    senhaAcesso: \$('#senhaAcesso'),
    chatNome: \$('#chatNome'),
    chatMsg: \$('#chatMsg')
};

const aud = \$('#audioAudio') || new Audio();
let transmitindo = false;

// ============================================================================
// LÓGICA DO SEU PAINEL DE LOCUTOR ORIGINAL (RESTAURADA E FUNCIONANDO)
// ============================================================================

// Abre a janela de login do locutor ao clicar no link do menu
const linksPainel = document.querySelectorAll('a[href*="painel"], .painel-link');
linksPainel.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        if (views.painel) {
            views.painel.style.display = 'block';
            views.painel.classList.remove('hide');
        }
    });
});

// Fecha a janela de login do locutor
const botoesFechar = document.querySelectorAll('.area-restrita .close, #painel-do-locutor .close, #sairPainel');
botoesFechar.forEach(botao => {
    botao.addEventListener('click', () => {
        if (views.painel) views.painel.style.display = 'none';
    });
});

// Ação de envio do formulário de login
if (btns.entrarPainel) {
    btns.entrarPainel.addEventListener('click', (e) => {
        e.preventDefault();
        const user = inputs.nomeLocutor ? inputs.nomeLocutor.value.trim() : '';
        const pass = inputs.senhaAcesso ? inputs.senhaAcesso.value.trim() : '';
        if (!user || !pass) {
            alert('Preencha todos os campos!');
            return;
        }
        socket.emit('login-locutor', { user, pass });
    });
}

socket.on('login-resposta', (data) => {
    if (data.sucesso) {
        if (views.painel) views.painel.style.display = 'none';
        if (views.console) {
            views.console.style.display = 'block';
            views.console.classList.remove('hide');
        }
        if (views.player) views.player.classList.add('hide');
    } else {
        alert(data.mensagem || 'Acesso negado!');
    }
});

// ============================================================================
// LÓGICA DO PLAYER AUTOMÁTICO 24H (A SUPERMISSÃO)
// ============================================================================
function alternarPlayer() {
    if (!transmitindo) {
        aud.src = "/radio.mp3";
        aud.crossOrigin = "anonymous";
        
        aud.play()
            .then(() => {
                transmitindo = true;
                if (btns.ouvir) btns.ouvir.innerHTML = '⏸ Pausar rádio';
            })
            .catch(err => {
                console.error("[Player] Erro ao iniciar transmissão:", err);
            });
    } else {
        aud.pause();
        aud.src = ""; 
        transmitindo = false;
        if (btns.ouvir) btns.ouvir.innerHTML = '▶ Ouvir rádio';
    }
}

if (btns.ouvir) {
    btns.ouvir.addEventListener('click', alternarPlayer);
}

// Força a rádio automática a iniciar o som assim que o site carregar na tela
window.addEventListener('DOMContentLoaded', () => {
    aud.src = "/radio.mp3";
    aud.crossOrigin = "anonymous";
    aud.play()
        .then(() => {
            transmitindo = true;
            if (btns.ouvir) btns.ouvir.innerHTML = '⏸ Pausar rádio';
        })
        .catch(() => {
            console.log("[Autoplay] Bloqueado pelo navegador. Aguardando interação do usuário.");
        });
});

// Sincronização do chat original
if (btns.enviarChat) {
    btns.enviarChat.addEventListener('click', () => {
        const nome = inputs.chatNome ? inputs.chatNome.value.trim() : 'Anônimo';
        const msg = inputs.chatMsg ? inputs.chatMsg.value.trim() : '';
        if (!msg) return;
        socket.emit('enviar-mensagem-chat', { nome, msg });
        if (inputs.chatMsg) inputs.chatMsg.value = '';
    });
}

socket.on('nova-mensagem-chat', (data) => {
    const box = document.getElementById('chatBox') || document.querySelector('.chat-messages');
    if (box) {
        const p = document.createElement('p');
        p.innerHTML = `<strong>${data.nome}:</strong> ${data.msg}`;
        box.appendChild(p);
        box.scrollTop = box.scrollHeight;
    }
});

socket.on('atualizar-status', (data) => {
    const statusTag = document.getElementById('statusRadio');
    if (statusTag) {
        statusTag.innerHTML = data.emComunicacao ? '● AO VIVO' : 'AUTOMÁTICO (AutoDJ)';
    }
});
