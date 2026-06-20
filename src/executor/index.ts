import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AtomicTask, CartoCache } from '../types';

export async function executeTask(
  task: AtomicTask,
  cache: CartoCache,
  rootPath: string,
  onChunk: (text: string) => void
): Promise<string> {
  const [model] = await vscode.lm.selectChatModels({
    vendor: 'copilot',
    family: 'gpt-5.3-codex', // code-specialized model
  });

  if (!model) {
    throw new Error('No execution model available.');
  }

  const fileContext = task.targetFile
    ? loadFileContext(rootPath, task.targetFile)
    : '';

  const prompt = [
    vscode.LanguageModelChatMessage.User(`
You are a precise coding assistant. Execute this task exactly as described.
Output ONLY the complete modified file content. No diffs, no explanations, no markdown fences.

## Task
${task.description}

${fileContext ? `## Current file: ${task.targetFile}\n\`\`\`\n${fileContext}\n\`\`\`` : ''}
`),
  ];

  const cts = new vscode.CancellationTokenSource();
  try {
    const response = await model.sendRequest(prompt, {}, cts.token);

    let result = '';
    for await (const chunk of response.text) {
      result += chunk;
      onChunk(chunk);
    }

    return result;
  } finally {
    cts.dispose();
  }
}

export async function executeTasksInSeries(
  tasks: AtomicTask[],
  cache: CartoCache,
  rootPath: string,
  onTaskStart: (task: AtomicTask) => void,
  onTaskChunk: (taskId: number, chunk: string) => void,
  onTaskDone: (task: AtomicTask, result: string) => void,
  onTaskError: (task: AtomicTask, error: string) => void
): Promise<void> {
  for (const task of tasks) {
    if (!task.approved) { continue; }

    task.status = 'running';
    onTaskStart(task);

    try {
      const result = await executeTask(
        task,
        cache,
        rootPath,
        (chunk) => onTaskChunk(task.id, chunk)
      );
      task.status = 'done';
      task.result = result;
      onTaskDone(task, result);
    } catch (err) {
      task.status = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      onTaskError(task, msg);
    }
  }
}

function loadFileContext(rootPath: string, filePath: string): string {
  try {
    const fullPath = path.join(rootPath, filePath);
    if (!fs.existsSync(fullPath)) { return ''; }
    const content = fs.readFileSync(fullPath, 'utf-8');
    // Cap at ~200 lines to keep tokens low
    const lines = content.split('\n');
    return lines.slice(0, 200).join('\n');
  } catch {
    return '';
  }
}
