# v0.4.0 — o agente para de morrer em silêncio

Esta versão tem um tema só: **um agente precisa funcionar antes de ser bonito.** A maior parte
do trabalho aqui saiu da investigação de um run real que morreu no meio de uma tarefa longa e
deixou o painel esperando para sempre.

## O que estava acontecendo

O run não falhou por culpa do modelo nem do provider. O processo do My Computer foi reiniciado
por baixo dele, quatro vezes, por estourar o limite de memória do supervisor:

```
Process restarted because it exceeds --max-memory-restart (current=213 MB, limit=200 MB)
                                                          (current=231 MB)
                                                          (current=367 MB)
```

A causa da memória era o próprio painel: enquanto um run está em andamento ele fazia polling a
cada 1,5 s numa rota que reparseia **todas** as mensagens do chat mais o `events.jsonl` inteiro
(que é append-only e nunca era rotacionado). Num chat de investigação isso é dezenas de MB de
lixo por segundo. E como o painel confiava apenas na requisição POST longa, quando o processo
morria ele não tinha como saber: a conexão ficava pendurada e a interface seguia mostrando
"trabalhando" para uma resposta que nunca ia chegar.

## Robustez

- **Rota de polling dedicada** (`/api/chats/:id/events`): devolve só a janela recente de eventos
  e se o run ainda está vivo. Não devolve mais o chat inteiro a cada tick.
- **Leitura do log de eventos só pela cauda**, e o log passa a ser aparado quando cresce demais,
  em vez de crescer para sempre.
- **Detector de execução morta**: se o servidor disser algumas vezes seguidas que não existe run
  naquele chat, o painel aborta a requisição pendente e diz o motivo, em vez de esperar
  indefinidamente. Testado reproduzindo o cenário exato — processo morto no meio com a conexão
  do cliente pendurada.
- Corrigido um `ReferenceError` que estourava em **toda** decisão de aprovação de tool
  (`chatId` declarado dentro do `try` e usado depois do `finally`).

## Economia de tokens

- **Cache de prompt volta a funcionar.** O relógio injetado no system prompt carregava timestamp
  com precisão de milissegundo, no começo do prompt — ou seja, o prefixo mudava em toda
  requisição e nenhum provider conseguia reaproveitar cache, nem do prompt nem do histórico
  atrás dele. Agora é arredondado para um bucket de 10 minutos e o prefixo fica idêntico ao
  longo de um loop inteiro de agente.
- **Anthropic** não faz cache automático, então suas requisições passam a levar breakpoints
  explícitos de `cache_control` no system prompt e nos schemas de tool.
- **Teto de saída de tools por mensagem** (configurável em Contexto). Cada resultado já tinha
  limite individual, mas a soma não tinha nenhum: um turno com 20+ comandos de terminal
  empilhava centenas de milhares de caracteres numa requisição só. Era o maior gasto de token do
  app e a razão de tentativas terminarem repetidamente em `finish_reason: length`. Passando do
  teto, as saídas mais antigas do turno viram um resumo curto; as recentes ficam inteiras.

## Prompt

- `terminal_session` agora é apresentada como o **padrão** para qualquer tarefa de mais de um
  passo, com o porquê (o estado sobrevive entre chamadas, então cada passo é um comando curto e
  se relê muito menos saída). Encadear com `&&` para evitar abrir sessão é explicitamente
  descrito como errado.
- `rename_chat` virou regra de ordem: com o título ainda genérico, é a **primeira** tool call do
  turno, não algo para o fim.

## Mensagens durante o trabalho do modelo

A caixa de mensagem continua editável enquanto o modelo trabalha. Com algo escrito, o botão de
interromper vira botão de enviar, e o envio entra numa fila em vez de cortar a execução. Dois
modos:

- **Na próxima tool** (padrão): a fila vai junto da próxima chamada à API, numa caixa
  "Complementos do usuário". Não interrompe nada e não perde o que já foi feito — serve para
  complementar ou mudar o rumo de uma tarefa demorada. Cada complemento entregue fica registrado
  em Ver detalhes.
- **Sequencial**: espera a saída final e envia como mensagem normal.

## Cronômetro

Contador discreto acima do botão de enviar enquanto a IA trabalha (desligável em Identidade). Só
conta tempo de máquina — o relógio para enquanto uma tool espera sua aprovação. O tempo de cada
tentativa fica salvo em Ver detalhes mesmo com o contador desligado.

## Modelos personalizados

- Removido o "Modelo personalizado" fantasma do catálogo OpenAI compatível: ele aparecia no
  seletor como se fosse um modelo já configurado e era enviado literalmente como id do modelo
  para a API.
- Nova seção **Modelos personalizados** em Providers: cadastrar, editar e remover ids por
  provider, cada um com sua marcação de suporte a imagens.
- Escolher "Modelo personalizado" no seletor do chat abre uma janela que cadastra o modelo e já
  o seleciona, em vez de revelar um campo fácil de deixar vazio (o que gerava envio sem modelo
  nenhum). Cliente e servidor agora também recusam explicitamente um envio com modelo vazio.

## Roadmap

Documentado o desenho de **trabalho em background dirigido pelo usuário**: transformar um envio
em um job com id próprio que continua no servidor, para permitir tarefas simultâneas sem depender
de subagentes. Inclui os quatro pontos que precisam ser resolvidos antes de implementar
(limite global de jobs, aprovação de tool fora do chat, o que acontece no restart do processo, e
uma visão de "tarefas rodando agora").
