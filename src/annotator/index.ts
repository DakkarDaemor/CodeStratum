import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ModuleEntry } from '../types';

const BATCH_SIZE = 5; // annotate N files per LLM call to reduce overhead

export async function annotateModules(
  rootPath: string,
  modules: Record<string, ModuleEntry>,
  onProgress: (current: number, total: number, file: string) => void
): Promise<Record<string, ModuleEntry>> {
  const entries = Object.entries(modules).filter(
    ([, mod]) => !mod.semanticSummary && mod.type !== 'test' && mod.type !== 'config'
  );

  const family = vscode.workspace.getConfiguration('codestratum').get<string>('annotatorModel', 'gpt-5-mini');
  const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family });

  if (!model) {
    vscode.window.showWarningMessage('CodeStratum: No Copilot model available for annotation. Summaries skipped.');
    return modules;
  }

  let processed = 0;

  // Process in batches
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    for (const [filePath, mod] of batch) {
      onProgress(processed + 1, entries.length, filePath);
      try {
        mod.semanticSummary = await annotateFile(model, rootPath, filePath, mod);
      } catch {
        mod.semanticSummary = `${mod.type} — ${mod.exports.slice(0, 3).join(', ')}`;
      }
      processed++;
    }
  }

  return modules;
}

async function annotateFile(
  model: vscode.LanguageModelChat,
  rootPath: string,
  filePath: string,
  mod: ModuleEntry
): Promise<string> {
  const fullPath = path.join(rootPath, filePath);
  const content = fs.readFileSync(fullPath, 'utf-8');

  // Send only signatures, not full implementation
  const compressed = extractSignatures(content);

  const prompt = [
    vscode.LanguageModelChatMessage.User(
      `Summarize this ${mod.type} in max 12 words. Focus on what it does, not how.\n\n${compressed}`
    ),
  ];

  const cts = new vscode.CancellationTokenSource();
  try {
    const response = await model.sendRequest(prompt, {}, cts.token);

    let summary = '';
    for await (const chunk of response.text) {
      summary += chunk;
    }

    return summary.trim().replace(/^["']|["']$/g, '');
  } finally {
    cts.dispose();
  }
}

function extractSignatures(content: string): string {
  // Extract only function/class/interface signatures — strip bodies
  const lines = content.split('\n');
  const signatures: string[] = [];
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (braceDepth === 0 && (
      trimmed.startsWith('import ') ||
      trimmed.startsWith('export ') ||
      trimmed.startsWith('interface ') ||
      trimmed.startsWith('type ') ||
      trimmed.startsWith('class ') ||
      trimmed.startsWith('function ') ||
      trimmed.startsWith('const ') ||
      trimmed.startsWith('async ')
    )) {
      signatures.push(line);
    }

    braceDepth += (line.match(/{/g) || []).length;
    braceDepth -= (line.match(/}/g) || []).length;
    braceDepth = Math.max(0, braceDepth);
  }

  return signatures.slice(0, 40).join('\n'); // cap at 40 lines
}
