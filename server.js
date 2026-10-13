const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let ouvintesAtivos = [];
let bibliotecaMusicas = [];
let indiceMusica = 0;
let streamingAoVivo = false;

function atualizarMusicas() {
    const pastaPublic = path.join(__dirname, 'public');
    try {
        const arquivos = fs.readdirSync(pastaPublic);
        bibliotecaMusicas = arquivos.filter(arq => arq.endsWith('.mp3') && arq !== 'radio.mp3');
        console.log(`[AutoDJ] Músicas carregadas com sucesso: ${bibliotecaMusicas.length}`);
    } catch (e) {
        console.error("[Erro] Falha ao carregar músicas:", e);
    }
}

function processarAutoDJ() {
    if (streamingAoVivo) return; 
    if (bibliotecaMusicas.length === 0) {
        setTimeout(atualizarMusicas, 5000);
        return;
    }

    const musicaAtual = bibliotecaMusicas[indiceMusica];
    const caminhoCompleto = path.join(__dirname, 'public', musicaAtual);
    console.log(`[AutoDJ 24H] Transmitindo faixa: ${musicaAtual}`);

    const fluxoLeitura = fs.createReadStream(caminhoCompleto);

    fluxoLeitura.on('data', (blocoAudio) => {
        if (!streamingAoVivo) {
            ouvintesAtivos.forEach(res => {
                try { res.write(blocoAudio); } catch(err) {}
            });
        }
    });

    fluxoLeitura.on('end', () => {
        indiceMusica = (indiceMusica + 1) % bibliotecaMusicas.length;
        processarAutoDJ();
    });

    fluxoLeitura.on('error', (err) => {
        console.error("[AutoDJ] Erro na reprodução do arquivo:", err);
        indiceMusica = (indiceMusica + 1) % bibliotecaMusicas.length;
        setTimeout(processarAutoDJ, 1000);
    });
}

app.get('/radio.mp3', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    
    ouvintesAtivos.push(res);
    
    req.on('close', () => {
        ouvintesAtivos = ouvintesAtivos.filter(ouvinte => ouvinte !== res);
    });
});

io.on('connection', (socket) => {
    socket.on('entrar-ao-vivo', () => {
        streamingAoVivo = true;
        console.log("[Rádio] Um locutor entrou ao vivo. AutoDJ pausado.");
    });

    socket.on('audio-streaming', (dadosAudio) => {
        ouvintesAtivos.forEach(res => {
            try { res.write(dadosAudio); } catch(e){}
        });
    });

    socket.on('disconnect', () => {
        streamingAoVivo = false;
        processarAutoDJ();
    });
});

atualizarMusicas();
processarAutoDJ();

server.listen(PORT, () => {
    console.log(`[Servidor Inicializado] Rádio rodando na porta ${PORT}`);
});
