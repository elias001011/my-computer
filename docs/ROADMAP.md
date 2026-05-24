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
- Anexos por chat com extração de texto e suporte multimodal controlado por modelo.
- Tool de terminal.
- Tool de memória de chat.
- Compactacao e snapshot de contexto.
- Export/import de dados locais.
- Install/uninstall simples.

## Phase 1 - Safety and polish

- Confirmacao antes de comandos destrutivos ou sensiveis.
- UI melhor para detalhes de tool e logs.
- Streaming de progresso em tempo real.
- Edicao de variaveis de ambiente pelo painel.
- Mascaramento e protecao melhor de segredos.
- Testes de API e smoke test do painel.
- Parsers dedicados para PDF/DOCX e OCR local.
- Descoberta dinâmica de modelos quando o provider expuser API confiável.

## Phase 2 - Extensibility

- Presets adicionais de providers OpenAI-compatible.
- File APIs nativas dos providers quando fizer sentido, sem perder fallback local.
- Skills com manifestos e permissoes.
- Mais tools locais.
- Memoria prolongada entre chats.

## Phase 3 - Advanced capabilities

- Navegacao web.
- Automacao do computador fora do terminal.
- Multimodalidade mais completa.
- Voz por etapas: primeiro transcrição de voz para texto; depois TTS; só depois realtime/voz nativa se a UX pedir baixa latência e interrupções.
- Remote access seguro com autenticacao e transporte protegido.
