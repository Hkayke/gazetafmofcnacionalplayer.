# Gazeta FM Nacional Player

Player web da Gazeta FM Nacional Roleplay com transmissão de áudio ao vivo via WebRTC e chat/pedidos de música em tempo real.

## Como funciona
- O locutor autentica no painel e libera o microfone pelo navegador.
- O áudio do microfone e a música selecionada no Deck são mixados no navegador e enviados aos ouvintes por WebRTC.
- O retorno local da voz e o retorno local da música podem ser ligados/desligados separadamente.
- Chat e pedidos de música são compartilhados em tempo real pelo servidor.
- O histórico de chat/pedidos fica em memória e é limpo quando o servidor reinicia.

## Executar localmente
Requer Node.js 18 ou superior.

```bash
npm install
LOCUTOR_USER=admin LOCUTOR_PASSWORD='coloque-uma-senha-forte-aqui' npm start
```

Abra http://localhost:3000. Para usar o microfone fora de localhost, o site precisa estar servido por HTTPS.

## Hospedar
Hospede como serviço Node.js (por exemplo, Render Web Service), usando a raiz deste repositório:
- Build command: `npm install`
- Start command: `npm start`
- Variáveis de ambiente:
  - `LOCUTOR_USER`: usuário do painel (ex.: admin)
  - `LOCUTOR_PASSWORD`: senha forte e exclusiva do locutor; obrigatória
  
Aponte o domínio do site para esse serviço Node.js. GitHub Pages sozinho não executa o servidor Socket.IO; para a transmissão ao vivo, o HTML e o servidor devem ser servidos pelo serviço Node.

## Rede e áudio
A conexão WebRTC usa servidores STUN públicos para tentar atravessar NAT. Algumas redes exigem um servidor TURN próprio para conectar todos os ouvintes de forma confiável. Para muitos ouvintes, considere um servidor de mídia SFU (como mediasoup/LiveKit), porque a conexão direta consome banda de upload do computador do locutor proporcionalmente ao número de ouvintes.

Use fones no retorno de voz para evitar eco/realimentação. O navegador precisa de permissão de microfone e de uma interação do usuário para iniciar o áudio.
