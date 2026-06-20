import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CartoCache } from '../types';

const CACHE_FILE = 'stratum.json';
const MARKDOWN_FILE = 'stratum.md';

export function readCache(rootPath: string): CartoCache | null {
  const cachePath = path.join(rootPath, CACHE_FILE);
  if (!fs.existsSync(cachePath)) { return null; }
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as CartoCache;
  } catch {
    return null;
  }
}

export function writeCache(rootPath: string, cache: CartoCache): void {
  const cachePath = path.join(rootPath, CACHE_FILE);
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
  fs.writeFileSync(path.join(rootPath, MARKDOWN_FILE), toMarkdown(cache), 'utf-8');
}

export function detectChangedFiles(
  rootPath: string,
  cache: CartoCache
): string[] {
  const changed: string[] = [];
  for (const [filePath, entry] of Object.entries(cache.modules)) {
    const fullPath = path.join(rootPath, filePath);
    if (!fs.existsSync(fullPath)) {
      changed.push(`${filePath} (deleted)`);
      continue;
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
    if (hash !== entry.hash) {
      changed.push(filePath);
    }
  }
  return changed;
}

function toMarkdown(cache: CartoCache): string {
  const lines: string[] = [
    `# CodeStratum — ${cache.project.name}`,
    `> Generated: ${cache.generatedAt}  |  Stack: ${cache.project.stack.join(', ')}`,
    '',
    '## Entry Points',
    ...cache.project.entryPoints.map(e => `- \`${e}\``),
    '',
    '## Modules',
    '',
  ];

  for (const [filePath, mod] of Object.entries(cache.modules)) {
    lines.push(`### \`${filePath}\``);
    lines.push(`- **Type:** ${mod.type}  |  **Complexity:** ${mod.complexity}`);
    if (mod.semanticSummary) {
      lines.push(`- **Summary:** ${mod.semanticSummary}`);
    }
    if (mod.exports.length) {
      lines.push(`- **Exports:** ${mod.exports.join(', ')}`);
    }
    if (mod.imports.length) {
      lines.push(`- **Imports:** ${mod.imports.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Relations', '');
  for (const rel of cache.relations) {
    lines.push(`- \`${rel.from}\` → \`${rel.to}\` *(${rel.type})*`);
  }

  return lines.join('\n');
}
