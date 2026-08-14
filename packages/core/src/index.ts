export { SESSION_COOKIE, CSRF_HEADER } from './constants.js';

export type {
  User,
  UserWithGroups,
  Group,
  AuthMode,
  ModuleInfo,
  Grant,
  ModuleAccess,
  MeResponse,
  Action,
} from './types.js';

export { can } from './permissions.js';
export type { CanOptions } from './permissions.js';

export { validateManifest, ManifestError } from './manifest.js';
export type {
  ModuleManifest,
  ManifestEntity,
  ManifestField,
  ManifestEntitySort,
  ModuleKind,
  FieldType,
  SortDirection,
} from './manifest.js';

export type { CoreApi, GroupListEntry } from './api.js';

export {
  registerModule,
  isModuleRegistered,
  getModule,
  listModules,
} from './registry.js';

export { createScopedStore } from './store.js';
export type { ScopedStore, ScopedStoreEntry, SqlDb, SqlPrepared } from './store.js';
