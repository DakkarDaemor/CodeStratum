import * as vscode from 'vscode';
import { CartoCache, AtomicTask, PlannerOutput } from '../types';

export async function planTask(
  userTask: string,
  cache: CartoCache
): Promise<PlannerOutput> {
  const [model] = await vscode.lm.selectChatModels({
    vendor: 'copilot',
    family: 'claude-sonnet-4-6', // reasoning model
  });

  if (!model) {
    throw new Error('No reasoning model available. Check your Copilot plan.');
  }

  const contextSummary = buildContextSummary(cache);

  const prompt = [
    vscode.LanguageModelChatMessage.User(`
You are a senior software architect. Given a codebase summary and a task, decompose the task into a list of atomic, self-contained coding steps.

Rules:
- Each step must be executable independently by a junior developer
- Each step must reference a specific file when possible
- Maximum 8 steps
- Output ONLY a JSON array, no markdown, no preamble

Format:
[
  { "id": 1, "description": "...", "targetFile": "src/..." },
  ...
]

## Codebase Summary
${contextSummary}

## Task
${userTask}
`),
  ];

  const cts = new vscode.CancellationTokenSource();
  let raw = '';
  try {
    const response = await model.sendRequest(prompt, {}, cts.token);

    for await (const chunk of response.text) {
      raw += chunk;
    }
  } finally {
    cts.dispose();
  }

  const tasks = parseTaskList(raw, userTask);

  return { originalTask: userTask, tasks };
}

function buildContextSummary(cache: CartoCache): string {
  const lines: string[] = [
    `Project: ${cache.project.name}`,
    `Stack: ${cache.project.stack.join(', ')}`,
    '',
    '## Modules',
  ];

  for (const [filePath, mod] of Object.entries(cache.modules)) {
    if (mod.type === 'test' || mod.type === 'config') { continue; }
    const summary = mod.semanticSummary || `${mod.type}`;
    const exports = mod.exports.slice(0, 3).join(', ');
    lines.push(`- \`${filePath}\` [${mod.type}] ${summary}${exports ? ` | exports: ${exports}` : ''}`);
  }

  lines.push('', '## Key Relations');
  for (const rel of cache.relations.slice(0, 30)) {
    lines.push(`- ${rel.from} → ${rel.to}`);
  }

  return lines.join('\n');
}

function parseTaskList(raw: string, originalTask: string): AtomicTask[] {
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as Array<{ id: number; description: string; targetFile?: string }>;
    return parsed.map(t => ({
      ...t,
      approved: false,
      status: 'pending' as const,
    }));
  } catch {
    // Fallback: single task
    return [{
      id: 1,
      description: originalTask,
      approved: false,
      status: 'pending',
    }];
  }
}
