# GAZETA FM NACIONAL PLAYER — protótipo atualizado

Projeto front-end responsivo com identidade visual preta/vermelha e as áreas de ouvinte, login demonstrativo e painel de locução.

## Arquivos incluídos
- `index.html` — página pública, login e páginas/abas administrativas.
- `styles.css` — visual responsivo.
- `app.js` — navegação e interações locais.

## Como testar
1. Extraia o ZIP mantendo os três arquivos juntos dentro da pasta `gazeta-fm-site`.
2. Abra `index.html` em um navegador moderno. Para permitir microfone, use HTTPS ou `localhost` quando exigido pelo navegador.
3. Clique em **Painel do Locutor** no rodapé.
4. Credenciais apenas para demonstração local: `admin` / `gazeta123`.

## Páginas e áreas presentes
- Início do ouvinte com player e status demonstrativo.
- Programação, equipe e Mais Tocadas na página pública.
- Formulário de pedido de música.
- Login de demonstração e painel administrativo.
- Painel da locução com playlist local, controle de reprodução, volume e fade.
- Efeitos sonoros demonstrativos e solicitação de permissão de microfone.
- Edição local de programação, equipe, Mais Tocadas, nome do locutor e link do Discord.
- Caixa local para visualizar pedidos enviados neste mesmo navegador.

## Limitações importantes
Esta é uma prévia front-end, não uma rádio online em produção. O login é demonstrativo e não protege dados em um servidor. Os dados editados são salvos no armazenamento local do navegador e não sincronizam entre dispositivos. A abertura do microfone apenas solicita acesso local: não envia voz aos ouvintes. O status ONLINE/OFFLINE é manual e demonstrativo. Chat em tempo real, pedidos remotos, autenticação segura, banco de dados e transmissão real exigem backend e servidor de streaming (por exemplo, Icecast/SHOUTcast ou serviço equivalente).
