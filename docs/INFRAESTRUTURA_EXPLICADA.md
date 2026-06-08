# My Computer - Infraestrutura Explicada

Atualizado em 26/05/2026.

Este arquivo é o guia mais didático do projeto. A ideia é responder a pergunta:

**"O que acontece quando eu digito uma mensagem e aperto enviar?"**

## Resposta curta

```text
Browser -> Node local -> provider -> tools locais -> retorno no chat -> salvamento no runtime
```

O app não manda a conversa para lugar nenhum por acidente. Tudo sai da sua máquina para o provider escolhido ou para as tools que você habilitou.

## 1. O que roda no computador

- A interface é um HTML/CSS/JS puro em `src/panel/`.
- O servidor local é um Node HTTP server em `src/server/server.js`.
- O cérebro da conversa fica em `src/server/assistant.js`.
- As chamadas para providers ficam em `src/server/provider-client.js`.
- O catálogo de modelos fica em `src/server/models.js`.
- O estado persistente fica em `~/.my-computer`.

Se você quiser pensar de forma bem simples:

- `panel` desenha a tela.
- `server` recebe pedidos da tela.
- `assistant` monta o contexto e decide o próximo passo.
- `provider-client` fala com a IA.
- `tools` mexem na máquina local.

## 2. O caminho de uma mensagem

Quando você aperta enviar:

1. O painel manda a mensagem para o servidor local.
2. O servidor salva a mensagem do usuário no chat.
3. O assistant monta o prompt completo.
4. O provider recebe esse prompt.
5. Se a IA pedir uma tool, o assistant executa a tool.
6. O resultado da tool volta para a IA.
7. A resposta final volta para a interface.
8. Tudo relevante fica salvo no runtime.

Se a resposta falhar ou parar no meio:

- a tentativa anterior continua visível no chat
- `Tentar novamente` reenvia desde o início
- `Continuar` retoma a última saída parcial
- `Parar`, durante uma execução, interrompe o agente, cancela provider/terminal/compactação quando possível e salva a tentativa como incompleta
- `Ver detalhes` abre o processo salvo da tentativa e a janela de eventos relacionados carregados
- `Copiar eventos` leva os eventos carregados para análise

Falha de tool ou terminal também conta como falha real da tentativa: timeout e signal deixam a resposta incompleta em vez de aparecerem como sucesso. Exit code diferente de zero aparece no histórico; quando a IA pediu `returnOutput: true`, stdout/stderr voltam para ela continuar ou corrigir o comando.

## 3. O que entra no prompt

O prompt não é só a última mensagem. Ele é montado com várias peças:

- system prompt geral
- apelido do usuário
- idioma
- nível técnico
- memória persistente
- memória do chat
- contexto compactado
- histórico recente
- anexos
- configurações técnicas do modelo

Isso explica por que o app consegue continuar a conversa sem esquecer tudo.

Pastas de chat são só organização visual da lista dentro da seção atual. Elas ficam no metadado do chat, entram no backup/restore e não mudam o isolamento de dados.

## 4. Onde as coisas ficam salvas

Por padrão:

```text
~/.my-computer/
  config.json
  events.jsonl
  persistent-memory.md
  chats/<chat-id>/
    metadata.json
    messages.json
    memory.md
    context.md
    context-window.md
    attachments/
```

Em termos práticos:

- `config.json` guarda configurações globais.
- `messages.json` guarda o histórico do chat.
- `metadata.json` guarda provider, modelo e settings técnicos do chat.
- `memory.md` guarda memória só daquele chat.
- `persistent-memory.md` vale para todos os chats.
- `context.md` guarda o resumo longo do que já aconteceu.
- `context-window.md` mostra a janela atual usada pela IA.
- `events.jsonl` guarda eventos de debug e auditoria.

## 5. O que são tools

Tools são a forma da IA fazer alguma coisa de verdade no seu computador.

As principais são:

- `run_terminal_command`
- `web_search`
- `memory_chat`
- `persistent_memory`
- `persistent_memory_user`
- `edit_persistent_memory_user`
- `chat_document`
- `compact_context`
- `rename_chat`

Fluxo simples:

1. A IA pede a tool.
2. O app verifica se a tool está ligada.
3. Se for necessário, a UI pede aprovação.
4. A tool roda.
5. O resultado volta para a IA.
6. A resposta final aparece no chat.

Para saídas longas ou tarefas demoradas:

- a IA pode pedir `timeoutSeconds` na tool de terminal
- o backend espera o processo terminar antes de devolver `stdout`/`stderr`
- downloads e rotinas longas devem usar timeout maior, mas não infinito

`chat_document` e memória persistente adicional são caminhos diferentes:

- `persistent_memory_user` e `edit_persistent_memory_user` trabalham em arquivos de memória durável adicionados pelo usuário na seção de memória.
- `chat_document` trabalha em anexos de texto do chat atual, como `.md`, `.txt`, `.html`, `.json`, `.yaml`, código e logs.
- A edição de anexo altera só a cópia salva em `attachments/` dentro do runtime do chat; o arquivo original enviado de fora não é modificado.
- Quando `Sempre permitir qualquer tool` está desligado, qualquer uso de `chat_document` pede aprovação, inclusive leitura/listagem.
- Remover um anexo apaga a cópia do runtime e redige referências antigas em mensagens, contexto salvo, data URLs de imagem, previews de eventos e estados pendentes de tools para evitar reenvio/exportação do conteúdo apagado.

### Exemplo mental

- O usuário pede para listar arquivos.
- A IA decide usar `run_terminal_command`.
- O app executa o comando.
- A IA recebe o stdout e responde em cima do resultado.

## 6. Anexos

O app trata anexos de forma prática:

- Imagens podem ir para modelos que aceitam vision.
- Texto simples pode ser extraído localmente.
- Arquivos complexos continuam salvos como referência com caminho e metadados.
- O usuário continua vendo o preview e o que foi enviado para a IA.

Importante:

- O app valida tamanho e quantidade de anexos.
- Se o modelo não suporta imagem, a UI bloqueia ou avisa antes do envio.
- Vídeo e áudio ainda são tratados de forma mais conservadora no MVP.
- Anexos apagados podem continuar aparecendo como marcador no histórico, mas sem caminho local, preview ou texto extraído.

## 7. Provider e modelo

O usuário escolhe:

- provider padrão
- modelo padrão
- modelo por chat
- fallback/rotação quando quiser

O catálogo tem dois tipos de entrada:

- curada pelo projeto
- descoberta dinâmica no provider

Isso é o motivo do `Índice de modelos`: ele mostra o que é realmente útil, o que é só índice técnico e o que muda em runtime.

## 8. Rotação

Existe diferença entre duas coisas:

- `Rotatória de modelos`: troca apenas o modelo dentro do mesmo provider.
- `Rotatória de providers`: troca provider e modelo quando o provider atual falha.

A UI grava isso para o usuário não perder o histórico nem ficar tentando na mão.

## 9. Contexto e memória

O sistema usa três níveis de lembranca:

- memória do chat
- memória persistente
- contexto compactado

Se a conversa ficar longa, o app compacta o conteúdo antigo para caber melhor no prompt.
Isso evita que o chat vire um bloco gigante e inútil.

## 10. Rede local e segurança

Por padrão o painel escuta só na máquina local.

Se o usuário ligar o modo de rede:

- o próximo restart pode escutar em `0.0.0.0`
- a UI pede senha
- o acesso usa Basic Auth simples
- métodos mutáveis da API exigem header do painel e validação de origem para reduzir CSRF em rede local

Não é uma VPN, não é um sistema corporativo e não é uma fortaleza. É só uma forma prática de abrir o painel para a LAN com risco consciente.

## 11. Backup e restauração

O backup exporta o runtime em grupos selecionáveis:

- configuração completa, incluindo tema, providers, API keys, tools, contexto, rede e rotatórias
- memória persistente
- arquivos adicionais de memória persistente adicionados pelo usuário
- chats, mensagens, memórias e contexto salvo
- anexos
- eventos recentes para diagnóstico

Na restauração, a UI permite importar só os grupos escolhidos. Configuração importada substitui a configuração atual como snapshot completo, inclusive removendo modelos customizados e capacidades que não existam no backup. Importar chats sem anexos preserva o histórico sem referências clicáveis para anexos antigos. Chats importados não sobrescrevem chats atuais com o mesmo id. Importar arquivos adicionais de memória substitui o conjunto de arquivos adicionais da seção ativa pela cópia do backup, validando tipo/tamanho e usando staging antes da troca.

A exclusão de todos os chats remove apenas a pasta de chats da seção ativa. Configurações, memória persistente global e arquivos adicionais de memória persistente permanecem no runtime da seção.

## 12. Update e manutenção

O update assume que o projeto é um clone Git.

Fluxo:

1. verifica o remoto
2. compara se há commits novos
3. bloqueia se houver mudanças locais
4. aplica `git pull --ff-only`
5. roda `npm install`
6. reinicia o servidor

## 13. Como debugar sem sofrimento

Se algo quebrar:

- veja o `events.jsonl`
- confira o `Índice de modelos`
- abra o `metadata.json` do chat
- confira `config.json`
- veja se a provider key está correta
- veja se o modelo escolhido realmente suporta o que você quer

## 14. A ideia geral

O app é basicamente isto:

- uma UI local
- um servidor local
- um catálogo de modelos
- providers remotos ou locais
- tools com aprovação
- arquivos salvos no disco do usuário

Se você entendeu isso, já entendeu 90% do sistema.
