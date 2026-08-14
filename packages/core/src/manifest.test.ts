import { describe, expect, it } from 'vitest';
import { ManifestError, validateManifest } from '../src/manifest.js';

function simpleManifest(): Record<string, unknown> {
  return {
    id: 'maintenance',
    name: 'Обслуживание вещей',
    description: 'Когда что обслуживать',
    kind: 'simple',
    entities: [
      {
        name: 'item',
        label: 'Вещь',
        fields: [
          { name: 'title', label: 'Название', type: 'text', required: true },
          { name: 'nextDue', label: 'Следующее обслуживание', type: 'date' },
          { name: 'intervalMonths', label: 'Периодичность, мес.', type: 'number' },
        ],
        defaultSort: { field: 'nextDue', direction: 'asc' },
      },
    ],
  };
}

describe('validateManifest', () => {
  it('accepts a valid simple manifest', () => {
    const m = validateManifest(simpleManifest());
    expect(m.id).toBe('maintenance');
    expect(m.kind).toBe('simple');
    expect(m.entities).toHaveLength(1);
    expect(m.entities[0]?.fields).toHaveLength(3);
    expect(m.entities[0]?.defaultSort).toEqual({ field: 'nextDue', direction: 'asc' });
  });

  it('accepts a code manifest without entities, normalizing to []', () => {
    const m = validateManifest({ id: 'admin', name: 'Администрирование', kind: 'code' });
    expect(m.kind).toBe('code');
    expect(m.entities).toEqual([]);
  });

  it('trims name/description and defaults description to empty string', () => {
    const raw = { id: 'notes', name: '  Заметки  ', kind: 'simple', entities: [{ name: 'note', label: 'Заметка', fields: [{ name: 'title', label: 'Заголовок', type: 'text' }] }] };
    const m = validateManifest(raw);
    expect(m.name).toBe('Заметки');
    expect(m.description).toBe('');
  });

  it('keeps required absent when not specified', () => {
    const m = validateManifest(simpleManifest());
    expect(m.entities[0]?.fields[1]?.required).toBeUndefined();
  });

  it('accepts publicRead flag and normalizes absence', () => {
    const m = validateManifest({ ...simpleManifest(), publicRead: true });
    expect(m.publicRead).toBe(true);

    const plain = validateManifest(simpleManifest());
    expect(plain.publicRead).toBeUndefined();
  });

  it('rejects non-boolean publicRead', () => {
    const raw = { ...simpleManifest(), publicRead: 'yes' };
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('accepts a url field type', () => {
    const m = validateManifest({
      ...simpleManifest(),
      entities: [{ name: 'item', label: 'Вещь', fields: [{ name: 'link', label: 'Ссылка', type: 'url' }] }],
    });
    expect(m.entities[0]?.fields[0]?.type).toBe('url');
  });

  it('rejects non-object input', () => {
    for (const bad of [null, undefined, 'string', 42, [], true]) {
      expect(() => validateManifest(bad)).toThrow(ManifestError);
    }
  });

  it('rejects missing id', () => {
    const raw = simpleManifest();
    delete raw.id;
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('rejects invalid module id', () => {
    for (const id of ['Maintenance', 'maintenance room', 'x'.repeat(65)]) {
      const raw = { ...simpleManifest(), id };
      expect(() => validateManifest(raw)).toThrow(ManifestError);
    }
  });

  it('rejects empty name', () => {
    const raw = { ...simpleManifest(), name: '   ' };
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('rejects unknown kind', () => {
    const raw = { ...simpleManifest(), kind: 'dynamic' };
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('rejects a simple module without entities', () => {
    const raw = { id: 'notes', name: 'Заметки', kind: 'simple' };
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('rejects a simple module with empty entities', () => {
    const raw = { ...simpleManifest(), entities: [] };
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('rejects invalid entity name', () => {
    for (const name of ['Item', 'item-thing', '1item', 'item name', 'x'.repeat(65)]) {
      const raw = { ...simpleManifest(), entities: [{ name, label: 'Вещь', fields: [{ name: 'title', label: 'Название', type: 'text' }] }] };
      expect(() => validateManifest(raw)).toThrow(ManifestError);
    }
  });

  it('rejects an entity without fields', () => {
    const raw = { ...simpleManifest(), entities: [{ name: 'item', label: 'Вещь' }] };
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('rejects an entity with empty fields', () => {
    const raw = { ...simpleManifest(), entities: [{ name: 'item', label: 'Вещь', fields: [] }] };
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('rejects unknown field type', () => {
    const raw = { ...simpleManifest(), entities: [{ name: 'item', label: 'Вещь', fields: [{ name: 'title', label: 'Название', type: 'datetime' }] }] };
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('rejects invalid field name', () => {
    for (const name of ['Title', 'title field', '1title']) {
      const raw = { ...simpleManifest(), entities: [{ name: 'item', label: 'Вещь', fields: [{ name, label: 'Название', type: 'text' }] }] };
      expect(() => validateManifest(raw)).toThrow(ManifestError);
    }
  });

  it('rejects reserved field names', () => {
    for (const name of ['id', 'created_at', 'updated_at', 'created_by']) {
      const raw = { ...simpleManifest(), entities: [{ name: 'item', label: 'Вещь', fields: [{ name, label: 'Название', type: 'text' }] }] };
      expect(() => validateManifest(raw)).toThrow(ManifestError);
    }
  });

  it('rejects duplicate entity names', () => {
    const raw = {
      ...simpleManifest(),
      entities: [
        { name: 'item', label: 'Вещь', fields: [{ name: 'title', label: 'Название', type: 'text' }] },
        { name: 'item', label: 'Ещё вещь', fields: [{ name: 'title', label: 'Название', type: 'text' }] },
      ],
    };
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('rejects entity names that collide case-insensitively', () => {
    const raw = {
      ...simpleManifest(),
      entities: [
        { name: 'itemList', label: 'Вещь', fields: [{ name: 'title', label: 'Название', type: 'text' }] },
        { name: 'itemlist', label: 'Ещё вещь', fields: [{ name: 'title', label: 'Название', type: 'text' }] },
      ],
    };
    expect(() => validateManifest(raw)).toThrow(/duplicate entity/i);
  });

  it('rejects duplicate field names within an entity', () => {
    const raw = {
      ...simpleManifest(),
      entities: [
        {
          name: 'item',
          label: 'Вещь',
          fields: [
            { name: 'title', label: 'Название', type: 'text' },
            { name: 'title', label: 'Ещё', type: 'number' },
          ],
        },
      ],
    };
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('rejects field names that collide case-insensitively within an entity', () => {
    const raw = {
      ...simpleManifest(),
      entities: [
        {
          name: 'item',
          label: 'Вещь',
          fields: [
            { name: 'titleData', label: 'Название', type: 'text' },
            { name: 'titledata', label: 'Ещё', type: 'number' },
          ],
        },
      ],
    };
    expect(() => validateManifest(raw)).toThrow(/duplicate field/i);
  });

  it('allows the same field name in different entities', () => {
    const raw = {
      ...simpleManifest(),
      entities: [
        { name: 'item', label: 'Вещь', fields: [{ name: 'title', label: 'Название', type: 'text' }] },
        { name: 'category', label: 'Категория', fields: [{ name: 'title', label: 'Название', type: 'text' }] },
      ],
    };
    const m = validateManifest(raw);
    expect(m.entities).toHaveLength(2);
  });

  it('rejects defaultSort referencing an unknown field', () => {
    const raw = { ...simpleManifest(), entities: [{ name: 'item', label: 'Вещь', fields: [{ name: 'title', label: 'Название', type: 'text' }], defaultSort: { field: 'nextDue', direction: 'asc' } }] };
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('rejects an invalid defaultSort direction', () => {
    const raw = { ...simpleManifest(), entities: [{ name: 'item', label: 'Вещь', fields: [{ name: 'title', label: 'Название', type: 'text' }], defaultSort: { field: 'title', direction: 'up' } }] };
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('rejects unknown keys at every level', () => {
    const top = { ...simpleManifest(), extra: 1 };
    expect(() => validateManifest(top)).toThrow(ManifestError);

    const entity = { ...simpleManifest(), entities: [{ name: 'item', label: 'Вещь', fields: [{ name: 'title', label: 'Название', type: 'text' }], extra: true }] };
    expect(() => validateManifest(entity)).toThrow(ManifestError);

    const field = { ...simpleManifest(), entities: [{ name: 'item', label: 'Вещь', fields: [{ name: 'title', label: 'Название', type: 'text', extra: 1 }] }] };
    expect(() => validateManifest(field)).toThrow(ManifestError);
  });

  it('rejects non-boolean required', () => {
    const raw = { ...simpleManifest(), entities: [{ name: 'item', label: 'Вещь', fields: [{ name: 'title', label: 'Название', type: 'text', required: 'yes' }] }] };
    expect(() => validateManifest(raw)).toThrow(ManifestError);
  });

  it('throws ManifestError mentioning the module id', () => {
    try {
      validateManifest({ id: 'maintenance', name: 'Обслуживание', kind: 'simple' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestError);
      expect((err as Error).message).toContain('maintenance');
    }
  });
});
