# UI Spec

Atualizado em 26/05/2026.

O painel é uma single-page app local, feita para abrir, configurar e usar sem precisar entender a estrutura interna do projeto.

## Visão geral

- Desktop usa 3 áreas principais: barra lateral, chat central e painel de configurações a direita.
- No mobile, as seções viram modais e painéis empilhados para caber na tela.
- O layout prioriza operação simples: abrir chat, escolher provider, escolher modelo e mandar mensagem.

## Setup inicial

O fluxo inicial pede:

- Provider padrão.
- API keys quando o provider exige.
- Endpoint ou base URL quando o provider usa instancia local ou endpoint custom.
- Modelo padrão.
- Idioma da IA.
- Apelido do usuário.
- Tema do painel.
- Nivel técnico.
- Toggle para adaptar a resposta ao nível técnico.
- System prompt geral.
- Tools iniciais: aprovar tools por padrão, incentivar investigação profunda e escolher modo de pesquisa web.
- Rede local: abrir para LAN e definir senha.

Se o provider for Ollama, o setup mostra um bloco próprio com:

- verificar instalação;
- instalar Ollama pelo script oficial;
- listar modelos locais;
- dar pull do modelo selecionado;
- remover modelos locais;
- tentar desinstalar o Ollama;
- comando manual quando sudo for necessário.

## Layout principal

### Desktop

- Esquerda: marca, novo chat, configurações gerais e lista de chats.
- Centro: cabeçalho do chat, mensagens, tools e composer.
- Direita: configurações do chat, memória, modelo, índice de eventos e status.

### Mobile

- O chat continua sendo a tela principal.
- Configurações e edições abrem em modal ou drawer.
- O composer cresce até um limite, sem empurrar a tela inteira para fora.

## Comportamento do chat

- O histórico fica salvo por chat.
- `Enter` envia.
- `Alt+Enter` quebra linha.
- A resposta da IA aparece com botão de copiar.
- Erros de request aparecem no próprio chat.
- Retry reaproveita a mensagem do usuário que falhou.
- Tentativas do assistente continuam visíveis quando há falha ou saída incompleta.
- `Tentar novamente` cria uma nova tentativa sem apagar a anterior.
- `Continuar` retoma a partir da última saída parcial e mostra a nova tentativa no mesmo grupo.
- `Ver detalhes` abre um modal com o processo salvo e a janela de eventos carregados relacionada à tentativa.
- `Copiar eventos` copia os eventos carregados do chat para auditoria ou debug.
- O modelo ativo aparece no cabeçalho.
- O usuário pode trocar provider e modelo no meio da conversa.
- O texto não enviado fica salvo localmente por chat.
- Tool calls são agrupadas, mostradas como blocos e podem ficar pendentes para aprovação.
- Conteúdo em `<think>` é removido da bolha principal e aparece em um bloco recolhível `Think do modelo`.

## Attachments

- O composer aceita arquivos.
- Imagens mostram preview.
- Vídeos mostram preview e player, mas no MVP o envio pode ser como referência/caminho quando o provider não suporta vídeo nativo.
- Texto, markdown, json, csv, html e código exibem texto extraído.
- Arquivos complexos ou sem extração confiável continuam no chat como referência explicável.
- O painel avisa quando o modelo não suporta imagem.
- O UI respeita o limite de 20 MB por arquivo e o limite de anexos por mensagem.

## Model selection

- O setup define provider e modelo padrão.
- Chat novo herda esse padrão.
- O chat grava `provider`, `model` e `modelSettings` no `metadata.json`.
- Trocar provider ou modelo durante o chat é permitido e gera evento.
- Cada seletor tem `Modelo personalizado`.
- Em Ollama, modelos instalados aparecem marcados e o app pode fazer pull automático quando necessário.
- O painel mostra `Índice de modelos` para comparar capacidade, limite e observações técnicas.

## General settings

O modal de configuração geral concentra o que o usuário precisa para operar o app sem abrir arquivo nenhum:

- Identidade: apelido, idioma, nível técnico e tema do painel.
- Providers e APIs: provider padrão, endpoint/base URL e múltiplas API keys.
- Rotação: rotatória de modelos e rotatória de providers com fallback.
- Models: modelo padrão, catálogo curado e índice técnico.
- Ollama: verificação, pull, remoção e desinstalação.
- Tools: terminal local, search mode, memória, compactação e rename.
- Rede: abertura em LAN com senha única e Basic Auth.
- Atualizações: estado do Git, diff, pull e restart.
- Export/import: backup e restauração seletivos de configuração completa, memória, chats, anexos e eventos.
- Segurança: avisos de sudo e de acesso remoto.

## Índice de modelos

O `Índice de modelos` mostra, para cada entrada do catálogo:

- provider
- id do modelo
- nome legivel
- se o modelo é selecionável
- se é apenas índice técnico
- visão
- raciocínio
- limite de contexto
- limite de saída
- observações de API

Esse índice existe para evitar adivinhação. O nome bonito do modelo não é suficiente para saber se ele aceita imagem, reasoning, áudio, vídeo ou rotação.

## Model settings

O botão `Configuracoes do modelo` abre ajustes técnicos por chat:

- temperatura
- top_p
- maxTokens
- stop sequences
- seed
- presencePenalty
- frequencyPenalty
- reasoningEffort

A UI só mostra o que faz sentido para o provider/modelo ativo. Parâmetros que o provider não suporta ficam ocultos para diminuir erro de API.

## Save states

- Alteracoes não salvas aparecem com destaque.
- Fechar configurações com pendencia pede confirmacao.
- Enviar mensagem com configurações pendentes pede confirmacao.
- O usuário pode salvar, descartar ou continuar editando.
- Enquanto uma ação está em andamento, envio, retry, continue e aprovações de tool ficam bloqueados para evitar duplicidade.
- Retry e Continue aparecem apenas na tentativa mais recente do grupo; tentativas antigas continuam visíveis, mas não disparam novas ramificações.

## Prompt, memória e contexto

- `Prompt e memória` abre um modal único para system prompt e memória do chat.
- `Salvar snapshot` grava o estado atual do contexto.
- `Compactar contexto` resume o chat em `context.md`.
- `Compactar automaticamente` aparece quando o limiar configurado é atingido.

## Search e tools

- Busca web pode ser `nativa`, `terminal`, `ambos` ou `desligada`.
- Terminal local pode ser `sem restricoes` ou `isolamento leve`.
- Tools locais podem exigir aprovação manual ou ficar em sempre permitir.
- A UI mostra claramente o status de cada tool, incluindo requests pendentes, permitidas, negadas, timeout, exit code e erro.

## Rede local e updates

- O painel pode escutar em `0.0.0.0` no próximo restart quando a rede local estiver ativada com senha.
- A interface mostra a URL local e os IPs LAN detectados.
- O update mostra status do Git antes de aplicar `git pull --ff-only && npm install`.
- Se houver mudanças locais, a UI bloqueia o update automático.

## Attachment viewer

- Imagem, vídeo, áudio e PDF usam visualizadores nativos do navegador.
- Texto, código e arquivos extraídos aparecem no painel.
- Formatos sem extração confiável mostram caminho e metadados.
