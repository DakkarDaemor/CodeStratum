export interface ModuleEntry {
  type: 'component' | 'hook' | 'service' | 'util' | 'type' | 'test' | 'config' | 'unknown';
  exports: string[];
  imports: string[];
  semanticSummary: string;
  complexity: 'low' | 'medium' | 'high';
  lastIndexed: string;
  hash: string;
}

export interface Relation {
  from: string;
  to: string;
  type: 'uses' | 'extends' | 'implements' | 'imports';
}

export interface CartoCache {
  version: string;
  generatedAt: string;
  project: {
    name: string;
    stack: string[];
    entryPoints: string[];
  };
  modules: Record<string, ModuleEntry>;
  relations: Relation[];
}

export interface AtomicTask {
  id: number;
  description: string;
  targetFile?: string;
  approved: boolean;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: string;
}

export interface PlannerOutput {
  originalTask: string;
  tasks: AtomicTask[];
}
