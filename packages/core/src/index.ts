export { SESSION_COOKIE, CSRF_HEADER } from './constants.js';

export type {
  User,
  UserWithGroups,
  Group,
  ModuleInfo,
  Grant,
  ModuleAccess,
  ModuleSummary,
  MeResponse,
  Action,
} from './types.js';

export { can } from './permissions.js';
export type { CanOptions } from './permissions.js';

export { MODULE_ID_PATTERN } from './registry.js';

export { validateManifest, ManifestError } from './manifest.js';
export type {
  ModuleManifest,
  ManifestEntity,
  ManifestField,
  ManifestEntitySort,
  ManifestSummary,
  ModuleKind,
  FieldType,
  SortDirection,
} from './manifest.js';

export type { CoreApi, GroupListEntry } from './api.js';

export type {
  CodeModuleRegister,
  HttpMethod,
  ModuleContext,
  ModuleDb,
  RouteSchema,
  RouteSpec,
} from './modules.js';

export { registerModule, isModuleRegistered, getModule, listModules } from './registry.js';

export { createScopedStore } from './store.js';
export type { ScopedStore, ScopedStoreEntry, SqlDb, SqlPrepared } from './store.js';

export type {
  AppearanceColors,
  AppearanceFontOption,
  AppearanceState,
  MotionPreset,
  RadiusPreset,
} from './appearance.js';
export {
  APPEARANCE_FONT_BODY,
  APPEARANCE_FONT_DISPLAY,
  DEFAULT_APPEARANCE,
  parseAppearance,
  validateAppearance,
} from './appearance.js';
