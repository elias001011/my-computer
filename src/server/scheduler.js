import { sendUserMessage } from './assistant.js';
import {
  appendEvent,
  claimScheduledTaskRun,
  computeNextRunAt,
  createChat,
  listScheduledTasks,
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
    if (!chatId) {
      const chat = await createChat(claimed.name, { provider: claimed.provider, model: claimed.model });
      chatId = chat.id;
      if (claimed.reuseChat) await updateScheduledTask(claimed.id, { chatId });
    }
    await sendUserMessage(chatId, claimed.prompt, {
      scheduledTaskContext: {
        allowedTools: claimed.allowedTools || [],
        skipMemory: claimed.skipMemoryInPrompt !== false,
      },
    });
    await appendEvent({ type: 'scheduledTask.run.completed', chatId, details: { id: claimed.id, name: claimed.name } });
  } catch (error) {
    status = 'error';
    errorMessage = String(error?.message || error);
    await appendEvent({ type: 'scheduledTask.run.failed', details: { id: claimed.id, name: claimed.name, error: errorMessage } });
  } finally {
    await releaseScheduledTaskRun(claimed.id, {
      status,
      error: errorMessage,
      nextRunAt: computeNextRunAt(claimed.schedule),
    });
  }
}
