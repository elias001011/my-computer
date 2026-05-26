# UI Spec

Atualizado em 26/05/2026.

O painel e uma single-page app local, feita para abrir, configurar e usar sem precisar entender a estrutura interna do projeto.

## Visao geral

- Desktop usa 3 areas principais: barra lateral, chat central e painel de configuracoes a direita.
- No mobile, as secoes viram modais e paineis empilhados para caber na tela.
- O layout prioriza operacao simples: abrir chat, escolher provider, escolher modelo e mandar mensagem.

## Setup inicial

O fluxo inicial pede:

- Provider padrao.
- API keys quando o provider exige.
- Endpoint ou base URL quando o provider usa instancia local ou endpoint custom.
- Modelo padrao.
- Idioma da IA.
- Apelido do usuario.
- Nivel tecnico.
- Toggle para adaptar a resposta ao nivel tecnico.
- System prompt geral.
- Tema do painel.
- Seguranca inicial: aprovar tools por padrao, abrir para rede local e senha.

Se o provider for Ollama, o setup mostra um bloco proprio com:

- verificar instalacao;
- instalar Ollama pelo script oficial;
- listar modelos locais;
- dar pull do modelo selecionado;
- remover modelos locais;
- tentar desinstalar o Ollama;
- comando manual quando sudo for necessario.

## Layout principal

### Desktop

- Esquerda: marca, novo chat, configuracoes gerais e lista de chats.
- Centro: cabecalho do chat, mensagens, tools e composer.
- Direita: configuracoes do chat, memoria, modelo, indice de eventos e status.

### Mobile

- O chat continua sendo a tela principal.
- Configuracoes e edicoes abrem em modal ou drawer.
- O composer cresce ate um limite, sem empurrar a tela inteira para fora.

## Comportamento do chat

- O historico fica salvo por chat.
- `Enter` envia.
- `Alt+Enter` quebra linha.
- A resposta da IA aparece com botao de copiar.
- Erros de request aparecem no proprio chat.
- Retry reaproveita a mensagem do usuario que falhou.
- Tentativas do assistente continuam visiveis quando ha falha ou saida incompleta.
- `Tentar novamente` cria uma nova tentativa sem apagar a anterior.
- `Continuar` retoma a partir da ultima saida parcial e mostra a nova tentativa no mesmo grupo.
- `Ver detalhes` abre um modal com o processo completo, tools, outputs e eventos da tentativa.
- `Copiar eventos` copia o log bruto do chat para auditoria ou debug.
- O modelo ativo aparece no cabecalho.
- O usuario pode trocar provider e modelo no meio da conversa.
- O texto nao enviado fica salvo localmente por chat.
- Tool calls sao agrupadas, mostradas como blocos e podem ficar pendentes para aprovacao.

## Attachments

- O composer aceita arquivos.
- Imagens mostram preview.
- Videos mostram preview e player, mas no MVP o envio pode ser como referencia/caminho quando o provider nao suporta video nativo.
- Texto, markdown, json, csv, html e codigo exibem texto extraido.
- Arquivos complexos ou sem extracao confiavel continuam no chat como referencia explicavel.
- O painel avisa quando o modelo nao suporta imagem.
- O UI respeita o limite de 20 MB por arquivo e o limite de anexos por mensagem.

## Model selection

- O setup define provider e modelo padrao.
- Chat novo herda esse padrao.
- O chat grava `provider`, `model` e `modelSettings` no `metadata.json`.
- Trocar provider ou modelo durante o chat e permitido e gera evento.
- Cada seletor tem `Modelo personalizado`.
- Em Ollama, modelos instalados aparecem marcados e o app pode fazer pull automatico quando necessario.
- O painel mostra `Indice de modelos` para comparar capacidade, limite e observacoes tecnicas.

## General settings

O modal de configuracao geral concentra o que o usuario precisa para operar o app sem abrir arquivo nenhum:

- Identidade: apelido, idioma, nivel tecnico e tema do painel.
- Providers e APIs: provider padrao, endpoint/base URL e multiplas API keys.
- Rotacao: rotatoria de modelos e rotatoria de providers com fallback.
- Models: modelo padrao, catalogo curado e indice tecnico.
- Ollama: verificacao, pull, remocao e desinstalacao.
- Tools: terminal local, search mode, memoria, compactacao e rename.
- Rede: abertura em LAN com senha unica e Basic Auth.
- Atualizacoes: estado do Git, diff, pull e restart.
- Export/import: backup e restauracao seletivos.
- Seguranca: avisos de sudo e de acesso remoto.

## Indice de modelos

O `Indice de modelos` mostra, para cada entrada do catalogo:

- provider
- id do modelo
- nome legivel
- se o modelo e selecionavel
- se e apenas indice tecnico
- visao
- raciocinio
- limite de contexto
- limite de saida
- observacoes de API

Esse indice existe para evitar adivinhacao. O nome bonito do modelo nao e suficiente para saber se ele aceita imagem, reasoning, audio, video ou rotacao.

## Model settings

O botao `Configuracoes do modelo` abre ajustes tecnicos por chat:

- temperatura
- top_p
- maxTokens
- stop sequences
- seed
- presencePenalty
- frequencyPenalty
- reasoningEffort

A UI so mostra o que faz sentido para o provider/modelo ativo. Parametros que o provider nao suporta ficam ocultos para diminuir erro de API.

## Save states

- Alteracoes nao salvas aparecem com destaque.
- Fechar configuracoes com pendencia pede confirmacao.
- Enviar mensagem com configuracoes pendentes pede confirmacao.
- O usuario pode salvar, descartar ou continuar editando.

## Prompt, memoria e contexto

- `Prompt e memoria` abre um modal unico para system prompt e memoria do chat.
- `Salvar snapshot` grava o estado atual do contexto.
- `Compactar contexto` resume o chat em `context.md`.
- `Compactacao automatica` aparece quando o limiar configurado e atingido.

## Search e tools

- Busca web pode ser `nativa`, `terminal`, `ambos` ou `desligada`.
- Terminal local pode ser `sem restricoes` ou `isolamento leve`.
- Tools locais podem exigir aprovacao manual ou ficar em sempre permitir.
- A UI mostra claramente o status de cada tool, incluindo requests pendentes, permitidas e negadas.

## Rede local e updates

- O painel pode escutar em `0.0.0.0` no proximo restart quando a rede local estiver ativada com senha.
- A interface mostra a URL local e os IPs LAN detectados.
- O update mostra status do Git antes de aplicar `git pull --ff-only && npm install`.
- Se houver mudancas locais, a UI bloqueia o update automatico.

## Attachment viewer

- Imagem, video, audio e PDF usam visualizadores nativos do navegador.
- Texto, codigo e arquivos extraidos aparecem no painel.
- Formatos sem extracao confiavel mostram caminho e metadados.
