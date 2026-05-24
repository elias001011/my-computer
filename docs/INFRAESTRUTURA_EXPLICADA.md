# My Computer - Infraestrutura Explicada 🧠

## Índice
1. [Visão Geral da Arquitetura](#visão-geral-da-arquitetura)
2. [Como Funciona o Fluxo de Chat](#como-funciona-o-fluxo-de-chat)
3. [Sistema de Anexos](#sistema-de-anexos)
4. [O que é uma Tool e Como Funciona](#o-que-é-uma-tool-e-como-funciona)
5. [Todas as Tools Disponíveis](#todas-as-tools-disponíveis)
6. [Sistema de Contexto Interno](#sistema-de-contexto-interno)
7. [Mudança de Modelo no Meio da Conversa](#mudança-de-modelo-no-meio-da-conversa)
8. [Comportamento com Imagens](#comportamento-com-imagens)
9. [Como a IA se Lembra do Histórico](#como-a-ia-se-lembra-do-histórico)
10. [Executar Comandos no Terminal](#executar-comandos-no-terminal)
11. [Acessibilidade de Rede - IP Local vs Remoto](#acessibilidade-de-rede---ip-local-vs-remoto)
12. [Múltiplas Saídas de Terminal e Limitações de I/O](#múltiplas-saídas-de-terminal-e-limitações-de-io)
13. [Como Implementar uma Search Tool](#como-implementar-uma-search-tool)
14. [Fazer a IA Mexer no PC na Prática](#fazer-a-ia-mexer-no-pc-na-prática)
15. [Conectar a um Modelo de Conversação](#conectar-a-um-modelo-de-conversação)
16. [Sugestões de Melhorias](#sugestões-de-melhorias)

---

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                     NAVEGADOR DO USUÁRIO                     │
│              (HTML/CSS/JS puro - src/panel/)                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
         ┌─────────────────────────────┐
         │   NODE.JS HTTP SERVER       │
         │   (src/server/server.js)    │
         │   127.0.0.1:8787            │
         └────────────┬────────────────┘
                      │
        ┌─────────────┼──────────────┐
        ↓             ↓              ↓
    ┌────────┐  ┌────────────┐  ┌──────────┐
    │ASSISTANT│  │PROVIDER    │  │LOCAL     │
    │.js      │  │CLIENT.js   │  │TOOLS.js  │
    │(Orquestra)│  │(conecta)   │  │(executa) │
    └────────┘  └────────────┘  └──────────┘
        │             │              │
        └─────────────┼──────────────┘
                      ↓
         ┌─────────────────────────────┐
         │   ~/.my-computer (Storage)  │
         │  - config.json              │
         │  - chats/<chat-id>/          │
         │    - messages.json           │
         │    - metadata.json           │
         │    - memory.md               │
         │    - context.md              │
         │    - attachments/            │
         └─────────────────────────────┘
```

**Fluxo básico:**
1. Usuário digita mensagem no navegador
2. Navegador envia POST `/api/chats/<chat-id>/messages`
3. Servidor (assistant.js) processa a mensagem
4. Sistema monta o contexto com: sistema prompt + histórico + memórias + anexos
5. Envia para o provider (OpenAI, Groq, Ollama, etc)
6. IA responde e pode usar tools
7. Tools são executadas localmente
8. Resposta final é salva em `messages.json`
9. UI atualiza em tempo real

---

## Como Funciona o Fluxo de Chat

### 1. Usuário envia mensagem

```javascript
// No navegador, POST para:
/api/chats/<chat-id>/messages
Body: {
  content: "Olá, qual é a temperatura agora?",
  attachmentIds: ["img-123", "doc-456"]  // opcional
}
```

### 2. Assistant.js processa a mensagem

```javascript
// src/server/assistant.js - sendUserMessage()
1. Validar conteúdo não está vazio
2. Carregar config global (provider, modelo, idioma, etc)
3. Salvar mensagem do usuário em messages.json
4. Montar o sistema prompt completo
5. Selecionar histórico recente (até 28k chars)
6. Chamar o provider com as mensagens
```

### 3. Montagem do System Prompt

O sistema prompt inclui (em ordem):
1. **Instrução base**: "Você é My Computer..."
2. **Nome do usuário**: Se configurado
3. **Idioma**: Auto-detect ou idioma escolhido
4. **Tools disponíveis**: Lista qual tools estão habilitadas
5. **Instruções de uso**: Como chamar tools, quando usar memory, etc
6. **Paths locais**: Onde estão arquivos de memória e contexto
7. **Memória persistente**: Informações compartilhadas entre chats
8. **Memória do chat**: Informações específicas deste chat
9. **Contexto compactado**: Histórico antigo resumido
10. **Preferências do usuário**: Global e específicas do chat

Exemplo simplificado:
```
You are My Computer, a self-hosted AI assistant running on the user machine.
Call the user by this preferred name when natural: Elias.
Respond in Portuguese.
Available tools: run_terminal_command, web_search, memory_chat, persistent_memory, compact_context, rename_chat.

<persistent_memory_md>
# Memória Persistente
- Usuário trabalha com projetos de IA
- Prefere usar Groq por latência baixa
</persistent_memory_md>

<chat_memory_md>
# Memória do Chat
- Estamos configurando um servidor Node.js
- Runtime folder: ~/.my-computer
</chat_memory_md>

<compacted_context_md>
# Contexto Compactado
[Resumo de conversas antigas...]
</compacted_context_md>
```

### 4. Seleção do Histórico Recente

```javascript
// selectRecentMessages() - começa do final e volta
Max: 28,000 caracteres

Para cada mensagem (de trás pra frente):
- Renderizar a mensagem
- Contar tamanho
- Se totalizar > 28k, parar
- Selecionar as mais recentes que cabem
```

### 5. Chamada ao Provider

```javascript
callProviderChat({
  config: effectiveConfig,
  provider: 'groq',           // ou openai, ollama, etc
  model: 'llama-3.3-70b',
  messages: [
    { role: 'system', content: '...' },
    { role: 'user', content: 'Olá...' },
    { role: 'assistant', content: 'Olá! Como posso ajudar?' },
    // ... mais mensagens ...
  ],
  tools: [
    // Tools habilitadas em JSON Schema format
    run_terminal_command,
    memory_chat,
    compact_context,
    ...
  ],
  temperature: 0.2,
  maxTokens: 2048,
  modelSettings: { /* específico do provider */ }
})
```

### 6. Resposta da IA - Duas Possibilidades

**Opção A: Resposta direta (sem tools)**
```json
{
  "content": "A temperatura agora é 25°C conforme a previsão.",
  "tool_calls": null
}
```

**Opção B: IA precisa usar tools**
```json
{
  "content": "Deixa eu verificar a temperatura do seu PC...",
  "tool_calls": [
    {
      "id": "call-123",
      "function": {
        "name": "run_terminal_command",
        "arguments": "{\"command\": \"sensors\", \"timeoutSeconds\": 5}"
      }
    }
  ]
}
```

### 7. Execução de Tools (Loop de até 4 rodadas)

```javascript
// MAX_TOOL_ROUNDS = 4
for (let round = 0; round < 4; round++) {
  // Se não houve tool calls, saiu do loop
  if (!toolCalls.length) break;
  
  // Para cada tool chamada:
  for (const toolCall of toolCalls) {
    // 1. Executar a tool localmente
    const result = executeToolCall(chatId, toolCall);
    
    // 2. Adicionar resultado na conversa
    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      name: toolCall.function.name,
      content: JSON.stringify(result)
    });
    
    // 3. Registrar no histórico do chat
    appendToolUseEvent();
  }
  
  // 4. Chamar provider novamente com os resultados
  const response = callProviderChat({ messages });
  
  // Se resposta final, sair
  if (!response.tool_calls) {
    finalContent = response.content;
    break;
  }
}

// Se ficou em loop infinito de tools, fazer 1 chamada final sem tools
if (!finalContent) {
  finalContent = callProviderChat({ messages, tools: [] }).content;
}
```

### 8. Salvar Resposta

```javascript
// Mensagem do assistente é salva com metadados
{
  id: "msg-456",
  role: "assistant",
  content: "Aqui está o resultado...",
  createdAt: "2026-05-24T10:30:00Z",
  modelUsed: "llama-3.3-70b",
  providerUsed: "groq",
  toolUses: [
    {
      name: "run_terminal_command",
      input: { command: "sensors" },
      result: { exitCode: 0, stdout: "Core 0: 45°C..." }
    }
  ]
}
```

### 9. Atualizar Context Window

```javascript
// saveCurrentContextWindow() gera um snapshot do estado atual
// salva em: ~/.my-computer/chats/<chat-id>/context-window.md

# Context window - Seu Chat

- Chat: chat-2026-05-24-abc123
- Runtime: /home/elias/.my-computer
- Provider: groq
- Model: llama-3.3-70b

## General system prompt
[Suas preferências globais]

## Persistent memory
[Memória entre todos os chats]

## Chat preferences
[Preferências específicas deste chat]

## Chat memory
[Notas salvadas neste chat]

## Compacted context
[Histórico antigo resumido]

## Recent transcript
[Últimas mensagens]
```

---

## Sistema de Anexos

### Tipos de Arquivo e o que acontece com cada um

```javascript
// src/server/assistant.js - resolveMessageAttachments()

MÁXIMO: 8 anexos por mensagem, 20 MB por arquivo
```

#### 1. **Imagens** (jpg, png, webp, gif)

```javascript
if (modelSupportsImages && supportsImages) {
  // Verificar limites do modelo (ex: Groq Llama Scout = máx 5 imagens, 20 MB cada)
  if (imageCount > model.maxInputImages) throw Error();
  if (imageSizeMB > model.maxFileSizeMB) throw Error();
  
  // Converter para base64 e enviar como image_url
  content = [
    { type: 'text', text: 'Aqui está a imagem:' },
    {
      type: 'image_url',
      image_url: {
        url: 'data:image/png;base64,iVBORw0KGgo...'
      }
    }
  ]
} else {
  // Modelo não suporta imagens
  // Salvar no chat mas NÃO enviar para IA
  // IA recebe apenas: "[Imagem enviada: photo.png - não suportada por este modelo]"
}
```

#### 2. **Documentos de Texto** (txt, md, json, csv, html, código)

```javascript
// Extrair texto do arquivo
const extractedText = extractTextFromFile(file);

// Enviar como texto na mensagem
content += `
## Documento: report.csv
${extractedText}
[Truncado se > 12k chars]
`
```

#### 3. **Formatos Complexos** (pdf, docx, etc)

```javascript
// Não há extração automática no MVP
// Então:
// 1. Salvar arquivo em ~/.my-computer/chats/<chat-id>/attachments/
// 2. Enviar para IA o caminho do arquivo e metadados
// 3. IA pode usar run_terminal_command para processar

content += `
## Documento: contrato.pdf
Path: /home/elias/.my-computer/chats/chat-123/attachments/contrato-abc.pdf
Size: 2.3 MB
[IA pode executar: pdftotext /home/elias/.my-computer/chats/chat-123/attachments/contrato-abc.pdf]
`
```

### Fluxo de Armazenamento

```
1. Usuário seleciona arquivo no painel
   ↓
2. JavaScript do painel valida:
   - Tipo MIME
   - Tamanho (max 20 MB)
   - Tenta extrair texto (imagem → OCR futuramente, txt → direto)
   ↓
3. POST /api/chats/<chat-id>/attachments
   Body: FormData com arquivo
   ↓
4. Server (server.js):
   - Salvar em ~/.my-computer/chats/<chat-id>/attachments/
   - Gerar ID único
   - Extrair metadados (MIME type, size, nome)
   ↓
5. Salvar em attachments.json:
   [{
     id: "att-abc",
     name: "photo.jpg",
     path: "/home/elias/.my-computer/chats/.../attachments/photo-xyz.jpg",
     mimeType: "image/jpeg",
     size: 2048576,
     kind: "image",  // ou "document", "code", etc
     extractedText: "[Se conseguiu extrair]",
     extractionStatus: "success"  // ou "pending", "failed"
   }]
   ↓
6. Usuário envia mensagem com anexos
   Body: { content: "Veja essa foto", attachmentIds: ["att-abc"] }
   ↓
7. Assistant.js renderiza para modelo:
   - Se modelo suporta imagem: enviar como image_url
   - Se não suporta: enviar apenas metadados + caminho
```

---

## O que é uma Tool e Como Funciona

**Tools são funções que a IA pode chamar para fazer coisas no seu computador.**

Ao contrário de simplesmente responder com texto, a IA pode:
- Executar comandos no terminal
- Salvar memória para lembrar depois
- Renomear o chat
- Compactar histórico

### Anatomia de uma Tool

```javascript
// Em src/server/tools.js, cada tool tem 2 partes:

// PARTE 1: Definição (no formato JSON Schema)
export const terminalToolDefinition = {
  type: 'function',
  function: {
    name: 'run_terminal_command',
    description: 'Run a shell command on the user machine...',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The exact shell command to execute.'
        },
        timeoutSeconds: {
          type: 'number',
          description: 'Optional timeout in seconds, from 1 to 900.'
        }
      },
      required: ['command'],
      additionalProperties: false
    }
  }
};

// PARTE 2: Implementação (a função que de fato executa)
export async function runTerminalCommand(command, options = {}) {
  // ... usar spawn para executar comando ...
  // ... coletar stdout/stderr ...
  // ... respeitar timeout ...
  return {
    command,
    exitCode,
    stdout,
    stderr,
    durationMs,
    timedOut
  };
}
```

### Como a IA Chama uma Tool

```javascript
// 1. IA Gera um "tool call"
{
  id: "call-xyz",
  function: {
    name: 'run_terminal_command',
    arguments: '{"command": "ls -la", "timeoutSeconds": 5}'
  }
}

// 2. Assistant.js detecta tool_calls e executa
for (const toolCall of toolCalls) {
  const toolUse = await executeToolCall(chatId, toolCall);
  // toolUse = {
  //   id: "call-xyz",
  //   name: "run_terminal_command",
  //   input: { command: "ls -la", timeoutSeconds: 5 },
  //   result: { exitCode: 0, stdout: "total 48\ndrwxr-xr-x...", ... }
  // }
  
  // 3. Adicionar resultado na conversa para próxima rodada
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    name: toolUse.name,
    content: JSON.stringify(toolUse.result)  // max 12k chars
  });
}

// 4. Chamar provider novamente COM o resultado
// Assim a IA vê: "Executei seu comando e aqui está o resultado..."
const nextResponse = callProviderChat({ messages });
// IA pode:
// - Processar o resultado
// - Usar outro comando se necessário
// - Formular resposta final baseada nos resultados
```

### Fluxo Completo de uma Tool

```
IA recebe prompt
  ↓
Analisa: "O usuário pediu pra listar arquivos"
  ↓
"Preciso usar run_terminal_command com 'ls -la'"
  ↓
Gera tool_call:
{
  id: "call-123",
  function: {
    name: "run_terminal_command",
    arguments: "{\"command\": \"ls -la\", \"timeoutSeconds\": 5}"
  }
}
  ↓
Assistant.js recebe tool_call
  ↓
executeToolCall(chatId, toolCall)
  ↓
"run_terminal_command" → chamar função runTerminalCommand()
  ↓
spawn(ls -la) → aguardar resultado → coletar stdout/stderr
  ↓
Retornar: { exitCode: 0, stdout: "...", stderr: "", durationMs: 234 }
  ↓
Adicionar na conversa como mensagem "tool":
{
  role: 'tool',
  tool_call_id: 'call-123',
  name: 'run_terminal_command',
  content: '{"exitCode":0,"stdout":"...","stderr":""}'
}
  ↓
Chamar provider novamente
  ↓
IA vê resultado e formula resposta: "Encontrei 12 arquivos. Aqui estão:"
  ↓
Salvar resposta final em messages.json
  ↓
UI mostra resposta para usuário
```

---

## Todas as Tools Disponíveis

### 1. `run_terminal_command`

**O quê:** Executar comandos shell no seu computador.

**Definição:**
```javascript
{
  name: 'run_terminal_command',
  parameters: {
    command: string (obrigatório),
    timeoutSeconds: number (1-300, default 120)
  }
}
```

**Exemplo:**
```javascript
// IA chama:
{
  command: 'npm run build',
  timeoutSeconds: 60
}

// Resultado retornado:
{
  exitCode: 0,
  stdout: '> build\n> esbuild src/index.js',
  stderr: '',
  durationMs: 5234,
  timedOut: false
}
```

**Limitações:**
- timeout máximo: 300s (5 minutos)
- output máximo: 40KB (stdout + stderr)
- stdin é fechado automaticamente (não aceita input interativo)
- Se timeout, processo é morto
- Executa com CI=1 por padrão (para non-interactive mode)

**Use quando:**
- Listar arquivos: `ls -la /path`
- Compilar código: `npm run build`
- Verificar versões: `node --version`
- Instalar pacotes: `npm install --save package-name`
- Executar scripts: `python script.py`
- Ver status do sistema: `df -h`, `top`, `ps aux`

---

### 2. `memory_chat`

**O quê:** Salvar e recuperar memória que persiste NESTE CHAT.

**Definição:**
```javascript
{
  name: 'memory_chat',
  parameters: {
    action: 'read' | 'write' | 'append' (obrigatório),
    content: string (obrigatório para write/append),
    reason: string (obrigatório)
  }
}
```

**Exemplos de uso:**

```javascript
// 1. LER memória atual
{
  action: 'read',
  reason: 'Verificar se já salvei o token de API'
}

// Resultado:
'# Chat Memory\n\n## API Keys\n- GitHub: ghp_xxxx (atualizado)\n\n## Paths\n- Project: ~/projects/myapp\n'

// 2. ADICIONAR nota à memória
{
  action: 'append',
  content: '## Configurações\n- Database: PostgreSQL\n- Port: 5432',
  reason: 'Salvando configurações de banco de dados'
}

// 3. REESCREVER memória (escrever versão completa editada)
{
  action: 'write',
  content: '# Chat Memory\n\n## API Keys\n- GitHub: ghp_xxxx (atualizado)\n- Groq: gsk_yyyy\n\n## Paths\n- Project: ~/projects/myapp\n\n## Configurações\n- Database: PostgreSQL\n- Port: 5432',
  reason: 'Organizando todas as informações importantes deste chat'
}
```

**Arquivo armazenado em:**
```
~/.my-computer/chats/<chat-id>/memory.md
```

**Quando usar:**
- Salvando decisões do projeto
- API keys e tokens (⚠️ segurança: salva em texto claro no disco!)
- Caminhos de arquivos importantes
- TODOs específicos deste chat
- Preferências de compilação (flags, versões, etc)
- Nomes de variáveis ou convenções combinadas
- Histórico de erros e soluções neste chat

**Como é injetado:**
```
Toda vez que a IA responde, memory.md é lido e injetado no system prompt:

<chat_memory_md>
# Chat Memory
## API Keys
- GitHub: ghp_xxxx
...
</chat_memory_md>
```

---

### 3. `persistent_memory`

**O quê:** Memória compartilhada entre TODOS os chats.

**Definição:**
```javascript
{
  name: 'persistent_memory',
  parameters: {
    action: 'read' | 'write' | 'append' (obrigatório),
    content: string (obrigatório para write/append),
    reason: string (obrigatório)
  }
}
```

**Arquivo armazenado em:**
```
~/.my-computer/persistent-memory.md
```

**Exemplos:**

```javascript
// Usuário trabalha em múltiplos projetos
// Chat 1: Projeto de IA
// Chat 2: Projeto de backend
// Chat 3: Sistema embarcado

// Em qualquer chat, pode adicionar:
{
  action: 'append',
  content: '## Preferências\n- Editor: Neovim\n- Package manager: pnpm\n- Node version: 20.11.0',
  reason: 'Salvando minhas preferências globais de dev'
}

// Todos os 3 chats futuros terão acesso a essa memória
```

**Quando usar:**
- Preferências globais (editor, shell, terminal)
- Identidade do usuário (nome, nick, email)
- Projetos em andamento (status, caminhos, branches)
- Conhecimento reutilizável entre contextos
- Credenciais compartilhadas
- Documentação interna
- Padrões de projeto

---

### 4. `compact_context`

**O quê:** Resumir o histórico longo de um chat em contexto durável.

**Definição:**
```javascript
{
  name: 'compact_context',
  parameters: {
    reason: string (obrigatório)
  }
}
```

**O que acontece:**

```javascript
// 1. IA chama compact_context
{
  reason: 'Chat está com 150 mensagens, história é muito longa'
}

// 2. Assistant.js faz:
// - Renderizar últimas mensagens (até 120k chars)
// - Injetar no prompt com instrução: "Resume isso em Markdown"
// - Chamar IA novamente (em modo compactação, temp=0.1)
//
// Prompt enviado:
'Compact chat history into durable Markdown context.
Preserve decisions, user preferences, paths, commands run, unresolved tasks, and important facts.

Existing saved context:
[context.md atual]

Persistent memory:
[persistent-memory.md]

Chat memory:
[memory.md]

Transcript:
[últimas 120k chars de mensagens]'

// 3. IA gera resumo e salva em:
// ~/.my-computer/chats/<chat-id>/context.md

// Exemplo do que IA gera:
'# Context Summary

## Project Setup
- Node v20.11, pnpm, TypeScript
- Working on: /home/elias/projects/myapp

## Key Decisions
- Using PostgreSQL not MongoDB
- Vitest for testing, not Jest
- Database migrations with Knex

## Current Status
- Schema created and working
- 3/5 API endpoints implemented
- User authentication still pending

## Commands Run
- npm init -y
- pnpm install pg knex
- npx knex migrate:latest

## Next Steps
- Implement login endpoint
- Add password hashing with bcrypt
- Write tests for auth
'
```

**Quando usar:**
- Chat ficou > 50 mensagens
- Contexto importante que não quer perder
- Antes de mudança de modelo
- Quando história é muito longa pra caber na janela
- Preparar para conversa longa

**Arquivo gerado:**
```
~/.my-computer/chats/<chat-id>/context.md
```

---

### 5. `rename_chat`

**O quê:** Renomear o chat com um título descritivo.

**Definição:**
```javascript
{
  name: 'rename_chat',
  parameters: {
    title: string (obrigatório, 3-8 palavras),
    reason: string (obrigatório)
  }
}
```

**Exemplo:**

```javascript
// IA recebe primeira mensagem do usuário
// User: "Preciso de ajuda a configurar um backend com Node"
// IA: "Ok! Vou renomear esse chat..."
{
  title: 'Setup Backend Node.js com PostgreSQL',
  reason: 'User iniciou nova conversa sobre backend'
}

// Depois, conversa muda de direção
// User: "Ah, e preciso também de um CLI tool"
// IA: "Entendi, vou renomear novamente..."
{
  title: 'Backend Node + CLI Tool Script',
  reason: 'Escopo mudou significativamente'
}
```

**Arquivo atualizado:**
```
~/.my-computer/chats/<chat-id>/metadata.json
{
  "id": "...",
  "title": "Setup Backend Node.js com PostgreSQL",
  ...
}
```

---

## Sistema de Contexto Interno

### Estrutura Completa do Contexto

Toda vez que a IA responde, o sistema monta um contexto gigante em camadas:

```
CAMADA 1: SYSTEM PROMPT BASE
┌────────────────────────────────────────┐
│ "Você é My Computer..."                │
│ "Disponíveis tools: ..."               │
│ "Runtime folder: ~/.my-computer"       │
└────────────────────────────────────────┘
           ↓
CAMADA 2: MEMÓRIAS (LIDAS DO DISCO)
┌────────────────────────────────────────┐
│ <persistent_memory_md>                 │
│ # Memória Persistente                  │
│ [conteúdo de persistent-memory.md]     │
│ </persistent_memory_md>                │
│                                        │
│ <chat_memory_md>                       │
│ # Memória do Chat                      │
│ [conteúdo de memory.md]                │
│ </chat_memory_md>                      │
│                                        │
│ <compacted_context_md>                 │
│ # Contexto Compactado                  │
│ [conteúdo de context.md]               │
│ </compacted_context_md>                │
└────────────────────────────────────────┘
           ↓
CAMADA 3: HISTÓRICO RECENTE (SELECIONADO)
┌────────────────────────────────────────┐
│ [ últimas ~28,000 caracteres de msgs ] │
│ (descartando as mais antigas)          │
│                                        │
│ role: 'user'                           │
│ Qual é a temperatura?                  │
│                                        │
│ role: 'assistant'                      │
│ Tool used: run_terminal_command        │
│ Command: sensors                       │
│ Stdout: Core 0: 45°C...                │
│                                        │
│ role: 'user'                           │
│ E qual é a atual?                      │
└────────────────────────────────────────┘
           ↓
CAMADA 4: NOVA MENSAGEM DO USUÁRIO
┌────────────────────────────────────────┐
│ role: 'user'                           │
│ Aumenta muito se eu deixar rodando     │
│ o VSCode?                              │
└────────────────────────────────────────┘
```

### Tamanho Máximo de Cada Parte

```javascript
const MAX_CONTEXT_CHARS = 28000;        // Histórico recente
const MAX_CONTEXT_SAVE_CHARS = 120000;  // Para compactação
const MAX_TOOL_ROUNDS = 4;              // Máximo de rodadas tool
const MAX_ATTACHMENTS_PER_MESSAGE = 8;  // Arquivos por mensagem

// No renderProviderMessage():
const outputLimit = 40000; // máximo por comando terminal
truncate(toolResult, 12000); // resultado de tool truncado
```

### Estimativa de Tokens

O sistema não conta tokens direto, mas estima por caracteres:

```javascript
// src/server/assistant.js - estimateMessageSize()
function estimateMessageSize(content) {
  // Assumir ~4 caracteres por token (valor médio)
  return content.length / 4;
}

// Se content tem 28,000 chars = ~7,000 tokens de histórico
// + system prompt (pode ser 2000+ tokens)
// + nova mensagem (100-500 tokens)
// = até ~10,000 tokens por chamada (bem dentro de limites)
```

---

## Mudança de Modelo no Meio da Conversa

### O que acontece quando você muda de modelo

```javascript
// ANTES: config = {
//   provider: 'groq',
//   model: 'llama-3.3-70b'
// }

// USUÁRIO CLICA: Trocar modelo para OpenAI GPT-5.5
// PUT /api/chats/<chat-id>/metadata
// Body: {
//   provider: 'openai',
//   model: 'gpt-5.5-turbo'
// }

// DEPOIS: config = {
//   provider: 'openai',
//   model: 'gpt-5.5-turbo'
// }
```

### Impacto no Histórico

```javascript
// O histórico NÃO É RECRIADO
// Ele permanece igual em messages.json:
{
  messages: [
    { role: 'user', content: '...', createdAt: '...' },
    { role: 'assistant', content: '...', modelUsed: 'llama-3.3-70b' },
    { role: 'user', content: '...', createdAt: '...' },
    { role: 'assistant', content: '...', modelUsed: 'gpt-4' }  // <-- modelo diferente!
  ]
}

// Mas na PRÓXIMA mensagem que você enviar:
// - Usa o novo modelo (gpt-5.5-turbo)
// - Usa o novo provider (openai)
// - Passa TODO o histórico (incluindo respostas antigas de outro modelo)
```

### Caso 1: Mudança dentro do mesmo contexto de imagens

```javascript
// Chat 1: Você está usando GPT-5.5 (suporta imagens)
// Envia: [Foto do seu monitor com code]
// GPT-5.5 analisa a imagem

// Mudança: Você troca para Claude Opus (também suporta imagens)
// Próxima mensagem: "Analisa essa foto novamente"
// Claude Opus recebe: [mesma imagem convertida para base64]

// ✅ Funciona tranquilamente
```

### Caso 2: Modelo sem suporte a imagem (problema!)

```javascript
// Chat 1: Você está usando GPT-5.5 (suporta imagens)
// Mensagem 1: [Foto + "Analisa isso"]
// GPT-5.5: "Ok, foto mostra seu código..."

// Mudança: Você troca para Groq Llama (CLI model, sem visão)
// Próxima mensagem: "Continua analisando..."

// O que acontece:
// 1. Histórico antigo é repassado para Groq
// 2. Groq vê: "assistant": "Ok, foto mostra seu código..."
// 3. Mas não recebe a imagem desta vez (porque não suporta)
// 4. Groq pode:
//    a) Responder baseado apenas no texto da resposta anterior
//    b) Ficar confuso ("qual foto?")
//    c) Perguntar ("você pode descrever a foto?")

// ⚠️ Isso pode causar confusão na conversa!
```

### Como o código lida com isso

```javascript
// em buildProviderMessages():
const supportsImages = modelSupportsImages(
  config.provider,
  config.model,
  config
);

// Se estiver ENVIANDO NOVA mensagem COM imagem:
if (options.strictImageSupportForMessageId === userMessage.id) {
  const unsupportedImage = attachments.find(
    a => a.kind === 'image' && !supportsImages
  );
  
  if (unsupportedImage) {
    // ❌ Bloqueia ANTES de enviar
    throw new Error(
      `Modelo ${model} não suporta imagens. 
       Troque para um modelo vision ou ative "suporte a imagens".`
    );
  }
}

// Mas HISTÓRICO antigo com imagens?
// → Ele mantém no renderProviderMessage()
// → Se modelo não suporta, não envia a imagem novamente
// → IA vê apenas o texto: "[Imagem enviada: photo.png - não suportada por este modelo]"
```

**Resumo:**
- ✅ Histórico é preservado totalmente
- ✅ Próxima mensagem usa novo modelo
- ⚠️ Se mudar para modelo sem visão, histórico antigo não tem imagens reenviadas
- 🚫 Se tentar ENVIAR imagem em modelo sem visão, bloqueia com erro

---

## Comportamento com Imagens

### Jornada de uma Imagem no Sistema

```
PASSO 1: UPLOAD
┌──────────────────────────────────────┐
│ Usuário seleciona arquivo            │
│ (click em input type=file)           │
└──────────────────────────────────────┘
          ↓
PASSO 2: VALIDAÇÃO NO NAVEGADOR
┌──────────────────────────────────────┐
│ - Tipo MIME é image/*?               │
│ - Tamanho < 20 MB?                   │
│ - Já tem < 8 anexos?                 │
│ - Preview gerado (thumbnail)         │
└──────────────────────────────────────┘
          ↓
PASSO 3: ENVIO DO ARQUIVO
┌──────────────────────────────────────┐
│ POST /api/chats/<chat-id>/attachments│
│ Content-Type: multipart/form-data    │
│ Arquivo binário                      │
└──────────────────────────────────────┘
          ↓
PASSO 4: ARMAZENAMENTO NO SERVIDOR
┌──────────────────────────────────────┐
│ Salvar em:                           │
│ ~/.my-computer/chats/<chat-id>/      │
│ attachments/<unique-id>.jpg          │
│                                      │
│ Metadados em:                        │
│ ~/.my-computer/chats/<chat-id>/      │
│ attachments.json                     │
│ [{                                   │
│   id: "att-abc123",                  │
│   name: "photo.jpg",                 │
│   path: "...attachments/photo.jpg",  │
│   mimeType: "image/jpeg",            │
│   size: 2048576,                     │
│   kind: "image"                      │
│ }]                                   │
└──────────────────────────────────────┘
          ↓
PASSO 5: ENVIO COM MENSAGEM
┌──────────────────────────────────────┐
│ POST /api/chats/<chat-id>/messages   │
│ {                                    │
│   content: "Veja essa foto",         │
│   attachmentIds: ["att-abc123"]      │
│ }                                    │
└──────────────────────────────────────┘
          ↓
PASSO 6: VERIFICAÇÃO DE COMPATIBILIDADE
┌──────────────────────────────────────┐
│ getModelMetadata(provider, model)    │
│                                      │
│ Groq Llama Scout:                    │
│ - supportsImages: true               │
│ - maxInputImages: 5                  │
│ - maxFileSizeMB: 20                  │
│                                      │
│ Se 1 imagem < 5 e < 20MB: ✅         │
│ Se 10 imagens ou > 20MB: ❌ Error   │
└──────────────────────────────────────┘
          ↓
PASSO 7: CONVERSÃO PARA BASE64
┌──────────────────────────────────────┐
│ readAttachmentFile(chatId, attId)    │
│ ↓                                    │
│ fs.readFile(path)  // lê arquivo     │
│ ↓                                    │
│ .toString('base64') // converte      │
│ ↓                                    │
│ "iVBORw0KGgo..."                    │
│ (arquivo inteiro em texto base64)    │
└──────────────────────────────────────┘
          ↓
PASSO 8: ENVIO PARA IA
┌──────────────────────────────────────┐
│ messages = [                          │
│   {                                  │
│     role: 'user',                    │
│     content: [                       │
│       {                              │
│         type: 'text',                │
│         text: 'Veja essa foto'       │
│       },                             │
│       {                              │
│         type: 'image_url',           │
│         image_url: {                 │
│           url: 'data:image/jpeg;     │
│                base64,               │
│                iVBORw0K...'          │
│         }                            │
│       }                              │
│     ]                                │
│   }                                  │
│ ]                                    │
│                                      │
│ callProviderChat({ messages, ... })  │
└──────────────────────────────────────┘
          ↓
PASSO 9: IA PROCESSA
┌──────────────────────────────────────┐
│ GPT-5.5, Claude, Groq Llama (vision):│
│ "Vejo uma foto com seu código..."   │
│                                      │
│ Ollama sem vision model:             │
│ "Não consigo processar imagens..."  │
│                                      │
│ Groq Llama (não vision):             │
│ ❌ Error antes de enviar              │
└──────────────────────────────────────┘
```

### Casos de Uso por Tipo de Modelo

```javascript
// 1. MODELO COM VISÃO (GPT-5.5, Claude, Groq Llama Scout)
{
  supportsImages: true,
  maxInputImages: 5,
  maxFileSizeMB: 20
}
// Resultado: ✅ Imagem é convertida para base64 e enviada

// 2. MODELO SEM VISÃO (LLaMA 2, Groq Llama não-scout)
{
  supportsImages: false
}
// Resultado: 🚫 User tenta enviar → Error
// "Modelo não suporta imagens"

// 3. MODELO CUSTOMIZADO
// User clica: "Editar modelo" → Toggle "Este modelo suporta imagens"
{
  supportsImages: true,  // User marcou manualmente
  maxInputImages: null,  // User não sabe
  maxFileSizeMB: null
}
// Resultado: ✅ Envia imagem, espera que provider dê erro se houver limite
```

### O que Acontece se Tamanho Exceder

```javascript
// metadata = { maxFileSizeMB: 20 }
// attachment = { size: 25_000_000 }  // 25 MB

if (oversizedImage) {
  throw new Error(
    `A imagem ${name} excede o limite deste modelo (20 MB).`
  );
}

// User vê no painel: "Erro: imagem muito grande para esse modelo"
// Não consegue enviar
```

### Histórico com Mudanças de Suporte

```javascript
// Cenário: Você começa com GPT-5.5, depois muda para Ollama local

// Chat histórico:
[
  { role: 'user', content: [text, image_url], messageId: '1' },
  { role: 'assistant', content: 'Vejo uma foto de um gato...', messageId: '2' },
  { role: 'user', content: 'Continua...', messageId: '3' }
]

// Quando renderiza para Ollama (sem vision):
async function renderProviderMessage(chat, message, config) {
  const supportsImages = modelSupportsImages('ollama', 'llama2');
  // supportsImages = false
  
  const imageAttachments = attachments.filter(
    a => a.kind === 'image' && supportsImages
  );
  // imageAttachments = []  // Filtrou fora a imagem!
  
  if (!imageAttachments.length) {
    return { role: 'user', content: text };  // Sem imagem
  }
}

// Resultado: Ollama recebe apenas texto da mensagem 1
// "Continua..." sem contexto da imagem
// ⚠️ Pode ficar confuso!
```

---

## Como a IA se Lembra do Histórico

### Memória não é "aprendizado" - é contexto!

A IA **não aprende** como ChatGPT online. Cada conversa é isolada.

```javascript
// O que PARECE ser "memória":

CONVERSA 1:
User: "Meu nome é João"
IA: "Prazer, João!"

CONVERSA 2 (novo chat):
User: "Qual é meu nome?"
IA: "Desculpa, não me lembrei de você porque é um novo chat"

// Mas se for MESMA CONVERSA:

MENSAGEM 1:
User: "Meu nome é João"
IA: "Prazer, João!"

MENSAGEM 2:
User: "Qual é meu nome?"
IA: "Seu nome é João! Conversamos sobre isso acima."
```

### Como funciona a "memória" de verdade

```javascript
// 3 NÍVEIS DE PERMANÊNCIA:

NÍVEL 1: HISTÓRICO DO CHAT (current session)
├─ Arquivo: messages.json
├─ Duração: Enquanto o chat estiver aberto
├─ Alcance: Este chat apenas
├─ Como acessa: Renderiza últimas 28k chars no prompt
└─ Exemplo: "Lembrar de uma conversa de 1 hora atrás"

NÍVEL 2: MEMÓRIA DO CHAT (persistent within chat)
├─ Arquivo: memory.md
├─ Duração: Até usuário deletar o chat
├─ Alcance: Este chat apenas
├─ Como acessa: Injetada no system prompt TODA VEZ
├─ Controle: IA decide quando ler/escrever via tool
└─ Exemplo: "Lembrar que user usa PostgreSQL"

NÍVEL 3: MEMÓRIA PERSISTENTE (shared across chats)
├─ Arquivo: persistent-memory.md
├─ Duração: Até usuário deletar manualmente
├─ Alcance: TODOS os chats
├─ Como acessa: Injetada no system prompt TODA VEZ
├─ Controle: IA decide quando ler/escrever via tool
└─ Exemplo: "Lembrar que user é dev em português"
```

### Fluxo Detalhado de Recuperação de Contexto

```javascript
// 1. User envia mensagem nova

sendUserMessage(chatId, content)
  ↓
// 2. Carregar estado atual
const config = await loadConfig();
const chat = await readChat(chatId);
const persistentMemory = await readPersistentMemory();
  ↓
// 3. Montar system prompt
const systemPrompt = buildSystemPrompt(chat, config, persistentMemory);
// Inclui:
// - Instruções gerais
// - persistent-memory.md (lido do disco)
// - memory.md (lido do disco)
// - context.md (resumo compactado, se existir)
  ↓
// 4. Selecionar histórico recente
const messages = await selectRecentMessages(chat, config);
// Iterar de TRÁS pra frente
// Contar tamanho
// Parar em 28k chars
// Retornar as últimas que cabem
  ↓
// 5. Montar conversa final
const finalMessages = [
  { role: 'system', content: systemPrompt },
  ...messages  // histórico selecionado
];
  ↓
// 6. Chamar provider com TUDO
callProviderChat({
  messages: finalMessages,
  model: config.model,
  ...
});
  ↓
// 7. IA responde baseada em:
// - Seu system prompt (memórias globais)
// - Histórico recente
// - Memória do chat específico
// - Context compactado
// = "Memória artificial" via contexto inserido no prompt
```

### Por que 28k caracteres?

```javascript
const MAX_CONTEXT_CHARS = 28000;

// Estratégia: manter conversas recentes sempre disponíveis
// - 28k chars ≈ 7k tokens (aproximadamente)
// - +system prompt (2-3k tokens)
// - +nova mensagem (100-500 tokens)
// = ~9-10k tokens total por chamada
//
// Isso permite:
// ✅ 5-10 trocas de mensagens recentes
// ✅ Contexto suficiente para conversa coerente
// ✅ Espaço para tools + respostas de tools
// ✅ Mantém dentro de limites econômicos da maioria dos providers

// Se conversa é MUITO longa:
// → Use compact_context para resumir em context.md
// → Libera espaço para histórico ainda mais recente
```

### Exemplo Real

```
Você iniciou um chat "Setup Backend Node.js"

MENSAGEM 1:
You: "Preciso de um backend"
AI: [explica arquitetura]

... 20 horas depois ...

MENSAGEM 73:
You: "Lembras quando falei sobre banco de dados?"
AI: Processa assim:
  1. Lê último 28k chars de messages.json
     → Últimas ~15 mensagens estão lá ✅
     → Mensagem 1 provavelmente foi descartada ❌
  2. Lê memory.md
     → Se você salvou "Database: PostgreSQL" → lê ✅
     → Se você não salvou → não conhece
  3. Lê context.md
     → Se fez compact_context antes → lê ✅
     → Se não compactou → não tem esse resumo
  4. Usa tudo para responder
     → "Sim, você tinha escolhido PostgreSQL"

RESULTADO:
✅ Se você salvou em memory.md ou context.md: IA lembra
❌ Se foi apenas na conversa inicial: IA pode não lembrar
```

### Dica: Como Garantir que IA Lembra?

```javascript
// ❌ MÁ: Confiar apenas em histórico
User: "Vou usar PostgreSQL com Knex"
AI: "Ok, PostgreSQL com Knex!"
[...100 mensagens depois...]
User: "Qual banco decidimos?"
AI: "Hmmm, não tenho certeza..."

// ✅ BOM: Usar memory_chat
User: "Vou usar PostgreSQL com Knex"
AI: [chama memory_chat append]
  "## Banco de Dados\n- Engine: PostgreSQL\n- Migrations: Knex\n"
[...100 mensagens depois...]
User: "Qual banco decidimos?"
AI: [lê memory.md do disk]
  "Você escolheu PostgreSQL com Knex"
```

---

## Executar Comandos no Terminal

### Tudo Sobre `run_terminal_command`

```javascript
// Definição da tool
{
  name: 'run_terminal_command',
  parameters: {
    command: string,          // Comando shell exato
    timeoutSeconds: number    // 1-300 segundos (default 120)
  }
}
```

### Exemplos Práticos

```javascript
// 1. LISTAR ARQUIVOS
{
  command: 'ls -la ~/projects',
  timeoutSeconds: 5
}
// Resultado:
{
  exitCode: 0,
  stdout: 'total 48\ndrwxr-xr-x 5 elias ...',
  stderr: '',
  durationMs: 234
}

// 2. INSTALAR PACOTE
{
  command: 'npm install --save express',
  timeoutSeconds: 60
}
// (pode demorar mais tempo!)

// 3. EXECUTAR SCRIPT PYTHON
{
  command: 'python script.py',
  timeoutSeconds: 30
}

// 4. GIT COMMANDS
{
  command: 'git status'
}

// 5. VER VERSÃO
{
  command: 'node --version'
}

// 6. COMPOSTOS COM PIPES
{
  command: 'ls -la | grep "\.js$" | wc -l',
  timeoutSeconds: 10
}

// 7. COM VARIÁVEIS DE AMBIENTE
{
  command: 'NODE_ENV=production npm run build',
  timeoutSeconds: 120
}
```

### Que Tipos de Comando NÃO Funcionam

```javascript
// ❌ Comandos interativos (aguardam input)
{
  command: 'apt-get install -y package'
  // Problema: Pede confirmação
  // Solução: Adicionar -y ou --assume-yes flag
}

// ❌ Vim, nano, emacs
{
  command: 'vim file.txt'
  // Problema: precisa de terminal interativo
  // Solução: usar 'cat file.txt' ou 'sed' para editar
}

// ❌ Comando que lê stdin
{
  command: 'read -p "Digite seu nome: " name'
  // Problema: stdin é fechado no código
  // Solução: passar valor via comando direto
}

// ❌ Programas que abrem interface gráfica
{
  command: 'firefox https://example.com'
  // Problema: não tem display no servidor
  // Solução: usar command-line only ou headless mode
}
```

### Internals - Como Executa na Prática

```javascript
// src/server/tools.js - runTerminalCommand()

export async function runTerminalCommand(command, options = {}) {
  const timeoutMs = Math.min(
    Math.max(options.timeoutSeconds * 1000 || 120000, 1000),
    300000  // máximo 5 minutos
  );
  const outputLimit = 40000;  // máximo 40KB de output
  
  let stdout = '';
  let stderr = '';
  let timedOut = false;

  return new Promise((resolve) => {
    // 1. Spawn o processo
    const child = spawn(command, {
      cwd: process.env.HOME,
      shell: process.env.SHELL || true,  // usar /bin/bash ou /bin/sh
      detached: true,  // se demorar, matar árvore de processos
    });

    // 2. Fechar stdin (não aceita input)
    child.stdin?.end();

    // 3. Setup timeout
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);  // matar processo e filhos
    }, timeoutMs);

    // 4. Coletar stdout
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      if ((stdout + text).length > outputLimit) {
        stdoutTruncated = true;
        stdout = (stdout + text).slice(0, outputLimit);
      } else {
        stdout += text;
      }
    });

    // 5. Coletar stderr
    child.stderr.on('data', (chunk) => {
      // ... similar ao stdout ...
    });

    // 6. Quando fecha
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        command,
        exitCode,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        truncated: stdoutTruncated || stderrTruncated
      });
    });
  });
}
```

### Ambientes e Variáveis

```javascript
// Processo é executado com:
{
  env: {
    ...process.env,  // herda tudo do servidor
    CI: process.env.CI || '1'  // força non-interactive
  },
  cwd: process.env.HOME || '/home/elias'
}

// Então se você tiver:
// export NODE_ENV=development
// Mas tentar:
// { command: 'echo $NODE_ENV' }
// Resultado: "1" ou vazio, porque CI=1 sobrescreve

// Solução: passar explicitamente
{
  command: 'NODE_ENV=production echo $NODE_ENV'
}
```

### Truncamento

```javascript
// Se output > 40KB, é cortado

// Exemplo:
{
  command: 'cat huge-log-file.txt'
  // Se arquivo tem 500MB
  // Result.stdout terá apenas primeiros 40KB
  // Result.truncated = true
}

// Para evitar:
{
  command: 'tail -c 40000 huge-log-file.txt'
  // pega últimos 40KB
}
```

---

## Acessibilidade de Rede - IP Local vs Remoto

### O Servidor Está Vinculado a Localhost

```javascript
// Em src/server/server.js
export async function startServer({ 
  port = Number(process.env.PORT || 8787), 
  host = '127.0.0.1'  // ← AQUI! Localhost only
} = {}) {
  // ...
  const url = `http://${host}:${actualPort}`;
  return { server, url, runtimeHome };
}
```

### O que Significa `127.0.0.1`

| Aspecto | Detalhes |
|--------|----------|
| **Nome** | localhost (loopback address) |
| **Alcance** | Apenas este computador |
| **De outro dispositivo na rede** | ❌ Não acessível |
| **VPN/SSH tunnel** | ⚠️ Possível com port forwarding |
| **URL local** | `http://127.0.0.1:8787` ou `http://localhost:8787` |

### Como Funciona Atualmente

```
SEU COMPUTADOR
├─ Navegador (Chrome, Firefox, etc)
│  └─ http://127.0.0.1:8787  ✅ Funciona
│
└─ Node.js Server
   └─ Escuta em 127.0.0.1:8787

OUTRO COMPUTADOR NA REDE
├─ Tenta: http://<seu-ip>:8787
│  └─ ❌ Timeout (conexão recusada)
│
└─ Razão: Servidor não está escutando em 0.0.0.0
```

### Para Usar de Outro Dispositivo (Não Recomendado em MVP)

Se você REALMENTE quer acessar de outro PC, seria necessário:

**Opção 1: SSH Tunnel (mais seguro)**
```bash
# No seu PC com My Computer rodando:
ssh -R 8787:127.0.0.1:8787 user@remote-server
# Agora remote-server consegue acessar via localhost:8787

# Ou em reverse:
# No outro PC:
ssh -L 8787:127.0.0.1:8787 user@seu-pc
# Então acessa: http://localhost:8787
```

**Opção 2: Alterar host no código (não recomendado)**
```javascript
// Mudar em src/server/server.js
export async function startServer({ 
  port = Number(process.env.PORT || 8787), 
  host = '0.0.0.0'  // ← Acessível de qualquer lugar!
} = {}) {
```

⚠️ **Problema**: Qualquer um na rede conseguiria acessar sua IA e executar comandos no seu PC!

### Segurança

```javascript
// MVP atual = seguro por padrão (localhost only)
// Qualquer um que acessa:
// - Consegue mexer no seu PC
// - Consegue ler/escrever arquivos
// - Consegue executar comando shell (RCE = Remote Code Execution)

// Por isso localhost-only é correto para MVP!
```

---

## Múltiplas Saídas de Terminal e Limitações de I/O

### Como o Sistema Coleta Output

```javascript
// Em src/server/tools.js - runTerminalCommand()

// Quando você envia comando:
const child = spawn(String(command || ''), {
  cwd: process.env.HOME,
  shell: process.env.SHELL || true,
  detached: true,
});

// Sistema coleta TUDO que o comando outputa:
child.stdout.on('data', (chunk) => {
  const collected = collect(stdout, chunk.toString(), outputLimit);
  stdout = collected.value;        // Acumula stdout
  stdoutTruncated ||= collected.truncated;  // Marca se truncou
});

child.stderr.on('data', (chunk) => {
  const collected = collect(stderr, chunk.toString(), outputLimit);
  stderr = collected.value;        // Acumula stderr
  stderrTruncated ||= collected.truncated;
});

// Quando processo fecha:
child.on('close', (exitCode, signal) => {
  resolve({
    command,
    exitCode,
    stdout,          // ← TODO o stdout acumulado
    stderr,          // ← TODO o stderr acumulado
    durationMs,
    timedOut,
    truncated: stdoutTruncated || stderrTruncated
  });
});
```

### Fluxo de Saídas Múltiplas

```
COMANDO COM MÚLTIPLAS LINHAS:
$ for i in {1..5}; do echo "Linha $i"; sleep 1; done

TEMPO 0ms → Linha 1 ✅ (coleta em stdout)
TEMPO 1s → Linha 2 ✅ (coleta em stdout)
TEMPO 2s → Linha 3 ✅ (coleta em stdout)
TEMPO 3s → Linha 4 ✅ (coleta em stdout)
TEMPO 4s → Linha 5 ✅ (coleta em stdout)
TEMPO 5s → Processo fecha

RESULTADO RETORNADO:
{
  command: "for i in {1..5}; do echo \"Linha $i\"; sleep 1; done",
  exitCode: 0,
  stdout: "Linha 1\nLinha 2\nLinha 3\nLinha 4\nLinha 5\n",
  stderr: "",
  durationMs: 5123,
  timedOut: false
}
```

### Ou Seja: Tudo É Retornado no Final

✅ **Funciona bem para:**
- Comandos que output é importante no final
- Scripts que rodam sozinhos
- Compilações (gradle, npm build)
- Operações de arquivo

❌ **Não funciona para:**
- Processos interativos (aqueles que fazem perguntas)
- Servers que ficam rodando (nginx, node, postgres)
- Monitoramento em tempo real (watch, tail -f)
- Qualquer coisa que espera input do usuário

### A Limitação Crítica: Stdin é Fechado

```javascript
// Em src/server/tools.js
child.stdin?.end();  // ← Fecha stdin IMEDIATAMENTE!
```

**O que isso significa:**

```javascript
// COMANDO QUE PEDE PASSWORD:
{
  command: 'sudo apt-get install package',
  // Resultado: Fica pendurado esperando password
  // Timeout em 120s (ou timeout específico)
  // Nunca consegue responder porque stdin está fechado
}

// COMANDO INTERATIVO:
{
  command: 'mysql -u root -p'
  // Tenta conectar no MySQL interativamente
  // Falha porque não consegue responder às prompts
}

// SCRIPT QUE LÊ INPUT:
{
  command: 'read -p "Digite seu nome: " name; echo "Olá $name"'
  // Resultado: Fica esperando input que nunca virá
  // Timeout em 120s
  // Stderr: "read: command not found" ou similar
}
```

### Workarounds para Interação

#### 1. Usar Flags non-interactive

```javascript
// ❌ Problema
{
  command: 'sudo apt-get install package'
  // Pede confirmação interativa
}

// ✅ Solução
{
  command: 'sudo apt-get install -y package'
  // Flag -y pula confirmação
}

// ❌ Problema
{
  command: 'npm init'
  // Faz muitas perguntas
}

// ✅ Solução
{
  command: 'npm init -y'
  // -y aceita todos os defaults
}
```

#### 2. Passar dados via stdin antes (não funciona, stdin fechado!)

```javascript
// ❌ NÃO FUNCIONA:
{
  command: 'echo "password" | sudo command'
  // Problema: stdin está fechado, echo não consegue escrever
}
```

#### 3. Usar arquivos em vez de stdin

```javascript
// ✅ Solução: usar arquivo como entrada
{
  command: 'cat > /tmp/inputs.txt << EOF\npassword\nmais dados\nEOF && sh /tmp/process.sh < /tmp/inputs.txt'
}
```

#### 4. Pré-configurar credenciais

```javascript
// ✅ Para senha de sudo
{
  command: 'export SUDO_ASKPASS=/path/to/script && sudo -A command'
}

// ✅ Para MySQL
{
  command: 'mysql -u root -p$(cat ~/.mysql-pass) -e "SELECT * FROM users"'
}

// ✅ Para SSH
{
  command: 'ssh-keygen -t rsa -N "" -f ~/.ssh/id_rsa'
  // -N "" = sem passphrase
}
```

#### 5. Fazer múltiplos comandos sequenciais

```javascript
// Seu caso de uso: Sistema de scripts no Ubuntu com múltiplas saídas

// ✅ BOM:
{
  command: 'bash /home/elias/scripts/analyze-system.sh',
  timeoutSeconds: 120
}

// Script.sh coleta tudo e faz echo no final
// Resultado:
{
  stdout: "=== System Analysis ===\n\nDisk: 85% full\n...\n",
  exitCode: 0
}

// ✅ MELHOR: Dividir em etapas
{
  command: 'bash /home/elias/scripts/step1-collect-data.sh',
  timeoutSeconds: 30
}
// Coleta dados, salva em /tmp/analysis.json

// Depois:
{
  command: 'bash /home/elias/scripts/step2-process.sh /tmp/analysis.json',
  timeoutSeconds: 30
}
// Processa os dados coletados

// Depois:
{
  command: 'cat /tmp/analysis-report.txt',
  timeoutSeconds: 5
}
// Mostra resultado final
```

### Seu Caso: Sistema de Scripts com Múltiplas Saídas

Você tem scripts no Ubuntu que geram várias saídas. Aqui está o fluxo:

```javascript
// EXEMPLO: Analisar sistema
{
  command: 'bash ~/scripts/system-monitor.sh',
  timeoutSeconds: 120
}

// Script faz:
// 1. Coleta temperatura: sensors
// 2. Coleta disco: df -h  
// 3. Coleta processos: ps aux
// 4. Coleta memória: free -h
// 5. Gera relatório

// Tudo é capturado em stdout E RETORNADO DE UMA VEZ
// Resultado:
{
  stdout: `
=== System Report ===

TEMPERATURA:
Core 0: 45°C
Core 1: 47°C

DISCO:
/     85% full
/home 60% full

PROCESSOS TOP:
chrome    1.2GB
firefox   800MB

MEMÓRIA:
Total:  16GB
Usado:  12GB
Livre:  4GB

=== Fim do Relatório ===
  `,
  exitCode: 0,
  durationMs: 5234
}
```

### Limitações Práticas Pro Seu Uso

```javascript
// ✅ FUNCIONA:
1. Scripts que rodam e saem sozinhos (mesmo que demorados)
2. Múltiplas linhas de output (tudo é coletado)
3. Logs de vários processos sequenciais
4. Relatórios compilados de várias fontes

// ⚠️ CUIDADO:
1. Timeout de 120s por padrão (aumentar se script demora mais)
2. Output limitado a 40KB (trunca se muito grande)
3. Cada comando é isolado (sem estado entre calls)

// ❌ NÃO FUNCIONA:
1. Processos que ficam rodando (servers, daemons)
2. Qualquer coisa que pede input durante execução
3. Monitoramento contínuo (tail -f, watch)
4. Programas com interface interativa
```

### Dicas para Otimizar Seu Sistema de Scripts

```bash
# 1. Usar um script wrapper que agrega tudo
cat > ~/scripts/analyze-all.sh << 'EOF'
#!/bin/bash
set -e

echo "=== System Analysis Start ==="
echo "Timestamp: $(date)"
echo ""

echo "--- Disk Usage ---"
df -h | grep "^/"
echo ""

echo "--- Memory ---"
free -h
echo ""

echo "--- Temperature ---"
sensors 2>/dev/null | grep "Core\|Package" || echo "N/A"
echo ""

echo "--- Top Processes ---"
ps aux --sort=-%mem | head -6
echo ""

echo "=== Analysis End ==="
EOF
chmod +x ~/scripts/analyze-all.sh

# 2. IA chama:
# run_terminal_command("bash ~/scripts/analyze-all.sh", { timeoutSeconds: 60 })

# 3. Resultado COMPLETO vem de uma vez
```

### Alternativa: Se Quiser Acompanhamento em Tempo Real

**Não é possível com a arquitetura atual**, mas alternativas:

1. **Salvar em arquivo + polling**
   ```bash
   # Script escreve progresso em arquivo
   bash long-script.sh > /tmp/progress.log 2>&1 &
   PID=$!
   
   # IA pode fazer polling:
   tail -f /tmp/progress.log
   ```

2. **WebSocket/Server-Sent Events** (seria improvement futuro)
   - Servidor Node abriria conexão persistente
   - Streams stdout em tempo real
   - IA receberia updates parciais

3. **Job Queue Tool** (descrito em Sugestões)
   - Queues comandos de longa duração
   - Retorna job ID
   - IA consulta status depois

---

## Como Implementar uma Search Tool

### Arquitetura de uma Search Tool

```javascript
// 1. Adicionar definição em tools.js

export const searchToolDefinition = {
  type: 'function',
  function: {
    name: 'search_files',
    description: 'Search for files and content using grep, find, or ripgrep',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search pattern (regex or plain text)'
        },
        path: {
          type: 'string',
          description: 'Directory to search in (default: current dir)',
          default: '.'
        },
        type: {
          type: 'string',
          enum: ['grep', 'find', 'ripgrep'],
          description: 'Search engine to use'
        },
        caseSensitive: {
          type: 'boolean',
          default: false
        },
        maxResults: {
          type: 'number',
          default: 20
        }
      },
      required: ['query']
    }
  }
};

// 2. Implementar função

export async function searchFiles(options = {}) {
  const query = options.query;
  const path = options.path || '.';
  const type = options.type || 'grep';
  const caseSensitive = options.caseSensitive || false;
  const maxResults = options.maxResults || 20;

  let command;
  
  if (type === 'grep') {
    const flags = caseSensitive ? '-rn' : '-rin';
    command = `grep ${flags} "${query}" "${path}" | head -${maxResults}`;
  } else if (type === 'find') {
    const flags = caseSensitive ? '' : '-iname';
    command = `find "${path}" ${flags} "*${query}*" | head -${maxResults}`;
  } else if (type === 'ripgrep') {
    const flags = caseSensitive ? '' : '-i';
    command = `rg ${flags} "${query}" "${path}" | head -${maxResults}`;
  }

  const result = await runTerminalCommand(command, {
    timeoutSeconds: 30
  });

  if (result.exitCode !== 0) {
    return {
      status: 'error',
      message: result.stderr || 'Search failed',
      query,
      path
    };
  }

  const lines = result.stdout.split('\n').filter(Boolean);
  return {
    status: 'success',
    query,
    path,
    resultsCount: lines.length,
    results: lines.slice(0, maxResults),
    truncated: lines.length > maxResults
  };
}

// 3. Adicionar ao buildEnabledToolDefinitions

function buildEnabledToolDefinitions(toolsConfig) {
  const tools = [];
  
  if (toolsConfig.terminal) tools.push(terminalToolDefinition);
  if (toolsConfig.search) tools.push(searchToolDefinition);  // Novo!
  
  return tools;
}

// 4. Tratar na execução

async function executeToolCall(chatId, toolCall) {
  const name = toolCall?.function?.name;
  
  if (name === 'search_files') {
    let input = JSON.parse(toolCall?.function?.arguments || '{}');
    const result = await searchFiles(input);
    return {
      id: toolCall.id,
      name: 'search_files',
      input,
      result
    };
  }
  
  // ... outros tools ...
}

// 5. Adicionar toggle na config

export const defaultConfig = {
  tools: {
    terminal: true,
    chatMemory: true,
    persistentMemory: true,
    autoCompact: true,
    chatTitle: true,
    search: true  // Novo!
  },
  // ...
};
```

### Uso da Search Tool

```javascript
// IA quer procurar onde um arquivo é importado
{
  command: 'Procure todas as importações de "router.js" no projeto'
}

// IA chama:
{
  name: 'search_files',
  input: {
    query: 'import.*router|from.*router',
    path: '/home/elias/projects/myapp',
    type: 'ripgrep',
    maxResults: 50
  }
}

// Resultado:
{
  status: 'success',
  query: 'import.*router',
  resultsCount: 12,
  results: [
    'src/server.js:5:import { router } from "./router.js"',
    'src/app.js:3:import router from "./routes/router"',
    ...
  ]
}

// IA responde:
"Encontrei 12 importações de router no projeto. As principais são em server.js e app.js."
```

---

## Fazer a IA Mexer no PC na Prática

### Real-World Scenario: Build e Deploy

```javascript
// Você manda:
"Faz build do projeto e mostra o resultado"

// IA pensa:
// "Preciso:
// 1. Entrar no diretório
// 2. Rodar npm run build
// 3. Verificar se compilou
// 4. Mostrar o resultado"

// IA chama tools:

CHAMADA 1: Verificar PWD
{
  command: 'pwd'
}
// Resultado: /home/elias

CHAMADA 2: Listar arquivos
{
  command: 'ls -la ~/projects/myapp | grep "package"'
}
// Resultado: 
// -rw-r--r--  1 elias  package.json

CHAMADA 3: Build
{
  command: 'cd ~/projects/myapp && npm run build',
  timeoutSeconds: 120
}
// Resultado:
// exitCode: 0
// stdout: "
//   > build
//   > vite build
//   ✓ 1234 modules transformed
//   dist/index.js ... 234kb
// "

CHAMADA 4: Verificar resultado
{
  command: 'ls -lh ~/projects/myapp/dist'
}
// Resultado:
// -rw-r--r-- index.js 234K
// -rw-r--r-- index.css 12K

// IA formata resposta:
"Build completado com sucesso! Gerados:
- dist/index.js (234 KB)
- dist/index.css (12 KB)

O projeto está pronto para deploy."
```

### Real-World Scenario: Criar Novo Projeto

```javascript
// Você manda:
"Cria um novo projeto Node com TypeScript em ~/projects/newapp"

// IA executa:

CHAMADA 1:
{
  command: 'mkdir -p ~/projects/newapp && cd ~/projects/newapp && npm init -y'
}

CHAMADA 2:
{
  command: 'cd ~/projects/newapp && npm install --save typescript ts-node @types/node'
}

CHAMADA 3:
{
  command: 'cd ~/projects/newapp && npx tsc --init'
}

CHAMADA 4:
{
  command: 'cat > ~/projects/newapp/src/index.ts << \'EOF\'
const greeting: string = "Hello, TypeScript!";
console.log(greeting);
EOF'
}

CHAMADA 5:
{
  command: 'cat > ~/projects/newapp/package.json | sed \'s/"main".*/"main": "dist/index.js","\'/g'
}

CHAMADA 6:
{
  command: 'cd ~/projects/newapp && npx tsc'
}

CHAMADA 7:
{
  command: 'tree ~/projects/newapp -L 2'
}

// IA responde:
"Novo projeto TypeScript criado em ~/projects/newapp com:
- src/index.ts (código TypeScript)
- tsconfig.json (configuração)
- node_modules/ (dependências)
- dist/ (output compilado)

Próximos passos: npm start para rodar"
```

### Real-World Scenario: Debug de Erro

```javascript
// Você manda:
"Meu app não tá rodando, está dando erro. Debug."

// IA executa:

CHAMADA 1: Verificar se node está instalado
{
  command: 'node --version'
}

CHAMADA 2: Ver se há arquivo principal
{
  command: 'ls -la ~/projects/myapp/package.json'
}

CHAMADA 3: Ver o erro
{
  command: 'cd ~/projects/myapp && npm start',
  timeoutSeconds: 10
}
// Resultado:
// exitCode: 1
// stderr: "Error: Cannot find module 'express'"

CHAMADA 4: Verificar dependências
{
  command: 'cd ~/projects/myapp && npm ls express'
}

CHAMADA 5: Instalar o que falta
{
  command: 'cd ~/projects/myapp && npm install'
}

CHAMADA 6: Tentar rodar novamente
{
  command: 'cd ~/projects/myapp && npm start'
}

// IA responde:
"Encontrei o problema! O módulo 'express' não estava instalado.
Executei 'npm install' e agora a app roda normalmente.
Você pode acessar em http://localhost:3000"
```

### Limitações Práticas

```javascript
// ❌ COISAS QUE NÃO FUNCIONAM (por enquanto):

// 1. Interface gráfica
{
  command: 'firefox https://example.com'
  // Não há display, não funciona
}

// 2. Input interativo
{
  command: 'read -p "Digite password: " pass'
  // Stdin é fechado, fica pendurado
}

// 3. Programas que ficam rodando
{
  command: 'npm start'  // Inicia servidor Node
  // Executa até timeout (120s padrão)
  // Process é morto
  // Resultado truncado
}

// 4. Comandos muito longos
{
  command: 'find / -name "*.txt"'
  // Pode timeout e ter muito output
  // Melhor limitar: 'find ~/projects -name "*.txt"'
}

// ✅ WORKAROUNDS:

// Para rodar servidor em background:
{
  command: 'nohup npm start > /tmp/server.log 2>&1 &',
  // Roda em background, output salvo em arquivo
}

// Depois verificar:
{
  command: 'tail -f /tmp/server.log',
  timeoutSeconds: 10
}
```

---

## Conectar a um Modelo de Conversação

### Fluxo Geral de Integração

```javascript
// 1. Você define um modelo em:
// src/server/models.js

// EXEMPLO: Adicionar novo provider (Hugging Face)

export const providerCatalog = [
  {
    id: 'huggingface',
    label: 'Hugging Face',
    adapter: 'openai-compatible',  // Usa formato OpenAI
    baseUrlPlaceholder: 'https://api-inference.huggingface.co/v1',
    defaultModel: 'meta-llama/Llama-2-7b',
    apiKeyLabel: 'HF Token'
  },
  // ... outros providers ...
];

export const modelCatalog = [
  {
    provider: 'huggingface',
    id: 'meta-llama/Llama-2-7b',
    label: 'Llama 2 (7B)',
    contextWindow: 4096,
    costPer1kInputTokens: 0.002,
    costPer1kOutputTokens: 0.002,
    supportsImages: false,
    supportsFunctionCalling: true
  },
  // ...
];

// 2. User configura em setup:
// - Provider: Hugging Face
// - API Key: hf_xxxxx
// - Base URL: https://api-inference.huggingface.co/v1

// 3. Sistema monta request OpenAI-compatible

const response = await fetch(
  'https://api-inference.huggingface.co/v1/chat/completions',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer hf_xxxxx',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'meta-llama/Llama-2-7b',
      messages: [{ role: 'user', content: '...' }],
      tools: [...],
      temperature: 0.2,
      max_tokens: 2048
    })
  }
);

// 4. Provider responde em formato OpenAI
const data = await response.json();
// {
//   choices: [{
//     message: {
//       content: '...',
//       tool_calls: [...]  // Se usar tools
//     }
//   }]
// }

// 5. Sistema processa normalmente
```

### Exemplo Real: Adicionar Mistral API

```javascript
// 1. Adicionar em src/server/models.js

export const providerCatalog = [
  // ... outros ...
  {
    id: 'mistral',
    label: 'Mistral AI',
    adapter: 'openai-compatible',
    baseUrlPlaceholder: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small',
    apiKeyLabel: 'Mistral API Key',
    helpText: 'Get your key from https://console.mistral.ai'
  }
];

export const modelCatalog = [
  {
    provider: 'mistral',
    id: 'mistral-small',
    label: 'Mistral Small',
    contextWindow: 32000,
    costPer1kInputTokens: 0.00014,
    costPer1kOutputTokens: 0.00042,
    supportsImages: false,
    supportsFunctionCalling: true,
    maxInputTokens: 32000,
    maxOutputTokens: 8000
  },
  {
    provider: 'mistral',
    id: 'mistral-large',
    label: 'Mistral Large',
    contextWindow: 32000,
    costPer1kInputTokens: 0.0008,
    costPer1kOutputTokens: 0.0024,
    supportsImages: false,
    supportsFunctionCalling: true,
    maxInputTokens: 32000,
    maxOutputTokens: 8000
  }
];

// 2. User vai em setup, seleciona:
// Provider: Mistral AI
// Model: Mistral Small
// API Key: sk-xxxxxxx
// Base URL: https://api.mistral.ai/v1

// 3. Sistema salva em config.json
{
  provider: 'mistral',
  model: 'mistral-small',
  providerSettings: {
    mistral: {
      baseUrl: 'https://api.mistral.ai/v1',
      apiKeys: ['sk-xxxxxxx']
    }
  }
}

// 4. Próxima chamada funciona automaticamente
callProviderChat({
  provider: 'mistral',
  model: 'mistral-small',
  messages: [...],
  tools: [...]
})

// 5. system/provider-client.js faz:
const response = await fetch(
  'https://api.mistral.ai/v1/chat/completions',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer sk-xxxxxxx',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'mistral-small',
      messages: [...],
      tools: [...],
      temperature: 0.2,
      max_tokens: 2048
    })
  }
);
```

### Para Adicionar Provider NÃO OpenAI-compatible

Se o novo provider usa API diferente (como Anthropic), precisa de adapter especial:

```javascript
// Exemplo: Anthropic (usa Messages API, não chat/completions)

export const providerCatalog = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    adapter: 'anthropic',  // ← Adapter customizado!
    baseUrlPlaceholder: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-opus-4',
    apiKeyLabel: 'Anthropic API Key'
  }
];

// Em provider-client.js

if (provider.adapter === 'anthropic') {
  return callWithKeyRotation(provider, runtime, (apiKey) =>
    callAnthropicChat({  // ← Função específica do Anthropic
      provider,
      runtime,
      apiKey,
      model: selectedModel,
      messages,
      tools,
      temperature,
      maxTokens
    })
  );
}

export async function callAnthropicChat({
  runtime,
  apiKey,
  model,
  messages,
  tools
}) {
  // 1. Converter messages para formato Anthropic
  const systemPrompt = messages.find(m => m.role === 'system').content;
  const userMessages = messages.filter(m => m.role !== 'system');
  
  // 2. Converter tools para Anthropic format
  const anthropicTools = tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: {
      type: 'object',
      properties: tool.function.parameters.properties
    }
  }));

  // 3. Fazer request Anthropic
  const response = await fetch(
    `${runtime.baseUrl}/messages`,
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        tools: anthropicTools,
        messages: userMessages
      })
    }
  );

  // 4. Converter resposta para formato OpenAI
  const data = await response.json();
  
  const message = {
    content: '',
    tool_calls: []
  };
  
  for (const block of data.content) {
    if (block.type === 'text') {
      message.content = block.text;
    } else if (block.type === 'tool_use') {
      message.tool_calls.push({
        id: block.id,
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input)
        }
      });
    }
  }
  
  return message;
}
```

---

## Sugestões de Melhorias

### 1. Search Tool (PRIORITY: High)

**O que:** Permitir que IA procure por padrões em arquivos.

**Por que:** Atualmente IA só encontra coisas se você mandar os caminhos exatos ou usar run_terminal_command com grep.

**Implementação:**
```javascript
// Adicionar em tools.js
export const searchToolDefinition = { /* ... */ };
export async function searchFiles(query, options) { /* ... */ };

// Registrar em assistant.js buildEnabledToolDefinitions()
if (config.tools.search) tools.push(searchToolDefinition);

// Executar em executeToolCall()
if (name === 'search_files') { /* ... */ };
```

**Uso:**
```
User: "Onde arquivo CSS é importado?"
AI: search_files({ query: 'import.*css|from.*css', type: 'ripgrep' })
Result: "Encontrado em src/main.js:5, App.jsx:12, ..."
```

---

### 2. Web Scraping Tool (PRIORITY: Medium)

**O que:** IA consegue pegar conteúdo de URLs.

**Por que:** Útil para coletar informações da internet.

**Implementação:**
```javascript
export async function fetchUrl(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'My Computer'
      }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const html = await response.text();
    const text = parseHtml(html);  // extrair texto legível
    
    return {
      status: 'success',
      url,
      contentType: response.headers.get('content-type'),
      text: text.slice(0, 50000)  // truncar se muito grande
    };
  } catch (error) {
    return {
      status: 'error',
      url,
      error: error.message
    };
  }
}
```

---

### 3. File Editor Tool (PRIORITY: High)

**O que:** IA consegue editar arquivos direto.

**Por que:** Melhor que usar run_terminal_command com sed/echo.

**Implementação:**
```javascript
export async function editFile(path, action = 'read', content = '') {
  if (action === 'read') {
    const data = await fs.readFile(path, 'utf8');
    return { status: 'success', content: data };
  }
  
  if (action === 'write') {
    await fs.writeFile(path, content, 'utf8');
    return { status: 'success', path };
  }
  
  if (action === 'append') {
    const existing = await fs.readFile(path, 'utf8');
    await fs.writeFile(path, existing + '\n' + content, 'utf8');
    return { status: 'success', path };
  }
}
```

---

### 4. Code Execution Tool (PRIORITY: Medium)

**O que:** Executar código Python/Node diretamente.

**Por que:** Mais rápido que rodar via terminal, pode retornar valores estruturados.

**Implementação:**
```javascript
export async function executeCode(language, code) {
  if (language === 'python') {
    const result = await runTerminalCommand(
      `python -c "${code.replace(/"/g, '\\"')}"`,
      { timeoutSeconds: 10 }
    );
    return JSON.parse(result.stdout || '{}');
  }
  
  if (language === 'javascript') {
    // Usar vm module
    const vm = require('vm');
    const context = vm.createContext();
    return vm.runInContext(code, context, { timeout: 10000 });
  }
}
```

---

### 5. Database Tool (PRIORITY: Medium)

**O que:** IA consegue fazer queries em banco de dados local.

**Por que:** Útil para trabalhar com dados estruturados.

**Implementação:**
```javascript
export async function queryDatabase(sql, params = []) {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    const result = await pool.query(sql, params);
    return {
      status: 'success',
      rows: result.rows,
      rowCount: result.rowCount
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  } finally {
    await pool.end();
  }
}
```

---

### 6. Vision Tool - OCR (PRIORITY: Low)

**O que:** Extrair texto de imagens.

**Por que:** Documentos escaneados, screenshots com texto.

**Implementação:**
```javascript
export async function ocrImage(imagePath) {
  // Usar tesseract ou similar
  const { createWorker } = require('tesseract.js');
  const worker = await createWorker();
  
  const result = await worker.recognize(imagePath);
  await worker.terminate();
  
  return {
    status: 'success',
    text: result.data.text,
    confidence: result.data.confidence
  };
}
```

---

### 7. Long-Running Tasks (PRIORITY: High)

**O que:** Permitir jobs assíncronos (build, deploy, etc).

**Por que:** Muitas tarefas demoram mais de 5 minutos.

**Implementação:**
```javascript
export const jobQueueToolDefinition = {
  name: 'queue_job',
  parameters: {
    command: string,
    jobId: string,
    timeoutSeconds: number  // até 1 hora
  }
};

// Sistema mantém fila de jobs em background
// IA pode consultar status depois:
{
  name: 'check_job_status',
  jobId: 'build-abc123'
}
// Resultado: { status: 'running', progress: '45%', ... }
```

---

### 8. Backup & Restore (PRIORITY: Medium)

**O que:** Fazer backup automático de chats e configurações.

**Por que:** Segurança, portabilidade.

**Já existe:** `/api/export` e `/api/import`

**Melhorias:**
- Schedule backups automáticos
- Encriptar dados
- Versionamento
- Diff entre versões

---

### 9. Streaming Responses (PRIORITY: Medium)

**O que:** Mostrar resposta em tempo real (token a token).

**Por que:** UX melhor, feedback imediato.

**Implementação:**
```javascript
// Em callProviderChat
const response = await fetch(url, {
  body: JSON.stringify({
    ...body,
    stream: true  // pedir streaming
  })
});

// Ler stream
for await (const chunk of response.body) {
  const text = new TextDecoder().decode(chunk);
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const json = JSON.parse(line.slice(6));
      const delta = json.choices[0].delta;
      
      // Enviar para UI em tempo real
      emitToUI('token', delta.content);
    }
  }
}
```

---

### 10. Multi-Chat Sessions (PRIORITY: Low)

**O que:** Manter múltiplos chats paralelos, com contexto compartilhado.

**Por que:** Ativa diferentes "personas" para tarefas diferentes.

**Implementação:**
```javascript
// Cada chat pode herdar de "grupo"
{
  id: 'chat-1',
  groupId: 'project-xyz',
  sharedMemory: 'persistent-memory-project-xyz.md'
}

// Todos os chats do grupo compartilham memória
```

---

### 11. Role-Based Tools (PRIORITY: Low)

**O que:** IA pode ter diferentes "roles" com permissões diferentes.

**Por que:** Segurança - você não quer que qualquer prompt faça delete em /etc

**Exemplo:**
```javascript
config.toolRoles = {
  'developer': [
    'run_terminal_command',
    'memory_chat',
    'compact_context'
  ],
  'explorer': [
    'memory_chat',
    'search_files'
  ]
}

// IA em modo "explorer" não pode fazer run_terminal_command
```

---

### 12. Cost Tracking (PRIORITY: Medium)

**O que:** Mostrar quanto you gastou com APIs.

**Por que:** Controlar orçamento.

**Implementação:**
```javascript
export async function trackCost(provider, model, inputTokens, outputTokens) {
  const metadata = getModelMetadata(provider, model);
  
  const inputCost = inputTokens * metadata.costPer1kInputTokens / 1000;
  const outputCost = outputTokens * metadata.costPer1kOutputTokens / 1000;
  
  await appendEvent({
    type: 'cost.tracked',
    provider,
    model,
    inputTokens,
    outputTokens,
    cost: inputCost + outputCost,
    timestamp: new Date()
  });
  
  // Salvar em config para agregação
}
```

---

### Resumo de Prioridades

| Feature | Priority | Esforço | Impacto |
|---------|----------|---------|---------|
| Search Tool | 🔴 High | Baixo | Alto |
| File Editor | 🔴 High | Médio | Alto |
| Long-Running Tasks | 🔴 High | Alto | Alto |
| Web Scraping | 🟡 Medium | Baixo | Médio |
| Code Execution | 🟡 Medium | Médio | Médio |
| Database Tool | 🟡 Medium | Médio | Médio |
| Streaming | 🟡 Medium | Alto | Médio |
| Cost Tracking | 🟡 Medium | Baixo | Médio |
| Vision/OCR | 🟢 Low | Alto | Baixo |
| Multi-Chat | 🟢 Low | Alto | Baixo |
| Role-Based Tools | 🟢 Low | Médio | Médio |
| Backup Auto | 🟢 Low | Médio | Baixo |

---

## Atualização do MVP - 24/05/2026

Esta seção registra o estado atual do app depois das mudanças mais recentes, para evitar divergência entre documentação e código.

### Segurança e aprovação de tools

- Tools agora podem exigir aprovação pela UI. O padrão é `Sempre permitir qualquer tool = desligado`.
- Quando a IA pede uma tool, o backend salva uma mensagem de assistente com `pendingToolApproval` e a UI mostra botões `Permitir` e `Negar`.
- Se aprovado, o backend executa as tools pendentes e faz uma chamada final ao provider sem novas tools, para transformar o resultado em resposta final.
- Se negado, a mensagem fica marcada como `tool_denied`.
- O backend também checa se a tool continua habilitada antes de executar, mesmo que algum provider tenha retornado uma chamada inesperada.

### Eventos ao vivo de tools

- `run_terminal_command` gera evento `tool.run_terminal_command.requested` antes da execução e `tool.run_terminal_command.completed` ao terminar.
- `web_search` gera eventos `tool.web_search.requested`, `tool.web_search.completed` ou `tool.web_search.blocked`.
- Enquanto uma request está em andamento, o painel faz polling do chat ativo e mostra eventos recentes dentro da área de resposta pendente.
- O MVP ainda não faz streaming real de stdout caractere por caractere; ele mostra status por evento e retorna stdout/stderr quando a tool termina ou dá timeout.

### Método do terminal

- `standard`: executa comandos com o ambiente normal do usuário. É o método padrão.
- `isolated`: usa `~/.my-computer/isolated-terminal` como `HOME` e diretório inicial. Isso é isolamento leve, não VM/container. Caminhos absolutos ainda podem tocar o sistema do usuário.
- `timeoutSeconds` aceita 1 a 900 segundos. Para "me mostre o output em 30 segundos", a IA pode chamar a tool com `timeoutSeconds: 30`; se o comando não terminar, o app mata o processo e retorna o output parcial coletado.

### Search tool

- A tool `web_search` existe no catálogo de tools.
- Neste MVP, a busca funcional é terminal-backed: um script Python consulta a página HTML do DuckDuckGo e retorna título, URL e snippet.
- Ela só executa quando `Pesquisa via terminal` está ligada nas configurações gerais.
- Providers com search nativa, como OpenAI/Gemini/Groq, ainda não têm adapter nativo dedicado aqui; a tool uniforme foi priorizada para funcionar também com Ollama e endpoints OpenAI-compatible.

### Compactação automática e contexto editável

- Config global: `context.autoCompactEnabled`, `context.autoCompactChars` e `context.autoCompactMinMessages`.
- Depois de uma resposta, se o contexto estimado passar do limite e houver mensagens suficientes desde a última compactação, o app chama `compactChat(..., { automatic: true })`.
- A UI registra um card `Compactação automática`, com preview, caminho do arquivo e botão para editar.
- O botão de caneta ao lado de `Compactar contexto` abre `context.md` em modal para edição manual.

### Anexos e vídeos

- Imagens só são enviadas como multimodal quando o modelo está marcado como compatível.
- Texto, Markdown, JSON, CSV, HTML/XML/YAML e código têm texto extraído/truncado e entram em seção de documentos.
- Vídeos têm preview local no painel e ficam salvos no chat como referência/caminho.
- Envio nativo de vídeo ainda não está implementado. Mesmo com Gemini, o adapter atual não usa Files API; isso ficou como item de roadmap.

### Rede local

- O servidor escuta em `127.0.0.1` por padrão.
- Se `Abrir painel para a rede` estiver ligado com senha, no próximo restart o server usa `0.0.0.0` e Basic Auth com senha única.
- Ainda não há HTTPS, usuários múltiplos, permissões por usuário ou exposição segura fora da rede local.

---

## Conclusão

**My Computer é um sistema de IA local que:**
1. ✅ Monta contexto dinâmico em cada mensagem
2. ✅ Permite que IA execute commands no seu PC
3. ✅ Preserva memória entre conversas (persistente + chat-specific)
4. ✅ Suporta múltiplos providers e modelos (com rotação de chave)
5. ✅ Trata anexos (imagens como multimodal, documentos como metadados)
6. ✅ Usa tools para estender capacidades
7. ✅ Mantém runtime, chats, anexos e memórias em uma pasta local central

Quando você usa Groq/OpenAI/Gemini/Anthropic/etc, prompts e anexos enviados ao modelo saem para o provider escolhido. Com Ollama, a inferência fica local, salvo quando uma tool como `web_search` consulta a web.

**Não é magia, é:**
- Prompt engineering (montar contexto bem)
- Tool calling (IA decide quando chamar tool)
- Janela de contexto (histórico + memórias)
- Iteração (loops tool até ter resposta final)

Agora você entende a infraestrutura! 🚀
