import * as vscode from 'vscode';
import * as path from 'path';
import { indexProject } from './indexer';
import { annotateModules } from './annotator';
import { readCache, writeCache, detectChangedFiles } from './cache';
import { planTask } from './planner';
import { executeTasksInSeries } from './executor';
import { getPanelHtml } from './panel/html';
import { CartoCache, AtomicTask } from './types';

let panel: vscode.WebviewView | undefined;
let currentPlan: AtomicTask[] = [];

export function activate(context: vscode.ExtensionContext) {
  // Register webview panel
  const provider = new CodeStratumViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('codestratum.panel', provider)
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('codestratum.init', () => runInit()),
    vscode.commands.registerCommand('codestratum.status', () => runStatus()),
    vscode.commands.registerCommand('codestratum.openPanel', () => {
      vscode.commands.executeCommand('workbench.view.extension.codestratum');
    })
  );

}

async function getRootPath(): Promise<string | undefined> {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function runInit() {
  const rootPath = await getRootPath();
  if (!rootPath) {
    vscode.window.showErrorMessage('CodeStratum: No workspace open.');
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'CodeStratum', cancellable: false },
    async (progress) => {
      try {
        progress.report({ message: 'Indexing project…' });
        const indexResult = await indexProject(rootPath);

        progress.report({ message: 'Annotating modules…' });
        const annotated = await annotateModules(
          rootPath,
          indexResult.modules,
          (current, total, file) => {
            progress.report({ message: `Annotating ${current}/${total}: ${path.basename(file)}` });
          }
        );

        const cache: CartoCache = {
          version: '1.0',
          generatedAt: new Date().toISOString(),
          project: {
            name: path.basename(rootPath),
            stack: indexResult.stack,
            entryPoints: indexResult.entryPoints,
          },
          modules: annotated,
          relations: indexResult.relations,
        };

        writeCache(rootPath, cache);

        const moduleCount = Object.keys(cache.modules).length;
        const summary = `${moduleCount} modules · ${cache.project.stack.join(', ')}`;

        panel?.webview.postMessage({ type: 'initDone', summary });
        vscode.window.showInformationMessage(`CodeStratum: Indexed ${moduleCount} modules.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        panel?.webview.postMessage({ type: 'initError', error: msg });
        vscode.window.showErrorMessage(`CodeStratum init failed: ${msg}`);
      }
    }
  );
}

async function runStatus() {
  const rootPath = await getRootPath();
  if (!rootPath) { return; }

  const cache = readCache(rootPath);
  if (!cache) {
    vscode.window.showWarningMessage('CodeStratum: No index found. Run Init first.');
    return;
  }

  const changed = detectChangedFiles(rootPath, cache);
  if (changed.length === 0) {
    vscode.window.showInformationMessage('CodeStratum: Index is up to date.');
  } else {
    const msg = `CodeStratum: ${changed.length} file(s) changed since last index:\n${changed.slice(0, 10).join('\n')}`;
    vscode.window.showWarningMessage(msg);
  }
}

async function checkCacheOnStartup() {
  const rootPath = await getRootPath();
  if (!rootPath) { return; }

  const cache = readCache(rootPath);
  if (!cache) {
    panel?.webview.postMessage({ type: 'initError' });
    return;
  }

  const changed = detectChangedFiles(rootPath, cache);
  const moduleCount = Object.keys(cache.modules).length;
  panel?.webview.postMessage({
    type: 'cacheStatus',
    summary: `${moduleCount} modules · ${new Date(cache.generatedAt).toLocaleDateString()}`,
    stale: changed.length > 0,
  });
}

// Panel provider
class CodeStratumViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    panel = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getPanelHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      const rootPath = await getRootPath();
      if (!rootPath) { return; }

      if (msg.type === 'init') {
        await runInit();
        return;
      }

      if (msg.type === 'plan') {
        const cache = readCache(rootPath);
        if (!cache) {
          webviewView.webview.postMessage({ type: 'planError', error: 'No index. Run Init first.' });
          return;
        }
        try {
          const plan = await planTask(msg.task, cache);
          currentPlan = plan.tasks;
          webviewView.webview.postMessage({ type: 'planDone', tasks: currentPlan });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          webviewView.webview.postMessage({ type: 'planError', error });
        }
        return;
      }

      if (msg.type === 'applyResult') {
        const targetUri = vscode.Uri.file(path.join(rootPath, msg.targetFile));
        try {
          await vscode.workspace.fs.writeFile(targetUri, Buffer.from(msg.result, 'utf-8'));
          await vscode.window.showTextDocument(targetUri);
          webviewView.webview.postMessage({ type: 'applyDone', taskId: msg.taskId, targetFile: msg.targetFile });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          webviewView.webview.postMessage({ type: 'applyError', taskId: msg.taskId, error });
        }
        return;
      }

      if (msg.type === 'execute') {
        const approvedIds: number[] = msg.taskIds;
        currentPlan.forEach(t => { t.approved = approvedIds.includes(t.id); });
        const cache = readCache(rootPath)!;

        await executeTasksInSeries(
          currentPlan,
          cache,
          rootPath,
          (task) => webviewView.webview.postMessage({ type: 'taskStart', taskId: task.id, description: task.description }),
          (taskId, chunk) => webviewView.webview.postMessage({ type: 'taskChunk', taskId, chunk }),
          (task, result) => webviewView.webview.postMessage({ type: 'taskDone', taskId: task.id, result }),
          (task, error) => webviewView.webview.postMessage({ type: 'taskError', taskId: task.id, error })
        );

        webviewView.webview.postMessage({ type: 'executeDone' });
      }
    });

    // Send cache status when panel opens
    checkCacheOnStartup();
  }
}

export function deactivate() {}
