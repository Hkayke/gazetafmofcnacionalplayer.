const express = require('express');
const fs = require('fs');
const path = require('path');
const mp3Duration = require('mp3-duration');

const app = express();
const PORT = process.env.PORT || 3000;

// Pasta onde ficam os seus arquivos estáticos e as músicas
app.use(express.static(path.join(__dirname, 'public')));

// Lista global de ouvintes conectados
let ouuintes = [];

// Lista de arquivos de música .mp3
let musicas = [];
let musicaAtualIndex = 0;

// Carrega todas as músicas .mp3 da pasta public
function carregarMusicas() {
    const pastaPublic = path.join(__dirname, 'public');
    try {
        const arquivos = fs.readdirSync(pastaPublic);
        musicas = arquivos.filter(arq => arq.endsWith('.mp3'));
        console.log(`[AutoDJ] ${musicas.length} músicas encontradas.`);
    } catch (err) {
        console.error("[Erro] Não foi possível ler a pasta public:", err);
    }
}

// Inicia o motor do AutoDJ em loop infinito 24h
async function iniciarAutoDJ() {
    if (musicas.length === 0) {
        console.log("[AutoDJ] Nenhuma música encontrada. Aguardando arquivos...");
        setTimeout(carregarMusicas, 5000);
        return;
    }

    const nomeMusica = musicas[musicaAtualIndex];
    const caminhoMusica = path.join(__dirname, 'public', nomeMusica);

    console.log(`[AutoDJ] Tocando agora: ${nomeMusica}`);

    try {
        // Calcula a duração exata da música em milissegundos
        mp3Duration(caminhoMusica, (err, duration) => {
            let tempoDuracao = 180000; // Tempo padrão de 3 minutos caso dê erro
            if (!err && duration) {
                tempoDuracao = duration * 1000;
            }

            // Transmite os blocos de dados da música atual para todos os ouvintes conectados
            const streamLeitura = fs.createReadStream(caminhoMusica);
            
            streamLeitura.on('data', (chunk) => {
                ouuintes.forEach(res => {
                    try { res.write(chunk); } catch (e) {}
                });
            });

            streamLeitura.on('end', () => {
                // Quando a música termina, avança para a próxima da lista
                musicaAtualIndex = (musicaAtualIndex + 1) % musicas.length;
                iniciarAutoDJ();
            });
        });
    } catch (e) {
        console.error("[AutoDJ] Erro ao reproduzir arquivo. Pulando...", e);
        musicaAtualIndex = (musicaAtualIndex + 1) % musicas.length;
        setTimeout(iniciarAutoDJ, 1000);
    }
}

// Rota onde o player do seu site vai se conectar para ouvir a rádio
app.get('/radio.mp3', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });

    // Adiciona o ouvinte na lista de transmissão ativa
    ouuintes.push(res);

    // Remove da lista se o ouvinte fechar o site ou pausar
    req.on('close', () => {
        ouuintes = ouuintes.filter(cliente => cliente !== res);
    });
});

// Inicialização do servidor
carregarMusicas();
if (musicas.length > 0) {
    iniciarAutoDJ();
}

app.listen(PORT, () => {
    console.log(`[Servidor] Rodando com sucesso na porta ${PORT}`);
});
