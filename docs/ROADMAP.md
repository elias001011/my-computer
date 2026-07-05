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

## Phase 2 - Extensibility

- Presets adicionais de providers compatíveis com OpenAI.
- File APIs nativas dos providers quando fizer sentido, sem perder fallback local.
- Adapter nativo do Gemini Files API para vídeo.
- Busca nativa dos providers quando o adapter suportar tools próprias de search.
- Skills com manifestos e permissões mais granulares (hoje skills já existem, sem esse controle extra).
- Mais tools locais.
- Memória prolongada entre chats.

## Phase 3 - Advanced capabilities

- Navegação web interativa com sessão (clicar, digitar, navegar mantendo estado entre chamadas) e console ao vivo -- exigiria uma camada CDP/WebSocket feita à mão; screenshot/leitura de página avulsos já existem (Phase 0).
- Automação do computador fora do terminal.
- Multimodalidade mais completa.
- Voz por etapas: primeiro transcrição de voz para texto; depois TTS; só depois realtime/voz nativa se a UX pedir baixa latência e interrupções.
- Remote access seguro fora da rede local com autenticação, HTTPS e transporte protegido.
- Recebimento de email (conversar com a IA por email): duas abordagens em avaliação -- webhook (Resend Inbound, exige domínio público com MX e um endpoint alcançável da internet) ou polling IMAP de uma caixa real (chamada de saída, sem expor nada, mas fora do que o Resend oferece nativamente). A primeira só faz sentido em implantações que já são públicas; a segunda é a que mantém o princípio self-hosted privado por padrão.
- `send_email` como tool de uso livre em chat normal (hoje só existe dentro de tarefas agendadas).
- Painel de sessões/logins ativos do app, como base para notificações do tipo "alguém acessou sua conta".
