GAZETA FM NACIONAL PLAYER

PUBLICAR NO RENDER
1. Extraia o ZIP e envie os arquivos a um repositório GitHub.
2. Crie um Web Service no Render ligado ao repositório.
3. Build Command: npm install
4. Start Command: npm start
5. Em Environment Variables, defina LOCUTOR_PASSWORD com uma senha forte.
6. Publique e abra a URL fornecida.

USAR
- Abra Painel do Locutor e entre com nome e senha.
- Adicione até 4 músicas e até 10 arquivos de efeitos, vinhetas ou anúncios.
- Use Tocar em uma música específica ou Próxima música para avançar na playlist.
- Efeitos podem tocar por cima da música sem interromper a faixa.
- A mesa separa os volumes de microfone, música, efeitos e volume geral.
- Medidores mostram o nível de música, voz e efeitos separadamente.
- O retorno local opcional reproduz somente a música no dispositivo do locutor, sem a voz. Use fones para evitar eco.
- “Baixar música e próxima” faz uma transição gradual.
- O navegador tenta recuperar o áudio e a conexão após interrupções, e solicita manter a tela ativa quando suportado.

IMPORTANTE SOBRE SEGUNDO PLANO
Esta versão continua sendo uma transmissão WebRTC iniciada pelo navegador. Android/Chrome pode suspender a aba, o microfone ou a rede quando você troca de aplicativo, bloqueia a tela ou economiza bateria. O código agora tenta retomar áudio/reconectar, mas uma página web não pode garantir transmissão contínua quando o sistema a suspende. Para uma rádio que continue transmitindo mesmo com o painel fechado ou o celular em segundo plano, é necessário migrar a arquitetura para um servidor de streaming dedicado (por exemplo, Icecast/SHOUTcast ou serviço de streaming gerenciado) e enviar o áudio a esse servidor.

A conexão WebRTC usa servidor STUN público e pode falhar em algumas redes sem TURN. Arquivos de música/efeitos ficam no dispositivo do locutor e não são enviados para armazenamento no servidor. Use apenas áudio que você tenha autorização para transmitir. Configure LOCUTOR_PASSWORD antes de publicar; a senha padrão de desenvolvimento não é segura.


ATUALIZAÇÕES DE OUTUBRO/2026
- Marca oficial da Rádio Gazeta FM incluída no site.
- Chat público dos ouvintes com mensagens em tempo real.
- Pedidos de música com anexo de arquivo de áudio; o painel do locutor recebe um link para baixar o arquivo.
- Menu de três pontos com acesso à programação, chat, pedidos e painel do locutor.
- O locutor pode publicar uma imagem da programação; ela aparece para os ouvintes.

LIMITAÇÕES IMPORTANTES
O chat, pedidos e programação usam memória/armazenamento local do serviço e podem ser apagados quando o serviço reiniciar ou for redeployado, dependendo do plano e do disco configurado no Render. Para produção, configure armazenamento persistente. O upload de músicas aceita arquivos de até 25 MB.

A programação fantasma 24 horas ainda NÃO transmite sozinha quando o navegador do locutor fecha. Para isso é necessário adicionar um servidor de streaming contínuo (Icecast/SHOUTcast ou serviço equivalente), arquivos de áudio armazenados de forma persistente e uma playlist agendada executada no servidor. A interface informa essa limitação para não dar a impressão de que o recurso já está ativo.

MOTOR DE PROGRAMAÇÃO 24 HORAS (NOVO)
- A pasta radio-24h/ contém um serviço independente Icecast + FFmpeg para tocar uma playlist sem depender do navegador do locutor.
- Leia radio-24h/README-24H.txt antes de instalar. Ele precisa de uma VPS com Docker; não é ativado automaticamente no Render.
- Coloque músicas e vinhetas em radio-24h/music/ antes de enviar essa pasta ao servidor, ou copie-as diretamente para a pasta music/ na VPS.
- Depois de subir o serviço, configure o player público para usar o endereço de stream da VPS terminado em /live.mp3. Isso depende do endereço público da VPS.
