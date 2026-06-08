export function assertLocalOllamaBaseUrl(baseUrl, options = {}) {
  if (options.offlineMode !== true) return;
  if (isLocalOllamaBaseUrl(baseUrl)) return;
  const error = new Error('Modo offline ativo: o endpoint do Ollama precisa ser local (localhost, 127.0.0.1 ou ::1).');
  error.statusCode = 403;
  throw error;
}

export function isLocalOllamaBaseUrl(baseUrl) {
  const clean = String(baseUrl || '').trim();
  if (!clean) return false;
  if (/^(unix|http\+unix):/i.test(clean)) return true;
  try {
    const url = new URL(clean);
    const hostname = String(url.hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0:0:0:0:0:0:0:1';
  } catch {
    return false;
  }
}
