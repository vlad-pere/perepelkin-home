import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ModuleAccess, ModuleKind } from '@perepelkin-home/core';
import { CrudModule } from './CrudModule';

export interface ModuleApiClient {
  <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export interface ModuleUiProps {
  moduleId: string;
  api: ModuleApiClient;
  currentUserId: number;
  canWrite: boolean;
}

export type ModuleUiComponent = ComponentType<ModuleUiProps>;

const CODE_UI: Record<string, LazyExoticComponent<ModuleUiComponent>> = {
  todo: lazy(() => import('@perepelkin-home/module-todo/ui')),
  wishlist: lazy(() => import('@perepelkin-home/module-wishlist/ui')),
  diary: lazy(() => import('@perepelkin-home/module-diary/ui')),
  move: lazy(() => import('@perepelkin-home/module-move/ui')),
  shopping: lazy(() => import('@perepelkin-home/module-shopping/ui')),
  maintenance: lazy(() => import('@perepelkin-home/module-maintenance/ui')),
};

export function resolveModuleUi(id: string, kind: ModuleKind): ModuleUiComponent | null {
  const custom = CODE_UI[id];
  if (custom) return custom;
  if (kind === 'simple') return CrudModule;
  return null;
}

export function ModuleUnavailable({ module }: { module: ModuleAccess }) {
  return (
    <main className="crud">
      <h1 className="crud-title">{module.name}</h1>
      <p className="crud-sub">Для этого модуля пока нет интерфейса. Попробуйте позже.</p>
    </main>
  );
}
