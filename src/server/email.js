const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'My Computer <onboarding@resend.dev>';
const SEND_TIMEOUT_MS = 15000;

export async function sendEmail({ apiKey, to, subject, text }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: DEFAULT_FROM,
        to: [to],
        subject,
        text,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Resend não respondeu em ${SEND_TIMEOUT_MS / 1000}s.`);
    }
    throw new Error(`Falha ao conectar com o Resend: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `Resend retornou status ${response.status}.`);
  }
  return { id: data?.id || null };
}
