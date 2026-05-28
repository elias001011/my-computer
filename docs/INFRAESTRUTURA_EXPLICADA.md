# My Computer - Infraestrutura Explicada

Atualizado em 26/05/2026.

Este arquivo e o guia mais didatico do projeto. A ideia e responder a pergunta:

**"O que acontece quando eu digito uma mensagem e aperto enviar?"**

## Resposta curta

```text
Browser -> Node local -> provider -> tools locais -> retorno no chat -> salvamento no runtime
```

O app nao manda a conversa para lugar nenhum por acidente. Tudo sai da sua maquina para o provider escolhido ou para as tools que voce habilitou.

## 1. O que roda no computador

- A interface e um HTML/CSS/JS puro em `src/panel/`.
- O servidor local e um Node HTTP server em `src/server/server.js`.
- O cerebro da conversa fica em `src/server/assistant.js`.
- As chamadas para providers ficam em `src/server/provider-client.js`.
- O catalogo de modelos fica em `src/server/models.js`.
- O estado persistente fica em `~/.my-computer`.

Se voce quiser pensar de forma bem simples:

- `panel` desenha a tela.
- `server` recebe pedidos da tela.
- `assistant` monta o contexto e decide o proximo passo.
- `provider-client` fala com a IA.
- `tools` mexem na maquina local.

## 2. O caminho de uma mensagem

Quando voce aperta enviar:

1. O painel manda a mensagem para o servidor local.
2. O servidor salva a mensagem do usuario no chat.
3. O assistant monta o prompt completo.
4. O provider recebe esse prompt.
5. Se a IA pedir uma tool, o assistant executa a tool.
6. O resultado da tool volta para a IA.
7. A resposta final volta para a interface.
8. Tudo relevante fica salvo no runtime.

Se a resposta falhar ou parar no meio:

- a tentativa anterior continua visivel no chat
- `Tentar novamente` reenvia desde o inicio
- `Continuar` retoma a ultima saida parcial
- `Ver detalhes` abre o processo salvo da tentativa e a janela de eventos relacionados carregados
- `Copiar eventos` leva os eventos carregados para analise

Falha de tool ou terminal tambem conta como falha real da tentativa: timeout e signal deixam a resposta incompleta em vez de aparecerem como sucesso. Exit code diferente de zero aparece no historico; quando a IA pediu `returnOutput: true`, stdout/stderr voltam para ela continuar ou corrigir o comando.

## 3. O que entra no prompt

O prompt nao e so a ultima mensagem. Ele e montado com varias pecas:

- system prompt geral
- apelido do usuario
- idioma
- nivel tecnico
- memoria persistente
- memoria do chat
- contexto compactado
- historico recente
- anexos
- configuracoes tecnicas do modelo

Isso explica por que o app consegue continuar a conversa sem esquecer tudo.

## 4. Onde as coisas ficam salvas

Por padrao:

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

Em termos praticos:

- `config.json` guarda configuracoes globais.
- `messages.json` guarda o historico do chat.
- `metadata.json` guarda provider, modelo e settings tecnicos do chat.
- `memory.md` guarda memoria so daquele chat.
- `persistent-memory.md` vale para todos os chats.
- `context.md` guarda o resumo longo do que ja aconteceu.
- `context-window.md` mostra a janela atual usada pela IA.
- `events.jsonl` guarda eventos de debug e auditoria.

## 5. O que sao tools

Tools sao a forma da IA fazer alguma coisa de verdade no seu computador.

As principais sao:

- `run_terminal_command`
- `web_search`
- `memory_chat`
- `persistent_memory`
- `compact_context`
- `rename_chat`

Fluxo simples:

1. A IA pede a tool.
2. O app verifica se a tool esta ligada.
3. Se for necessario, a UI pede aprovacao.
4. A tool roda.
5. O resultado volta para a IA.
6. A resposta final aparece no chat.

Para saidas longas ou tarefas demoradas:

- a IA pode pedir `timeoutSeconds` na tool de terminal
- o backend espera o processo terminar antes de devolver `stdout`/`stderr`
- downloads e rotinas longas devem usar timeout maior, mas nao infinito

### Exemplo mental

- O usuario pede para listar arquivos.
- A IA decide usar `run_terminal_command`.
- O app executa o comando.
- A IA recebe o stdout e responde em cima do resultado.

## 6. Anexos

O app trata anexos de forma pratica:

- Imagens podem ir para modelos que aceitam vision.
- Texto simples pode ser extraido localmente.
- Arquivos complexos continuam salvos como referencia com caminho e metadados.
- O usuario continua vendo o preview e o que foi enviado para a IA.

Importante:

- O app valida tamanho e quantidade de anexos.
- Se o modelo nao suporta imagem, a UI bloqueia ou avisa antes do envio.
- Video e audio ainda sao tratados de forma mais conservadora no MVP.

## 7. Provider e modelo

O usuario escolhe:

- provider padrao
- modelo padrao
- modelo por chat
- fallback/rotacao quando quiser

O catalogo tem dois tipos de entrada:

- curada pelo projeto
- descoberta dinamica no provider

Isso e o motivo do `Indice de modelos`: ele mostra o que e realmente util, o que e so indice tecnico e o que muda em runtime.

## 8. Rotacao

Existe diferenca entre duas coisas:

- `Rotatoria de modelos`: troca apenas o modelo dentro do mesmo provider.
- `Rotatoria de providers`: troca provider e modelo quando o provider atual falha.

A UI grava isso para o usuario nao perder o historico nem ficar tentando na mao.

## 9. Contexto e memoria

O sistema usa tres niveis de lembranca:

- memoria do chat
- memoria persistente
- contexto compactado

Se a conversa ficar longa, o app compacta o conteudo antigo para caber melhor no prompt.
Isso evita que o chat vire um bloco gigante e inutil.

## 10. Rede local e seguranca

Por padrao o painel escuta so na maquina local.

Se o usuario ligar o modo de rede:

- o proximo restart pode escutar em `0.0.0.0`
- a UI pede senha
- o acesso usa Basic Auth simples

Nao e uma VPN, nao e um sistema corporativo e nao e uma fortaleza. E so uma forma pratica de abrir o painel para a LAN com risco consciente.

## 11. Backup e restauracao

O backup exporta o runtime em grupos selecionaveis:

- configuracao completa, incluindo tema, providers, API keys, tools, contexto, rede e rotatorias
- memoria persistente
- chats, mensagens, memorias e contexto salvo
- anexos
- eventos recentes para diagnostico

Na restauracao, a UI permite importar so os grupos escolhidos. Configuracao importada substitui a configuracao atual como snapshot completo, inclusive removendo modelos customizados e capacidades que nao existam no backup. Importar chats sem anexos preserva o historico, mas nao copia os arquivos anexados.

## 12. Update e manutencao

O update assume que o projeto e um clone Git.

Fluxo:

1. verifica o remoto
2. compara se ha commits novos
3. bloqueia se houver mudancas locais
4. aplica `git pull --ff-only`
5. roda `npm install`
6. reinicia o servidor

## 13. Como debugar sem sofrimento

Se algo quebrar:

- veja o `events.jsonl`
- confira o `Indice de modelos`
- abra o `metadata.json` do chat
- confira `config.json`
- veja se a provider key esta correta
- veja se o modelo escolhido realmente suporta o que voce quer

## 14. A ideia geral

O app e basicamente isto:

- uma UI local
- um servidor local
- um catalogo de modelos
- providers remotos ou locais
- tools com aprovacao
- arquivos salvos no disco do usuario

Se voce entendeu isso, ja entendeu 90% do sistema.
