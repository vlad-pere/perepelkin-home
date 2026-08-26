import { MODULE_ID_PATTERN } from './registry.js';

export type ModuleKind = 'simple' | 'code';
export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'url';
export type SortDirection = 'asc' | 'desc';

export interface ManifestField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

export interface ManifestEntitySort {
  field: string;
  direction: SortDirection;
}

export interface ManifestEntity {
  name: string;
  label: string;
  fields: ManifestField[];
  defaultSort?: ManifestEntitySort;
}

/**
 * Декларативная конфигурация summary для карточки на дашборде.
 * Поддерживаемые фильтры: `field = value`, `field < value`, `field > value`.
 */
export interface ManifestSummary {
  /** SQL-подобный фильтр (простые паттерны: `done = 0`, `status < 3`). */
  filter?: string;
  /** Текст при count = 1 (напр. «напоминает», «запись», «покупка»). */
  labelOne: string;
  /** Текст при count 2–4 (напр. «напоминают», «записи», «покупки»). */
  labelFew: string;
  /** Текст при count 5+ (напр. «напоминают», «записей», «покупок»). */
  labelMany: string;
  /** Текст при нулевом count. */
  emptyText?: string;
}

export interface ModuleManifest {
  id: string;
  name: string;
  description: string;
  kind: ModuleKind;
  /** Если true — GET-роуты модуля (манифест и списки сущностей) доступны без входа. */
  publicRead?: boolean;
  /** Идентификатор иконки (например, имя компонента из библиотеки иконок). */
  icon?: string;
  /** CSS-цвет акцента модуля (hex или CSS-переменная). */
  color?: string;
  /** Конфигурация summary для карточки на дашборде. */
  summary?: ManifestSummary;
  entities: ManifestEntity[];
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

const FIELD_TYPES: readonly string[] = ['text', 'textarea', 'number', 'date', 'boolean', 'url'];
const RESERVED_FIELD_NAMES = new Set(['id', 'created_at', 'updated_at', 'created_by']);
const NAME_PATTERN = /^[a-z][a-zA-Z0-9_]{0,63}$/;
const TOP_LEVEL_KEYS = ['id', 'name', 'description', 'kind', 'publicRead', 'icon', 'color', 'summary', 'entities'] as const;
const ENTITY_KEYS = ['name', 'label', 'fields', 'defaultSort'] as const;
const FIELD_KEYS = ['name', 'label', 'type', 'required'] as const;
const SORT_KEYS = ['field', 'direction'] as const;
const SUMMARY_KEYS = ['filter', 'labelOne', 'labelFew', 'labelMany', 'emptyText'] as const;
const SUMMARY_FILTER_RE = /^[a-z_][a-zA-Z0-9_]*\s*[<>=]+\s*-?\d+$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Валидирует и нормализует манифест модуля.
 * Бросает {@link ManifestError} с сообщением, начинающимся с id модуля.
 * Простые модули обязаны объявлять хотя бы одну сущность; код-модули — нет.
 */
export function validateManifest(input: unknown): ModuleManifest {
  if (!isPlainObject(input)) throw new ManifestError('Manifest: expected an object');

  const rawId = typeof input.id === 'string' ? input.id.trim() : '';
  const prefix = rawId === '' ? 'Manifest: ' : `Module "${rawId}": `;
  function fail(message: string): never {
    throw new ManifestError(prefix + message);
  }

  const str = (v: unknown, what: string, max: number, min = 0): string => {
    if (typeof v !== 'string') fail(`${what} must be a string`);
    const t = v.trim();
    if (t.length < min) fail(`${what} must not be empty`);
    if (t.length > max) fail(`${what} must be at most ${max} characters`);
    return t;
  };

  const rejectUnknownKeys = (obj: Record<string, unknown>, allowed: readonly string[], what: string): void => {
    for (const key of Object.keys(obj)) {
      if (!allowed.includes(key)) fail(`unknown key "${key}" in ${what}`);
    }
  };

  rejectUnknownKeys(input, TOP_LEVEL_KEYS, 'manifest');

  if (rawId === '' || !MODULE_ID_PATTERN.test(rawId)) {
    fail('id must match /^[a-z0-9-]{1,64}$/');
  }
  const id = rawId;
  const name = str(input.name, 'name', 200, 1);
  const description = input.description === undefined ? '' : str(input.description, 'description', 500);

  const kind = input.kind;
  if (kind !== 'simple' && kind !== 'code') {
    fail('kind must be "simple" or "code"');
  }

  if (input.publicRead !== undefined && typeof input.publicRead !== 'boolean') {
    fail('publicRead must be a boolean');
  }

  const rawEntities = input.entities === undefined ? [] : input.entities;
  if (!Array.isArray(rawEntities)) fail('entities must be an array');
  if (kind === 'simple' && rawEntities.length === 0) {
    fail('a simple module must declare at least one entity');
  }

  const entities: ManifestEntity[] = [];
  const seenEntities = new Set<string>();

  for (const rawEntity of rawEntities) {
    if (!isPlainObject(rawEntity)) fail('each entity must be an object');
    rejectUnknownKeys(rawEntity, ENTITY_KEYS, 'entity');

    const eName = str(rawEntity.name, 'entity name', 64, 1);
    if (!NAME_PATTERN.test(eName)) {
      fail(`entity name "${eName}" must match /^[a-z][a-zA-Z0-9_]{0,63}$/`);
    }
    if (seenEntities.has(eName.toLowerCase())) fail(`duplicate entity "${eName}"`);
    seenEntities.add(eName.toLowerCase());

    const eLabel = str(rawEntity.label, `entity "${eName}" label`, 200, 1);

    if (!Array.isArray(rawEntity.fields) || rawEntity.fields.length === 0) {
      fail(`entity "${eName}" must declare at least one field`);
    }

    const fields: ManifestField[] = [];
    const seenFields = new Set<string>();
    for (const rawField of rawEntity.fields) {
      if (!isPlainObject(rawField)) fail(`field in entity "${eName}" must be an object`);
      rejectUnknownKeys(rawField, FIELD_KEYS, `field in entity "${eName}"`);

      const fName = str(rawField.name, `field name in entity "${eName}"`, 64, 1);
      if (!NAME_PATTERN.test(fName)) {
        fail(`field name "${fName}" must match /^[a-z][a-zA-Z0-9_]{0,63}$/`);
      }
      if (RESERVED_FIELD_NAMES.has(fName)) fail(`field name "${fName}" is reserved`);
      if (seenFields.has(fName.toLowerCase())) fail(`duplicate field "${fName}" in entity "${eName}"`);
      seenFields.add(fName.toLowerCase());

      const fLabel = str(rawField.label, `field "${fName}" label`, 200, 1);

      if (typeof rawField.type !== 'string' || !FIELD_TYPES.includes(rawField.type)) {
        fail(`field "${fName}" type must be one of ${FIELD_TYPES.join(', ')}`);
      }
      if (rawField.required !== undefined && typeof rawField.required !== 'boolean') {
        fail(`field "${fName}" required must be a boolean`);
      }

      fields.push({
        name: fName,
        label: fLabel,
        type: rawField.type as FieldType,
        ...(rawField.required === undefined ? {} : { required: rawField.required }),
      });
    }

    let defaultSort: ManifestEntitySort | undefined;
    if (rawEntity.defaultSort !== undefined) {
      if (!isPlainObject(rawEntity.defaultSort)) fail(`entity "${eName}" defaultSort must be an object`);
      rejectUnknownKeys(rawEntity.defaultSort, SORT_KEYS, `defaultSort of entity "${eName}"`);
      const sField = str(rawEntity.defaultSort.field, 'defaultSort field', 64, 1);
      if (!seenFields.has(sField.toLowerCase())) fail(`defaultSort field "${sField}" not found in entity "${eName}"`);
      const direction = rawEntity.defaultSort.direction;
      if (direction !== 'asc' && direction !== 'desc') {
        fail('defaultSort direction must be "asc" or "desc"');
      }
      defaultSort = { field: sField, direction };
    }

    entities.push({
      name: eName,
      label: eLabel,
      fields,
      ...(defaultSort === undefined ? {} : { defaultSort }),
    });
  }

  const icon = input.icon === undefined ? undefined : str(input.icon, 'icon', 64, 1);
  const color = input.color === undefined ? undefined : str(input.color, 'color', 32, 1);

  let summary: ManifestSummary | undefined;
  if (input.summary !== undefined) {
    if (!isPlainObject(input.summary)) fail('summary must be an object');
    rejectUnknownKeys(input.summary, SUMMARY_KEYS, 'summary');
    const sLabelOne = str(input.summary.labelOne, 'summary.labelOne', 64, 1);
    const sLabelFew = str(input.summary.labelFew, 'summary.labelFew', 64, 1);
    const sLabelMany = str(input.summary.labelMany, 'summary.labelMany', 64, 1);
    const sFilter = input.summary.filter === undefined ? undefined : str(input.summary.filter, 'summary.filter', 128, 1);
    const sEmptyText = input.summary.emptyText === undefined ? undefined : str(input.summary.emptyText, 'summary.emptyText', 64, 1);
    if (sFilter !== undefined && !SUMMARY_FILTER_RE.test(sFilter)) {
      fail('summary.filter must match pattern: field = value, field < value, or field > value');
    }
    summary = {
      labelOne: sLabelOne,
      labelFew: sLabelFew,
      labelMany: sLabelMany,
      ...(sFilter === undefined ? {} : { filter: sFilter }),
      ...(sEmptyText === undefined ? {} : { emptyText: sEmptyText }),
    };
  }

  return {
    id,
    name,
    description,
    kind: kind as ModuleKind,
    ...(input.publicRead === undefined ? {} : { publicRead: input.publicRead }),
    ...(icon === undefined ? {} : { icon }),
    ...(color === undefined ? {} : { color }),
    ...(summary === undefined ? {} : { summary }),
    entities,
  };
}
