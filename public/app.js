// Conexão original via Socket.io com o servidor
const socket = io();

// Elementos principais do site
const botaoPlay = document.getElementById('ouvirRadio') || document.querySelector('button');
const audioPlayer = document.getElementById('audioAudio') || new Audio();

let transmitindo = false;

// FUNÇÃO ORIGINAL DO SEU SITE PARA ABRIR O PAINEL DO LOCUTOR
function abrirPainelLocutor(evento) {
    if (evento) evento.preventDefault();
    
    // Procura as IDs e Classes originais do seu projeto (Área Restrita / Janela Modal)
    const modalAreaRestrita = document.getElementById('painel-do-locutor') || document.querySelector('.area-restrita') || document.querySelector('.modal');
    
    if (modalAreaRestrita) {
        modalAreaRestrita.style.display = 'flex';
        modalAreaRestrita.style.visibility = 'visible';
        modalAreaRestrita.classList.add('active');
        console.log("[Painel] Janela de login aberta com sucesso.");
    } else {
        // Fallback caso a ID mude na renderização
        const secaoPainel = document.querySelector('section h2');
        if (secaoPainel && secaoPainel.textContent.includes('Painel')) {
            secaoPainel.parentElement.style.display = 'block';
        }
    }
}

// FUNÇÃO ORIGINAL PARA FECHAR O PAINEL DO LOCUTOR
function fecharPainelLocutor() {
    const modalAreaRestrita = document.getElementById('painel-do-locutor') || document.querySelector('.area-restrita') || document.querySelector('.modal');
    if (modalAreaRestrita) {
        modalAreaRestrita.style.display = 'none';
        modalAreaRestrita.style.visibility = 'hidden';
        modalAreaRestrita.classList.remove('active');
    }
}

// Procura o link ou botão do menu que o usuário clica para abrir o painel
const botoesPainel = document.querySelectorAll('a[href*="painel"], .painel-link, #painelLocutor');
botoesPainel.forEach(botao => {
    botao.addEventListener('click', abrirPainelLocutor);
});

// Procura os botões de fechar (o "X" ou botão cancelar da janela)
const botoesFechar = document.querySelectorAll('.area-restrita .close, #painel-do-locutor .close, .modal .close, #fecharPainel');
botoesFechar.forEach(botao => {
    botao.addEventListener('click', fecharPainelLocutor);
});

// Se o seu site usa o link com o texto "Painel do locutor" no menu
const todosLinks = document.querySelectorAll('a, li');
todosLinks.forEach(link => {
    if (link.textContent.includes('Painel') || link.textContent.includes('locutor')) {
        link.addEventListener('click', abrirPainelLocutor);
    }
});


// MOTOR DO PLAYER DE ÁUDIO DO AUTODJ
function alternarPlayer() {
    if (!transmitindo) {
        audioPlayer.src = "/radio.mp3";
        audioPlayer.crossOrigin = "anonymous";
        
        audioPlayer.play()
            .then(() => {
                transmitindo = true;
                if(botaoPlay) botaoPlay.innerText = "⏸ Pausar Rádio";
            })
            .catch(err => {
                console.error("[Player] Erro ao iniciar áudio:", err);
            });
    } else {
        audioPlayer.pause();
        audioPlayer.src = ""; 
        transmitindo = false;
        if(botaoPlay) botaoPlay.innerText = "▶ Ouvir rádio";
    }
}

if (botaoPlay) {
    botaoPlay.addEventListener('click', alternarPlayer);
}

// Inicialização automática do som ao carregar
window.addEventListener('DOMContentLoaded', () => {
    audioPlayer.src = "/radio.mp3";
    audioPlayer.crossOrigin = "anonymous";
    audioPlayer.play()
        .then(() => {
            transmitindo = true;
            if(botaoPlay) botaoPlay.innerText = "⏸ Pausar Rádio";
        })
        .catch(() => {
            console.log("[Autoplay] Navegador bloqueou o início automático sem clique.");
        });
});

// Sincronização do status da rádio (AO VIVO / AUTO DJ) via Socket
socket.on('atualizar-status', (dados) => {
    const statusTexto = document.getElementById('statusRadio');
    if (statusTexto && dados) {
        statusTexto.innerText = dados.emComunicacao ? "● AO VIVO" : "AUTOMÁTICO (AutoDJ)";
    }
});
