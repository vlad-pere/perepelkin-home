import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateManifest, type ModuleManifest } from '@perepelkin-home/core';

export interface ManifestLoadError {
  id: string;
  message: string;
}

export interface LoadedManifests {
  modules: ModuleManifest[];
  errors: ManifestLoadError[];
}

function readManifestFile(file: string): { manifest?: ModuleManifest; error?: string } {
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return { manifest: validateManifest(raw) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Читает `manifest.json` из подкаталогов `modulesDir` (по одному модулю на каталог). */
export function loadManifests(modulesDir: string): LoadedManifests {
  const modules: ModuleManifest[] = [];
  const errors: ManifestLoadError[] = [];
  if (!existsSync(modulesDir)) return { modules, errors };

  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(modulesDir, entry.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;

    const { manifest, error } = readManifestFile(manifestPath);
    if (manifest) {
      modules.push(manifest);
    } else if (error) {
      errors.push({ id: entry.name, message: error });
    }
  }

  return { modules, errors };
}
