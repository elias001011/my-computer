# v0.4.2 — o agente para de morrer em silêncio

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

## Cronômetro e contador de tokens (por tarefa)

Faixa discreta no topo da caixa de mensagem com o tempo e os tokens da **tarefa atual** — uma
coisa que você pediu —, atualizando enquanto o modelo trabalha e continuando na tela depois que
ele termina.

A unidade é a tarefa, não a execução. Uma tarefa costuma passar por várias execuções: cada auto
continue e cada retomada depois de aprovar uma tool é um run novo, e a primeira versão disso
reiniciava o relógio em cada uma delas — mostrando a última perna em vez do trabalho inteiro.
Agora os dois números são reconstruídos do que já está salvo em cada tentativa, então sobrevivem
a um reload, batem sempre com o Ver detalhes e contam uma tentativa refeita por retry (você
pagou por ela).

Os números de token vêm do `usage` que o próprio provider devolve, normalizado entre as três
formas que existem (OpenAI, Anthropic, Gemini) — com o cuidado de que o `prompt_tokens` da OpenAI
já inclui a parte cacheada e o `input_tokens` do Anthropic não, o que faria um dos dois contar em
dobro se tratados igual. Em Ver detalhes cada tentativa mostra entrada, saída e cache, e uma
tarefa com mais de uma tentativa ganha uma linha de total. A faixa é só exibição: desligar em
Identidade não para nenhum registro.

## Resposta completa deixa de ser marcada como incompleta

Quando o orçamento de rodadas de tools acabava, o app fazia uma última chamada sem tools para o
modelo fechar a resposta — e então marcava a tentativa como **incompleta de qualquer jeito**,
mesmo com o modelo tendo respondido e reportado `finish_reason: stop`. Com Auto continue ligado
o resultado era pagar uma execução inteira de uma tarefa que já tinha terminado.

Agora a classificação segue o que a chamada de fato reportou: com texto e sem truncamento, é
resposta completa. Truncada ou vazia, continua incompleta. Nos dois casos o limite de rodadas
fica registrado na tentativa, aparece como aviso no Ver detalhes e o Continuar segue disponível.

Vale a resposta direta pra pergunta que originou isso: **não existe uma tag de "output final"**
que o modelo emita. O que existe é o campo `finish_reason` na resposta da API (`stop`, `length`,
`tool_calls`...) e o MC sempre leu esse campo corretamente — o bug era um caminho do próprio app
que sobrescrevia esse veredito.

## Modelos personalizados

- Removido o "Modelo personalizado" fantasma do catálogo OpenAI compatível: ele aparecia no
  seletor como se fosse um modelo já configurado e era enviado literalmente como id do modelo
  para a API.
- Nova seção **Modelos personalizados** em Providers: cadastrar, editar e remover ids por
  provider, cada um com sua marcação de suporte a imagens.
- Escolher "Modelo personalizado" no seletor do chat abre uma janela que cadastra o modelo e já
  o seleciona, em vez de revelar um campo fácil de deixar vazio (o que gerava envio sem modelo
  nenhum). Cliente e servidor agora também recusam explicitamente um envio com modelo vazio.

## Interface

- A faixa do cronômetro saiu de cima da lista de mensagens e passou a viver dentro da própria
  faixa do composer — com isso a pílula preta (que existia só pra ficar legível sobre o chat)
  deixou de ser necessária e virou texto discreto. A bandeja de anexos vazia continuava ocupando
  uma linha do grid do composer e empurrava a faixa pra baixo; agora ela some quando não há anexo,
  e a faixa fica no topo do composer, alinhada ao botão de enviar.
- Botões que não funcionam durante uma execução agora aparecem desabilitados em vez de
  clicáveis-mas-inertes: trocar de chat, novo chat, criar seção, apagar chat e os botões de
  salvar das configurações. Abrir as configurações durante um run continua liberado (só salvar
  fica bloqueado, com o motivo escrito na tela).
- Corrigido o chat "pulando pra cima" quando a resposta atualizava: o painel restaurava a
  posição de rolagem antiga depois da lista crescer. Agora, se você estava lendo o final da
  conversa, continua no final.

## rename_chat parou de renomear o chat toda mensagem

A instrução que eu tinha escrito era imperativa ("sua primeira tool call **tem que** ser
rename_chat") com a condição "se o título ainda for genérico" dentro da frase. Modelos seguem o
imperativo e ignoram a condição — resultado: renomeavam o chat em toda mensagem, gastando uma
rodada de tool e uma chamada ao provider por turno, à toa.

Agora a decisão é do servidor, não do modelo: com o título ainda genérico entra a instrução
forte; com o chat já nomeado entra o oposto ("não chame rename_chat, só renomeie se o usuário
pedir"). Tem teste cobrindo os dois turnos.

## Contagem de tokens: um erro real e uma exibição incompleta

- **Erro:** ao retomar depois de aprovar uma tool, o total de antes da pausa era republicado como
  se fosse gasto em voo — e o painel soma o que está em voo em cima do que já está salvo nas
  mensagens. A parte anterior à aprovação era contada duas vezes.
- **Exibição:** o número não era mentiroso, mas contava só metade da história. Um total alto é
  normal e não é desperdício: um turno de agente faz uma chamada ao provider por rodada de tool, e
  cada uma reenvia a conversa inteira — então o valor é uma **soma de chamadas**, não o tamanho de
  uma requisição. O que decide a conta é quanto disso veio de cache, então a faixa agora mostra
  `100k tokens · 85% cache` e o tooltip explica de onde vem o número.

## Busca web: auditoria

Testei as tools de busca contra a internet de verdade, e a busca por terminal estava **retornando
zero resultado em 100% das consultas**. Causa: o DuckDuckGo passou a responder **403 Forbidden**
nos endpoints GET (`lite` e `html`) para qualquer User-Agent que se identifique.

Corrigido enviando o formulário do jeito que a própria página deles envia (POST com cabeçalhos de
navegador), o que voltou a trazer resultados relevantes — conferido em consultas técnicas e em
português. Mas com um limite honesto: é limitado por IP e passa a servir CAPTCHA depois de poucas
buscas seguidas (~20 requisições bastaram para virar "Select all squares containing a duck").

Quando isso acontece, a tool agora diz exatamente o que houve e **instrui o modelo a não inventar
fontes** — antes ela devolvia um erro genérico e o modelo tendia a preencher o vazio.

Também medi e descartei alternativas: Bing RSS responde, mas devolve resultados de outro assunto
em consultas técnicas (`PM2 max_memory_restart documentation` retornou um condomínio no Alabama —
errado com cara de certo é pior que vazio); Mojeek e Ecosia dão 403, Brave dá 429, e instâncias
públicas de SearXNG dão 403/429 ou HTML no lugar de JSON.

**Conclusão que ficou no roadmap:** raspagem não é base para essa feature. O caminho é o backend
de busca ser configurável com chave do usuário (Brave/Tavily/Serper têm plano grátis),
reaproveitando a tela de keys que já existe — continua zero-dependência, é só `fetch`. E vale
saber: hoje busca nativa existe só para OpenAI, Gemini, Anthropic, Groq e OpenRouter. Quem usa
`openai-compatible` (GLM, Kimi, Qwen) depende inteiramente do caminho best-effort acima.

## Roadmap

Documentado o desenho de **trabalho em background dirigido pelo usuário**: transformar um envio
em um job com id próprio que continua no servidor, para permitir tarefas simultâneas sem depender
de subagentes. Inclui os quatro pontos que precisam ser resolvidos antes de implementar
(limite global de jobs, aprovação de tool fora do chat, o que acontece no restart do processo, e
uma visão de "tarefas rodando agora").
