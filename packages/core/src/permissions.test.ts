import { describe, expect, it } from 'vitest';
import { can } from '../src/permissions.js';
import type { Grant } from '../src/types.js';

function makeCan(grants: Record<string, Grant>, isAdmin = false, groupIds: number[] = [1]) {
  return (moduleId: string, action: 'read' | 'write') =>
    can(
      {
        isAdmin,
        groupIds,
        isRegistered: (id) => id === 'notes' || id === 'games',
        getGrant: (gid, mid) => grants[`${gid}:${mid}`] ?? null,
      },
      moduleId,
      action,
    );
}

describe('core.can', () => {
  const grants: Record<string, Grant> = {
    '1:notes': { canRead: true, canWrite: false },
    '2:notes': { canRead: false, canWrite: true },
    '2:games': { canRead: true, canWrite: true },
  };

  it('denies unknown actions', () => {
    // @ts-expect-error deliberate invalid action
    expect(can({ isAdmin: true, groupIds: [], isRegistered: () => true, getGrant: () => null }, 'notes', 'delete')).toBe(false);
  });

  it('denies unregistered modules even for admin', () => {
    expect(can({ isAdmin: true, groupIds: [], isRegistered: () => false, getGrant: () => null }, 'ghost', 'read')).toBe(false);
  });

  it('admin can read and write any registered module', () => {
    const c = makeCan(grants, true);
    expect(c('games', 'read')).toBe(true);
    expect(c('games', 'write')).toBe(true);
    expect(c('notes', 'write')).toBe(true);
  });

  it('read-only group cannot write', () => {
    const c = makeCan(grants, false, [1]);
    expect(c('notes', 'read')).toBe(true);
    expect(c('notes', 'write')).toBe(false);
  });

  it('user without grants sees nothing', () => {
    const c = makeCan(grants, false, [3]);
    expect(c('notes', 'read')).toBe(false);
    expect(c('notes', 'write')).toBe(false);
    expect(c('games', 'read')).toBe(false);
  });

  it('union of groups grants access', () => {
    const c = makeCan(grants, false, [1, 2]);
    expect(c('notes', 'read')).toBe(true);
    expect(c('notes', 'write')).toBe(true);
    expect(c('games', 'read')).toBe(true);
  });
});
