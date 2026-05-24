# UI Spec

## Shape

O MVP é uma single-page app branca, minimalista e funcional.

### Setup inicial

Campos:

- Provider.
- API keys quando o provider exige, com botão para adicionar mais de uma key e alternar visibilidade.
- Endpoint/base URL quando o provider usa configuração local ou custom.
- Modelo padrão em um seletor, com opção de modelo personalizado.
- Idioma da IA, com `Automático` como padrão.
- Apelido do usuário.
- System prompt geral.
- Segurança inicial: aprovar tools por padrão, abrir para rede local e senha.

Quando Ollama é selecionado, a tela mostra um bloco de onboarding com:

- verificar instalação;
- tentar instalar pelo script oficial;
- baixar o modelo selecionado;
- remover modelos baixados;
- tentar desinstalar o Ollama;
- comando manual quando a instalação pelo navegador precisar de sudo/senha.

### Layout principal

Desktop usa três áreas fixas:

- Esquerda: marca, botão de novo chat, configurações gerais e lista de chats.
- Centro: cabeçalho do chat, mensagens, tool groups e composer.
- Direita: configurações compactas do chat, botões de prompt/memória, configurações do modelo, status e eventos.

A página não cresce conforme o chat: a área de mensagens rola internamente.

## Chat behavior

- O histórico é persistido por chat.
- Cada tool aparece agrupada como `Tool usada` e começa recolhida.
- Quando `Sempre permitir qualquer tool` está desligado, a tool aparece pendente com botões `Permitir` e `Negar`.
- Enquanto uma request está em andamento, a UI faz polling de eventos do chat e mostra status de tools solicitadas/concluídas.
- `run_terminal_command` mostra comando, stdout e stderr.
- `web_search` mostra query, método e fontes encontradas.
- `memory_chat` mostra input e resultado em JSON.
- Cada mensagem da IA tem botão de copiar.
- Erros de request aparecem na conversa e no painel com botão de retry.
- Quando uma request falha, o prompt do usuário permanece salvo no histórico com estado `falhou`; retry reaproveita essa mesma mensagem.
- O modelo ativo aparece no cabeçalho do chat.
- O usuário pode trocar provider e modelo do chat durante a conversa.
- `Enter` envia a mensagem; `Alt+Enter` insere nova linha.
- No mobile, o composer fica preso ao rodapé visual e o textarea cresce automaticamente até o limite.
- O texto ainda não enviado fica salvo em cache local por chat.
- No mobile, a área inferior mostra só o botão `Configurações de chat`; as configurações abrem em modal rolável.

## Attachments

- O composer tem botão de anexar arquivos.
- Arquivo anexado aparece em uma bandeja antes do envio.
- Imagens têm preview visual.
- Vídeos têm preview com player, mas são enviados como referência/caminho no MVP.
- Texto/HTML/código mostram trecho extraído.
- Cada anexo mostra um aviso de como será enviado para a IA.
- Quando há texto extraído, existe ação para colar o texto no composer.
- Imagens são bloqueadas quando o modelo ativo não suporta imagem.
- Há limite de 20 MB por arquivo e 8 anexos por mensagem no MVP.
- Quando o catálogo conhece limites de visão do modelo, a UI avisa e o backend bloqueia excesso.
- Modelos personalizados têm toggle para declarar suporte a imagens.
- Formatos sem extração ficam salvos no chat; a UI explica que a IA receberá caminho/metadados e poderá acessar via terminal.

## Model selection

- O setup define provider e modelo padrão.
- Chat novo usa automaticamente provider e modelo padrão.
- O chat guarda provider e modelo em `metadata.json`.
- Trocar provider/modelo durante o chat é permitido e gera evento.
- Cada seletor de modelo tem opção `Modelo personalizado`.
- Em Ollama, modelos instalados aparecem marcados e modelos ainda não instalados acionam pull automático no primeiro uso.
- Em Ollama, o painel consegue verificar instalação, instalar, puxar o modelo selecionado, remover modelos locais e tentar desinstalar o Ollama.

Trocar no meio pode mudar estilo, qualidade de tool calling e limite efetivo de contexto, mas não corrompe o histórico. Para o MVP, a regra é permitir, deixando visível e auditável.

## General settings modal

Inclui:

- Apelido.
- Provider padrão.
- Modelo padrão.
- Idioma.
- System prompt geral.
- Menu de providers e APIs, com endpoint/base URL por provider.
- Múltiplas API keys por provider, usadas em rotação quando uma chamada falha por autenticação, rate limit ou erro temporário.
- Orientação e gerenciamento do Ollama quando o provider selecionado para edição é Ollama.
- Memória persistente.
- Toggles de tools.
- Explicação avançada sobre tools e contexto.
- Método do terminal: padrão ou isolado leve.
- Aprovação de tools: sempre permitir ou pedir aprovação na UI.
- Pesquisa web e pesquisa via terminal.
- Compactação automática com limite estimado e intervalo mínimo.
- Rede local com senha única e aviso de restart.
- Export/import de configurações, chats, memórias e contexto.
- Botão para encerrar o servidor local, com instrução de como iniciar novamente.

## Context and memory controls

- `Salvar snapshot` cria snapshot em `context-snapshots/` e atualiza `context-window.md`.
- `Compactar contexto` atualiza `context.md` usando o provider/modelo do chat.
- O botão de caneta ao lado de compactar abre um modal para editar `context.md`.
- Compactação automática mostra um card no chat com arquivo, preview do conteúdo e botão para editar.
- O botão `Prompt e memória` abre um modal único para editar o system prompt do chat e `memory.md`.
- A IA também pode editar a memória via tool `memory_chat`.
- A IA pode editar memória global via `persistent_memory`.
- A IA pode compactar contexto via `compact_context`, se a tool estiver ligada.
- A IA pode renomear o chat via `rename_chat`, se a tool estiver ligada.

## Chat events

O painel de eventos mostra apenas eventos do chat ativo. Eventos globais continuam no arquivo `events.jsonl`, mas não poluem a visão de cada conversa.

## Model settings

O botão `Configurações do modelo` abre ajustes técnicos por chat:

- temperatura;
- top_p;
- máximo de tokens de saída;
- stop sequences;
- seed, penalties e reasoning effort quando o provider aceita.

Esses campos são salvos em `metadata.json` do chat. Parâmetros incompatíveis ficam ocultos para reduzir erros de API.
