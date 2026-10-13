// Configurações básicas de conexão do cliente da rádio
const socket = io();

// Elementos da interface do player e do painel
const botaoPlay = document.getElementById('ouvirRadio') || document.querySelector('button');
const audioPlayer = document.getElementById('audioAudio') || new Audio();
const linkPainel = document.querySelector('a[href="#painel-do-locutor"]') || document.querySelector('.painel-link') || Array.from(document.querySelectorAll('a')).find(el => el.textContent.includes('Painel'));
const areaRestrita = document.getElementById('painel-do-locutor') || document.querySelector('.area-restrita');
const botaoFecharPainel = document.querySelector('.area-restrita .close') || document.querySelector('#painel-do-locutor .close') || document.querySelector('.area-restrita button');

let transmitindo = false;

// Função para abrir e fechar a caixinha do Painel do Locutor (Sua função original restaurada)
if (linkPainel && areaRestrita) {
    linkPainel.addEventListener('click', (e) => {
        e.preventDefault();
        areaRestrita.style.display = 'block'; // Mostra a tela de login do locutor
    });
}

if (botaoFecharPainel && areaRestrita) {
    botaoFecharPainel.addEventListener('click', () => {
        areaRestrita.style.display = 'none'; // Esconde a tela de login
    });
}

// Função para ligar e desligar o player de áudio com tratamento antiqueda
function alternarPlayer() {
    if (!transmitindo) {
        audioPlayer.src = "/radio.mp3";
        audioPlayer.crossOrigin = "anonymous";
        
        audioPlayer.play()
            .then(() => {
                transmitindo = true;
                if(botaoPlay) botaoPlay.innerText = "⏸ Pausar Rádio";
                console.log("[Player] Transmissão conectada com sucesso.");
            })
            .catch(err => {
                console.error("[Player] Bloqueio de Autoplay do navegador. Aguardando clique.", err);
            });
    } else {
        audioPlayer.pause();
        audioPlayer.src = ""; // Limpa o buffer
        transmitindo = false;
        if(botaoPlay) botaoPlay.innerText = "▶ Ouvir rádio";
        console.log("[Player] Transmissão interrompida pelo usuário.");
    }
}

// Vincula o evento de clique ao botão principal da rádio
if (botaoPlay) {
    botaoPlay.addEventListener('click', alternarPlayer);
}

// Tenta iniciar o som automaticamente assim que o site carregar na tela
window.addEventListener('DOMContentLoaded', () => {
    // Liga o cano de som de fundo
    audioPlayer.src = "/radio.mp3";
    audioPlayer.crossOrigin = "anonymous";
    
    // Tenta dar o play sozinho
    audioPlayer.play()
        .then(() => {
            transmitindo = true;
            if(botaoPlay) botaoPlay.innerText = "⏸ Pausar Rádio";
        })
        .catch(err => {
            console.log("[Aviso] O navegador bloqueou o som automático. O usuário precisa interagir com a página antes.");
        });
});

// Sincronização em tempo real de metadados via WebSockets
socket.on('atualizar-status', (dados) => {
    const statusTexto = document.getElementById('statusRadio');
    if (statusTexto && dados) {
        statusTexto.innerText = dados.emComunicacao ? "● AO VIVO" : "AUTOMÁTICO (AutoDJ)";
    }
});
