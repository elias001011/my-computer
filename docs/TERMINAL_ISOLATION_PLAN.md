# Plano de isolamento pesado do terminal

Este documento descreve o próximo desenho de segurança para tools locais. Nada aqui está implementado ainda; o modo atual continua sendo padrão ou isolamento leve por `HOME`/diretório.

## Objetivo

Criar um modo Linux-first em que comandos da IA rodem em sandbox real, com limites explícitos de filesystem, rede, processos, ambiente e tempo. O modo deve falhar de forma clara quando a máquina não tiver backend de sandbox instalado.

## Backends candidatos

- `bubblewrap` como primeira opção para Linux desktop, por permitir montar uma raiz mínima, bind mounts controlados e bloquear rede.
- `firejail` como alternativa quando já estiver instalado e configurado no sistema.
- `nsjail` como opção avançada para perfis mais rígidos.
- Fallback sem backend: manter isolamento leve atual, mas rotular como “não é sandbox pesado” e pedir confirmação antes de comandos locais.

## Perfil inicial

- Filesystem: leitura apenas do workspace/runtime necessário; escrita só em uma pasta temporária do My Computer, salvo quando o usuário liberar um caminho.
- Rede: desligada por padrão para terminal pesado; liberar por comando ou perfil futuro.
- Ambiente: `HOME`, `PATH`, `TMPDIR` e variáveis permitidas em allowlist. Nunca passar API keys automaticamente.
- Processos: limite de tempo, limite de subprocessos, kill do grupo inteiro no timeout.
- CWD: diretório de trabalho controlado pelo app.
- Logs: registrar backend usado, política aplicada, comando, saída truncada, exit code e motivo de bloqueio.

## Critérios antes de implementar

- Testes automatizados para detecção de backend, bloqueio de escrita fora do sandbox, bloqueio de rede e timeout.
- UI explícita com três estados: “Sem restrições”, “Isolamento leve” e “Sandbox pesado”.
- Mensagem de erro acionável quando o sandbox pesado não estiver disponível.
