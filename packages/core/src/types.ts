import type { ModuleKind } from './manifest.js';

export interface User {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface UserWithGroups extends User {
  groups: Group[];
}

export interface Group {
  id: number;
  name: string;
  description: string;
  createdAt: string;
}

export interface ModuleInfo {
  /** Стабильный машиночитаемый идентификатор: `^[a-z0-9-]{1,64}$` */
  id: string;
  name: string;
  description: string;
}

export interface Grant {
  canRead: boolean;
  canWrite: boolean;
}

export interface ModuleAccess extends ModuleInfo, Grant {
  /** `simple` — UI из манифеста; `code` — собственный React-компонент. */
  kind: ModuleKind;
  /** Фронтовый маршрут, по которому открывается модуль. */
  route: string;
}

export interface MeResponse {
  user: User;
  groups: Group[];
  modules: ModuleAccess[];
}

export type Action = 'read' | 'write';
