// Configurações básicas de conexão do cliente da rádio
const socket = io();

// Elementos da interface do player
const botaoPlay = document.getElementById('ouvirRadio') || document.querySelector('button');
const audioPlayer = document.getElementById('audioAudio') || new Audio();

let transmitindo = false;

// Função para ligar e desligar o player de áudio com tratamento antiqueda
function alternarPlayer() {
    if (!transmitindo) {
        // Conecta diretamente no endpoint interno de transmissão contínua do Render
        audioPlayer.src = "/radio.mp3";
        audioPlayer.crossOrigin = "anonymous";
        
        audioPlayer.play()
            .then(() => {
                transmitindo = true;
                if(botaoPlay) botaoPlay.innerText = "⏸ Pausar Rádio";
                console.log("[Player] Transmissão conectada com sucesso.");
            })
            .catch(err => {
                console.error("[Player] Erro ao iniciar o áudio do stream:", err);
            });
    } else {
        audioPlayer.pause();
        audioPlayer.src = ""; // Limpa o buffer para não consumir dados em segundo plano
        transmitindo = false;
        if(botaoPlay) botaoPlay.innerText = "▶ Ouvir rádio";
        console.log("[Player] Transmissão interrompida pelo usuário.");
    }
}

// Vincula o evento de clique ao botão principal da rádio
if (botaoPlay) {
    botaoPlay.addEventListener('click', alternarPlayer);
}

// Sincronização em tempo real de metadados via WebSockets
socket.on('atualizar-status', (dados) => {
    const statusTexto = document.getElementById('statusRadio');
    if (statusTexto && dados) {
        statusTexto.innerText = dados.emComunicacao ? "● AO VIVO" : "AUTOMÁTICO (AutoDJ)";
    }
});
