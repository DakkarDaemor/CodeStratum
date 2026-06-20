import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { Project, SourceFile } from 'ts-morph';
import { ModuleEntry, Relation } from '../types';

const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const IGNORE_PATTERNS = ['node_modules', 'out', 'dist', '.next', 'coverage', '.git'];

export interface IndexResult {
  modules: Record<string, ModuleEntry>;
  relations: Relation[];
  stack: string[];
  entryPoints: string[];
}

export async function indexProject(rootPath: string): Promise<IndexResult> {
  const project = new Project({ skipAddingFilesFromTsConfig: false });

  // Add all supported source files
  const files = collectFiles(rootPath);
  project.addSourceFilesAtPaths(files);

  const modules: Record<string, ModuleEntry> = {};
  const relations: Relation[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = path.relative(rootPath, sourceFile.getFilePath());
    if (shouldIgnore(filePath)) { continue; }

    const entry = parseSourceFile(sourceFile, rootPath);
    modules[filePath] = entry;

    // Build relations from imports
    for (const imp of entry.imports) {
      relations.push({ from: filePath, to: imp, type: 'imports' });
    }
  }

  return {
    modules,
    relations,
    stack: detectStack(rootPath),
    entryPoints: detectEntryPoints(Object.keys(modules)),
  };
}

function parseSourceFile(sourceFile: SourceFile, rootPath: string): ModuleEntry {
  const filePath = sourceFile.getFilePath();
  const content = sourceFile.getFullText();
  const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);

  // Exports
  const exports: string[] = [];
  sourceFile.getExportedDeclarations().forEach((_, name) => exports.push(name));

  // Imports (resolve to relative paths)
  const imports: string[] = [];
  for (const imp of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    if (moduleSpecifier.startsWith('.')) {
      const resolved = path.relative(
        rootPath,
        path.resolve(path.dirname(filePath), moduleSpecifier)
      );
      imports.push(resolved);
    }
  }

  // Complexity heuristic: line count + export count
  const lines = content.split('\n').length;
  const complexity = lines < 80 ? 'low' : lines < 250 ? 'medium' : 'high';

  // File type heuristic
  const type = inferType(filePath, exports);

  return {
    type,
    exports,
    imports,
    semanticSummary: '', // filled by annotator
    complexity,
    lastIndexed: new Date().toISOString(),
    hash,
  };
}

function inferType(filePath: string, exports: string[]): ModuleEntry['type'] {
  const lower = filePath.toLowerCase();
  if (lower.includes('.test.') || lower.includes('.spec.')) { return 'test'; }
  if (lower.includes('/hook') || exports.some(e => e.startsWith('use'))) { return 'hook'; }
  if (lower.includes('/component') || lower.endsWith('.tsx')) { return 'component'; }
  if (lower.includes('/service') || lower.includes('/api')) { return 'service'; }
  if (lower.includes('/type') || lower.includes('/interface')) { return 'type'; }
  if (lower.includes('/util') || lower.includes('/helper')) { return 'util'; }
  if (lower.includes('config') || lower.includes('.config.')) { return 'config'; }
  return 'unknown';
}

function collectFiles(rootPath: string): string[] {
  const results: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE_PATTERNS.some(p => entry.name.includes(p))) { continue; }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); }
      else if (SUPPORTED_EXTENSIONS.includes(path.extname(entry.name))) { results.push(full); }
    }
  }
  walk(rootPath);
  return results;
}

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(p => filePath.includes(p));
}

function detectStack(rootPath: string): string[] {
  const stack: string[] = ['typescript'];
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootPath, 'package.json'), 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['react']) { stack.push('react'); }
    if (deps['next']) { stack.push('next.js'); }
    if (deps['vue']) { stack.push('vue'); }
    if (deps['express']) { stack.push('express'); }
    if (deps['@nestjs/core']) { stack.push('nestjs'); }
  } catch { /* no package.json */ }
  return stack;
}

function detectEntryPoints(files: string[]): string[] {
  return files.filter(f =>
    f.includes('index.ts') || f.includes('main.ts') ||
    f.includes('app/page.tsx') || f.includes('server/index.ts')
  ).slice(0, 5);
}
