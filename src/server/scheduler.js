import { sendUserMessage } from './assistant.js';
import { sendEmail } from './email.js';
import {
  appendEvent,
  claimScheduledTaskRun,
  computeNextRunAt,
  createChat,
  listScheduledTasks,
  loadConfig,
  readChat,
  releaseScheduledTaskRun,
  updateScheduledTask,
} from './store.js';

const TICK_INTERVAL_MS = 60_000;
const runningTaskIds = new Set();
let started = false;

export function startScheduler() {
  if (started) return;
  started = true;
  runTick();
  setInterval(runTick, TICK_INTERVAL_MS);
}

function runTick() {
  tick().catch((error) => console.error('[scheduler] tick falhou:', error.message || error));
}

async function tick() {
  const tasks = await listScheduledTasks();
  const now = Date.now();
  for (const task of tasks) {
    if (!task.enabled) continue;
    if (!task.nextRunAt || new Date(task.nextRunAt).getTime() > now) continue;
    if (runningTaskIds.has(task.id)) continue;
    runningTaskIds.add(task.id);
    executeTask(task.id)
      .catch((error) => console.error(`[scheduler] tarefa ${task.id} falhou de forma inesperada:`, error.message || error))
      .finally(() => runningTaskIds.delete(task.id));
  }
}

export async function runScheduledTaskNow(taskId) {
  if (runningTaskIds.has(taskId)) return { started: false, reason: 'already_running' };
  runningTaskIds.add(taskId);
  try {
    await executeTask(taskId);
    return { started: true };
  } finally {
    runningTaskIds.delete(taskId);
  }
}

async function executeTask(taskId) {
  const claimed = await claimScheduledTaskRun(taskId);
  if (!claimed) return;

  let status = 'ok';
  let errorMessage = null;
  try {
    let chatId = claimed.reuseChat ? claimed.chatId : null;
    if (chatId) {
      // The reused chat may have been deleted by the user since the last run -- check
      // before reusing instead of letting a stale id crash deep inside sendUserMessage.
      try {
        await readChat(chatId);
      } catch (error) {
        if (error.statusCode !== 404) throw error;
        chatId = null;
      }
    }
    if (!chatId) {
      const chat = await createChat(claimed.name, { provider: claimed.provider, model: claimed.model });
      chatId = chat.id;
      if (claimed.reuseChat) await updateScheduledTask(claimed.id, { chatId });
    }
    const result = await sendUserMessage(chatId, claimed.prompt, {
      scheduledTaskContext: {
        allowedTools: claimed.allowedTools || [],
        skipMemory: claimed.skipMemoryInPrompt !== false,
        systemPrompt: claimed.systemPrompt || '',
      },
    });
    // sendUserMessage resolves normally even when the assistant turn itself failed or
    // stalled (denied tool, max tool rounds, provider error caught internally) -- only a
    // thrown exception (network/IO/validation) would otherwise be treated as a failure, so
    // most realistic task failures would silently count as "ok" without this check.
    if (result.assistantStatus === 'failed' || result.assistantStatus === 'incomplete') {
      throw new Error(result.assistantMessage?.error || `A IA não concluiu a tarefa (status: ${result.assistantStatus}).`);
    }
    await appendEvent({ type: 'scheduledTask.run.completed', chatId, details: { id: claimed.id, name: claimed.name } });
  } catch (error) {
    status = 'error';
    errorMessage = String(error?.message || error);
    await appendEvent({ type: 'scheduledTask.run.failed', details: { id: claimed.id, name: claimed.name, error: errorMessage } });
    await notifyScheduledTaskFailure(claimed, errorMessage);
  } finally {
    await releaseScheduledTaskRun(claimed.id, {
      status,
      error: errorMessage,
      nextRunAt: computeNextRunAt(claimed.schedule),
    });
  }
}

// Best-effort notification: a failure here must never mask or interrupt the
// real task-failure handling above, so every error is swallowed and only logged.
async function notifyScheduledTaskFailure(task, errorMessage) {
  try {
    const config = await loadConfig();
    const email = config.email || {};
    if (!email.enabled || !email.notifyOnScheduledTaskFailure) return;
    if (!email.resendApiKey || !email.destinationEmail) return;
    await sendEmail({
      apiKey: email.resendApiKey,
      to: email.destinationEmail,
      subject: `Tarefa agendada falhou: ${task.name}`,
      text: `A tarefa agendada "${task.name}" falhou.\n\nErro: ${errorMessage}`,
    });
  } catch (notifyError) {
    console.error('[scheduler] falha ao enviar notificação de email:', notifyError.message || notifyError);
  }
}
