import type { ModuleInfo } from './types.js';

export const MODULE_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

const registry = new Map<string, ModuleInfo>();

export function registerModule(info: ModuleInfo): void {
  if (!MODULE_ID_PATTERN.test(info.id)) {
    throw new Error(`Invalid module id "${info.id}": expected /^[a-z0-9-]{1,64}$/`);
  }
  if (!info.name.trim()) {
    throw new Error(`Module "${info.id}" must have a non-empty name`);
  }
  registry.set(info.id, { ...info, name: info.name.trim() });
}

export function isModuleRegistered(moduleId: string): boolean {
  return registry.has(moduleId);
}

export function getModule(moduleId: string): ModuleInfo | undefined {
  return registry.get(moduleId);
}

export function listModules(): ModuleInfo[] {
  return [...registry.values()];
}
