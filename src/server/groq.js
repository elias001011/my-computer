const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function callGroqChat({
  apiKey,
  model,
  messages,
  tools,
  temperature = 0.2,
  maxTokens = 2048,
}) {
  if (!apiKey) {
    const error = new Error('Configure a GROQ API key no setup inicial.');
    error.statusCode = 400;
    throw error;
  }

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
    body.parallel_tool_calls = false;
  }

  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || `Groq request failed with HTTP ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }

  const message = data?.choices?.[0]?.message;
  if (!message) {
    const error = new Error('Groq returned an empty completion.');
    error.statusCode = 502;
    throw error;
  }

  return message;
}
