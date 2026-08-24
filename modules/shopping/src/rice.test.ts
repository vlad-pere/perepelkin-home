import { describe, expect, it } from 'vitest';
import {
  clampRating,
  effortOf,
  formatScore,
  scoreOf,
  sortActive,
  sortBought,
  STATUS_BOUGHT,
  STATUS_PLANNED,
  STATUS_WANT,
} from './rice.js';
import type { RiceItem } from './rice.js';

function item(patch: Partial<RiceItem> = {}): RiceItem {
  return {
    id: 1,
    title: 'Покупка',
    status: STATUS_WANT,
    reach: 3,
    impact: 3,
    confidence: 3,
    cost: 3,
    complexity: 3,
    price: null,
    link: null,
    comment: null,
    created_by_username: null,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
    ...patch,
  };
}

describe('clampRating', () => {
  it('округляет до целого и держит в диапазоне 1..5', () => {
    expect(clampRating(1)).toBe(1);
    expect(clampRating(5)).toBe(5);
    expect(clampRating(3.6)).toBe(4);
    expect(clampRating(0)).toBe(1);
    expect(clampRating(-2)).toBe(1);
    expect(clampRating(9)).toBe(5);
  });

  it('нечисловые значения превращает в нейтральную тройку', () => {
    expect(clampRating(null)).toBe(3);
    expect(clampRating(undefined)).toBe(3);
    expect(clampRating(Number.NaN)).toBe(3);
    expect(clampRating('4')).toBe(3);
  });
});

describe('effortOf', () => {
  it('среднее денег и сложности с шагом 0.5', () => {
    expect(effortOf(4, 4)).toBe(4);
    expect(effortOf(2, 5)).toBe(3.5);
    expect(effortOf(1, 1)).toBe(1);
  });

  it('учитывает границы шкалы через clamp', () => {
    expect(effortOf(0, 99)).toBe(3);
  });
});

describe('scoreOf', () => {
  it('считает (R × I × C) / Effort по примерам из методички', () => {
    const fridge = { reach: 5, impact: 5, confidence: 5, cost: 4, complexity: 4 };
    expect(scoreOf(fridge)).toBeCloseTo(31.25, 5);

    const washer = { reach: 5, impact: 5, confidence: 5, cost: 3, complexity: 3 };
    expect(scoreOf(washer)).toBeCloseTo(125 / 3, 5);

    const thermostat = { reach: 3, impact: 3, confidence: 2, cost: 5, complexity: 5 };
    expect(scoreOf(thermostat)).toBeCloseTo(3.6, 5);

    const minimum = { reach: 1, impact: 1, confidence: 1, cost: 5, complexity: 5 };
    expect(scoreOf(minimum)).toBeCloseTo(0.2, 5);

    const maximum = { reach: 5, impact: 5, confidence: 5, cost: 1, complexity: 1 };
    expect(scoreOf(maximum)).toBe(125);
  });
});

describe('formatScore', () => {
  it('целые без дробной части, остальные — один знак', () => {
    expect(formatScore(12)).toBe('12');
    expect(formatScore(125)).toBe('125');
    expect(formatScore(31.25)).toBe('31.3');
    expect(formatScore(125 / 3)).toBe('41.7');
    expect(formatScore(0.2)).toBe('0.2');
  });
});

describe('sortActive', () => {
  it('сортирует по баллу по убыванию, при равенстве — по id', () => {
    const low = item({ id: 1, title: 'Подушки' }); // 27 / 3 = 9
    const oldHigh = item({ id: 2, title: 'Старая стиралка', confidence: 5 }); // 45/3 = 15
    const newHigh = item({ id: 3, title: 'Новая стиралка', confidence: 5 }); // тот же балл
    const sorted = sortActive([low, newHigh, oldHigh]);
    expect(sorted.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('не мутирует исходный массив', () => {
    const a = item({ id: 1 });
    const b = item({ id: 2, confidence: 5 });
    const original = [a, b];
    sortActive(original);
    expect(original.map((r) => r.id)).toEqual([1, 2]);
  });
});

describe('sortBought', () => {
  it('свежекупленные сверху', () => {
    const older = item({ id: 1, status: STATUS_BOUGHT, updated_at: '2026-08-01T10:00:00.000Z' });
    const newer = item({ id: 2, status: STATUS_BOUGHT, updated_at: '2026-08-20T10:00:00.000Z' });
    const sorted = sortBought([older, newer]);
    expect(sorted.map((r) => r.id)).toEqual([2, 1]);
  });
});

describe('статусы', () => {
  it('фиксированные значения согласованы с манифестом', () => {
    expect(STATUS_WANT).toBe(1);
    expect(STATUS_PLANNED).toBe(2);
    expect(STATUS_BOUGHT).toBe(3);
  });
});
