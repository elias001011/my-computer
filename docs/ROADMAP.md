# Roadmap

## Phase 0 - MVP atual

- Painel local em HTML/CSS/JS puro.
- Servidor Node local.
- Setup inicial com provider, API key e modelo padrão.
- Providers nomeados e provider custom OpenAI-compatible.
- Ollama com detecção de modelos instalados, pull automático, remoção de modelo e tentativa de desinstalação.
- Chat persistente.
- Provider/modelo por chat.
- Configurações técnicas de modelo por chat.
- Nível técnico do usuário com instrução opcional no prompt.
- Anexos por chat com extração de texto, preview de vídeo e suporte multimodal controlado por modelo.
- Tool de terminal com aprovação por UI e modo isolado leve.
- Tool de pesquisa web por terminal.
- Tool de memória de chat.
- Compactacao manual, snapshot, editor de contexto e compactação automática.
- Modo rede local com autenticação básica.
- Atualizador por Git local com confirmação e restart.
- Export/import de dados locais.
- Install/uninstall simples.

## Phase 1 - Safety and polish

- Classificação de risco para comandos destrutivos ou sensiveis.
- UI melhor para detalhes de tool e logs.
- Streaming real de stdout/stderr durante tools longas.
- Edicao de variaveis de ambiente pelo painel.
- Mascaramento e protecao melhor de segredos.
- Testes de API e smoke test do painel.
- Parsers dedicados para PDF/DOCX e OCR local.
- Descoberta dinâmica de modelos quando o provider expuser API confiável.
- Releases empacotadas/versionadas para o updater, se a distribuição por clone Git deixar de ser suficiente.

## Phase 2 - Extensibility

- Presets adicionais de providers OpenAI-compatible.
- File APIs nativas dos providers quando fizer sentido, sem perder fallback local.
- Adapter nativo do Gemini Files API para vídeo.
- Busca nativa dos providers quando o adapter suportar tools próprias de search.
- Skills com manifestos e permissoes.
- Mais tools locais.
- Memoria prolongada entre chats.

## Phase 3 - Advanced capabilities

- Navegacao web interativa.
- Automacao do computador fora do terminal.
- Multimodalidade mais completa.
- Voz por etapas: primeiro transcrição de voz para texto; depois TTS; só depois realtime/voz nativa se a UX pedir baixa latência e interrupções.
- Remote access seguro fora da rede local com autenticacao, HTTPS e transporte protegido.
