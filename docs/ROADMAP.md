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
- Envio de email (Resend) só-saída, com destino fixo configurado pelo usuário; disponível como tool só dentro de tarefas agendadas, e como notificação automática de falha de tarefa.

## Phase 1 - Safety and polish

- Classificação de risco para comandos destrutivos ou sensíveis.
- UI melhor para detalhes de tool e logs.
- Streaming real de stdout/stderr durante tools longas.
- Edição de variáveis de ambiente pelo painel.
- Mascaramento e proteção melhor de segredos.
- Testes de API e smoke test do painel.
- Parsers dedicados para PDF/DOCX e OCR local.
- Descoberta dinâmica de modelos quando o provider expuser API confiável.
- Releases empacotadas/versionadas para o updater, se a distribuição por clone Git deixar de ser suficiente.

## Phase 2 - Extensibility

- Presets adicionais de providers compatíveis com OpenAI.
- File APIs nativas dos providers quando fizer sentido, sem perder fallback local.
- Adapter nativo do Gemini Files API para vídeo.
- Busca nativa dos providers quando o adapter suportar tools próprias de search.
- Skills com manifestos e permissões.
- Mais tools locais.
- Memória prolongada entre chats.

## Phase 3 - Advanced capabilities

- Navegação web interativa.
- Automação do computador fora do terminal.
- Multimodalidade mais completa.
- Voz por etapas: primeiro transcrição de voz para texto; depois TTS; só depois realtime/voz nativa se a UX pedir baixa latência e interrupções.
- Remote access seguro fora da rede local com autenticação, HTTPS e transporte protegido.
- Recebimento de email (conversar com a IA por email): duas abordagens em avaliação -- webhook (Resend Inbound, exige domínio público com MX e um endpoint alcançável da internet) ou polling IMAP de uma caixa real (chamada de saída, sem expor nada, mas fora do que o Resend oferece nativamente). A primeira só faz sentido em implantações que já são públicas; a segunda é a que mantém o princípio self-hosted privado por padrão.
- `send_email` como tool de uso livre em chat normal (hoje só existe dentro de tarefas agendadas).
- Painel de sessões/logins ativos do app, como base para notificações do tipo "alguém acessou sua conta".
