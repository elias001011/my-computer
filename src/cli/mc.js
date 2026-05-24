#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { runtimeHome } from '../server/paths.js';
import { startServer } from '../server/server.js';

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('-') ? args[0] : 'start';

try {
  if (command === 'start') {
    const port = getFlagValue('--port') || process.env.PORT || 8787;
    const shouldOpen = args.includes('--open') || process.env.MC_OPEN === '1';
    const { server, url } = await startServer({ port: Number(port) });
    console.log(`My Computer rodando em ${url}`);
    console.log(`Runtime: ${runtimeHome}`);
    console.log('Pressione Ctrl+C para parar.');
    if (shouldOpen) openBrowser(url);
    process.on('SIGINT', () => {
      server.close(() => process.exit(0));
    });
  } else if (command === 'doctor') {
    console.log(`Node: ${process.version}`);
    console.log(`Runtime: ${runtimeHome}`);
    console.log('Status: ok');
  } else if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
  } else {
    console.error(`Comando desconhecido: ${command}`);
    printHelp();
    process.exit(1);
  }
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}

function getFlagValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] || null;
}

function openBrowser(url) {
  const platform = process.platform;
  const commandByPlatform = {
    darwin: { command: 'open', args: [url] },
    win32: { command: 'cmd', args: ['/c', 'start', '', url] },
    linux: { command: 'xdg-open', args: [url] },
  };
  const opener = commandByPlatform[platform] || commandByPlatform.linux;
  const child = spawn(opener.command, opener.args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function printHelp() {
  console.log(`My Computer

Comandos:
  my-computer start [--open] [--port 8787]   inicia o painel local
  my-computer doctor                         verifica o ambiente
  my-computer help                           mostra esta ajuda
`);
}
