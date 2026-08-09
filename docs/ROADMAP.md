# Roadmap

## Phase 0 - MVP atual

- Painel local em HTML/CSS/JS puro.
- Servidor Node local.
- Setup inicial com provider, API key e modelo padrão.
- Providers nomeados e provider custom OpenAI compatível.
- Ollama com detecção de modelos instalados, pull automático, remoção de modelo e tentativa de desinstalação.
- Chat persistente.
- Provider/modelo por chat.
- Configurações técnicas de modelo por chat.
- Nível técnico do usuário com instrução opcional no prompt.
- Anexos por chat com extração de texto, preview de vídeo e suporte multimodal controlado por modelo.
- Tool de terminal com aprovação por UI e modo isolado leve.
- Tool de pesquisa web por terminal.
- Tool de memória de chat.
- Compactação manual, snapshot, editor de contexto e compactação automática.
- Modo rede local com autenticação básica.
- Atualizador por Git local com confirmação e restart.
- Export/import de dados locais.
- Install/uninstall simples.
- Tarefas agendadas (diário/semanal/mensal/intervalo) com provider/modelo, allowlist de tools e contexto reduzido próprios, executadas por um timer interno ao processo.
- Busca em memória de arquivos de usuário por palavra-chave, sem precisar ler o arquivo inteiro.
- Orçamento configurável de histórico bruto de mensagens por chat, com opção de desligar por completo.
- Envio de email (Resend) só-saída, com destino fixo configurado pelo usuário; disponível como tool dentro de tarefas agendadas/comandos personalizados, e como notificação automática de falha de tarefa.
- Sessões de terminal persistentes (tmux) além do comando único sem estado, com janela própria no painel.
- Tool `send_file` (criar arquivo de texto novo ou anexar um já existente no disco).
- Tool `edit_file`: ler, listar e editar arquivos reais da máquina (não só anexos do chat), com aprovação nas escritas.
- Tool `browser`: screenshot (reenviado como imagem pro modelo com visão) e leitura de DOM/texto de páginas via Chromium headless -- navegação interativa/console continuam em avaliação, ver Phase 3.
- Skills: instruções reutilizáveis salvas pelo usuário (ou melhoradas por IA), só nome+descrição no prompt, corpo lido sob demanda.
- Comandos personalizados (`/trigger`): prompt fixo com tools pré-aprovadas, disparado ao vivo dentro do chat atual.
- Secrets/variáveis de ambiente: nome+descrição no prompt, valor nunca exposto ao modelo por padrão (injetado direto no ambiente de processos de terminal); tool de disclosure explícita sempre pede aprovação.
- Auto continue: retoma sozinho um run que parou incompleto por erro/limite recuperável.
- Edição de mensagens do usuário com fork da conversa e histórico arquivado.
- Limite de rodadas de tools por mensagem configurável pelo painel.
- `@` no composer: sugestão de tools e citação de caminho de arquivo/diretório.
- Drag-and-drop de arquivos no composer (além do seletor de arquivo), múltiplos arquivos por mensagem.
- Layout mobile com histórico de chats em drawer flutuante em vez de tarja fixa.
- Modelos personalizados gerenciáveis por provider na própria página de Providers, e cadastro por janela ao escolher "Modelo personalizado" no seletor do chat (o modelo passa a valer na mensagem seguinte, sem envio com modelo vazio).
- Mensagem enviada durante o trabalho do modelo entra numa fila em vez de interromper: modo "na próxima tool" (entregue junto da próxima chamada à API como "Complementos do usuário") ou "sequencial" (enviada como mensagem normal depois da saída final).
- Cronômetro discreto durante o trabalho da IA, com o tempo de cada tentativa salvo em Ver detalhes.
- Detecção de execução morta: o painel checa se o run ainda existe no servidor e desiste com explicação, em vez de esperar indefinidamente por uma resposta que não vem (foi o que acontecia quando o processo era reiniciado no meio de um run).
- Economia de tokens: prefixo de prompt estável para aproveitar o cache automático dos providers, `cache_control` explícito no Anthropic, e teto configurável de saída de tools por mensagem.

## Phase 1 - Safety and polish

- Classificação de risco para comandos destrutivos ou sensíveis.
- UI melhor para detalhes de tool e logs.
- Streaming real de stdout/stderr durante tools longas.
- Mascaramento e proteção melhor de segredos (hoje secrets/API keys ficam em texto claro no runtime, protegidos só por permissão de arquivo -- sem criptografia própria da aplicação).
- Testes de API e smoke test do painel.
- Parsers dedicados para PDF/DOCX e OCR local.
- Descoberta dinâmica de modelos quando o provider expuser API confiável.
- Releases empacotadas/versionadas para o updater, se a distribuição por clone Git deixar de ser suficiente.
- Skills, comandos personalizados e secrets no export/import (hoje não fazem parte do backup).
- Confinamento de path para `edit_file` (hoje alcança o que o usuário do SO alcança, igual o terminal já alcançava).
- **Busca web com backend confiável (chave própria do usuário).** Auditado em 2026-08-09: a busca por terminal raspa a página pública do DuckDuckGo, e isso deixou de funcionar — os endpoints GET (`lite`/`html`) respondem **403 Forbidden** para qualquer User-Agent que se identifique, então a tool retornava zero resultado em 100% das consultas. O formulário POST com cabeçalhos de navegador ainda responde (corrigido nesta versão, resultados relevantes confirmados), mas é limitado por IP e passa a servir CAPTCHA depois de poucas buscas seguidas — verificado: ~20 requisições bastaram para o DuckDuckGo devolver "Select all squares containing a duck" com status 202. Ou seja, raspagem não é base para uma feature. Também foram medidos, e descartados: Bing RSS (responde, mas devolve resultados de outro assunto para consultas técnicas — "PM2 max_memory_restart documentation" retornou um condomínio no Alabama, o que é pior que não responder), Mojeek/Ecosia (403), Brave (429) e instâncias públicas de SearXNG (403/429/HTML em vez de JSON). O caminho certo é o provider de busca ser configurável com chave do usuário (Brave Search API tem plano grátis, Tavily e Serper também), reaproveitando a tela de secrets/keys que já existe — continua zero-dependência, porque é só `fetch`. Enquanto isso não existe, quem usa provider **sem busca nativa** (é o caso do `openai-compatible`, que cobre GLM/Kimi/Qwen) fica efetivamente sem busca web: busca nativa só existe hoje para OpenAI, Gemini, Anthropic, Groq e OpenRouter.
- Streaming de resposta do modelo (hoje a resposta só aparece quando o turno termina; o painel mostra eventos de tool ao vivo, mas não o texto sendo gerado).
- Contagem de tokens de verdade: hoje todos os orçamentos (histórico, saída de tools, compactação automática) são medidos em caracteres, com ~4 caracteres ≈ 1 token como aproximação. Um tokenizer real por família de modelo tornaria os limites previsíveis e permitiria mostrar custo estimado por mensagem.
- Painel de uso/custo por provider e modelo, aproveitando o `usage` que a maioria dos providers já devolve (incluindo tokens lidos de cache, que hoje são recebidos e descartados).

## Phase 2 - Extensibility

- Presets adicionais de providers compatíveis com OpenAI.
- File APIs nativas dos providers quando fizer sentido, sem perder fallback local.
- Adapter nativo do Gemini Files API para vídeo.
- Busca nativa dos providers quando o adapter suportar tools próprias de search.
- Skills com manifestos e permissões mais granulares (hoje skills já existem, sem esse controle extra).
- Mais tools locais.
- Memória prolongada entre chats.
- Subagentes: o MC delega uma sub-tarefa a uma instância isolada de si mesmo, com tools e contexto próprios (reduzido, análogo ao que as tarefas agendadas já fazem), rodando em paralelo ou em série sem poluir o histórico do chat principal, e reportando o resultado de volta quando termina.
- **Trabalho em background dirigido pelo usuário** (independente de subagentes, e mais simples que eles): hoje um run é preso à requisição HTTP que o iniciou e a um lock por chat, então o usuário fica esperando de janela aberta e só consegue tocar uma tarefa por vez. A ideia é inverter isso: enviar uma mensagem cria um *job* com id próprio, a requisição devolve esse id na hora, e o run continua no servidor -- o painel acompanha por polling (a rota de eventos com liveness de run, criada na Fase 0, já é metade dessa infraestrutura). Consequências: fechar a aba, trocar de chat ou perder a conexão deixa de matar o acompanhamento; o usuário dispara tarefas simultâneas em chats diferentes de propósito, em vez de esperar em série; e uma tarefa demorada pode notificar no fim (a mesma saída de email/Telegram já existente). O que precisa ser desenhado com cuidado antes de implementar: (1) o lock por chat continua valendo por chat, mas o limite global de jobs simultâneos passa a ser explícito, porque cada job em voo custa memória e chamadas de provider ao mesmo tempo; (2) aprovação de tool num job em background precisa de uma fila de pendências visível fora do chat, senão um job trava esperando uma decisão que o usuário não vê; (3) reinício do processo mata os jobs em voo -- ou eles são persistidos e retomáveis, ou o estado precisa dizer "morreu, use Continuar" sem ambiguidade (o detector de run morto da Fase 0 é a base disso); (4) precisa de uma visão de "tarefas rodando agora" no painel, senão o usuário perde de vista o que disparou.

## Phase 3 - Advanced capabilities

- Navegação web interativa com sessão (clicar, digitar, navegar mantendo estado entre chamadas) e console ao vivo -- exigiria uma camada CDP/WebSocket feita à mão; screenshot/leitura de página avulsos já existem (Phase 0).
- Automação do computador fora do terminal.
- Multimodalidade mais completa.
- Voz por etapas: primeiro transcrição de voz para texto; depois TTS; só depois realtime/voz nativa se a UX pedir baixa latência e interrupções.
- Remote access seguro fora da rede local com autenticação, HTTPS e transporte protegido.
- Recebimento de email (conversar com a IA por email): duas abordagens em avaliação -- webhook (Resend Inbound, exige domínio público com MX e um endpoint alcançável da internet) ou polling IMAP de uma caixa real (chamada de saída, sem expor nada, mas fora do que o Resend oferece nativamente). A primeira só faz sentido em implantações que já são públicas; a segunda é a que mantém o princípio self-hosted privado por padrão.
- `send_email` como tool de uso livre em chat normal (hoje só existe dentro de tarefas agendadas).
- Painel de sessões/logins ativos do app, como base para notificações do tipo "alguém acessou sua conta".
- Integração com mensageiros (WhatsApp, Telegram): conversar com a própria instância do MC por um app de mensageria, configurado inteiramente pelo usuário (token do bot dele, secret de webhook dele) via `secrets`/config já existentes, sem depender de nenhuma gateway externa -- coerente com o MC ser open source e self-hosted. Caminho previsto: uma rota `/api/webhook/{canal}` que verifica o secret, mapeia o chat externo do mensageiro para um `chatId`/profile interno (tabela nova, análoga ao que já existe para profiles) e chama `sendUserMessage()` direto, o mesmo entrypoint que o painel já usa -- sem precisar de agent loop novo. Mesma tensão do recebimento de email: WhatsApp Cloud API e Telegram exigem endpoint público alcançável da internet, então essa feature pressupõe uma implantação já exposta (como a gateway desta VPS), não o MC 100% local por padrão.
