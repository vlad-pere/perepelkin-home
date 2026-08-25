import { describe, expect, it } from 'vitest';
import {
  clampRating,
  effortOf,
  formatScore,
  isRated,
  moneyCoefficient,
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

describe('moneyCoefficient', () => {
  it('дешёвая покупка — 1, дорогая — 5, середина (геометрически) — 3', () => {
    const pool = [30000, 45000];
    expect(moneyCoefficient(30000, pool)).toBeCloseTo(1, 5);
    expect(moneyCoefficient(45000, pool)).toBeCloseTo(5, 5);
    const mid = Math.sqrt(30000 * 45000);
    expect(moneyCoefficient(mid, pool)).toBeCloseTo(3, 3);
  });

  it('шкала логарифмическая: удвоение цены даёт одинаковый сдвиг на любом участке', () => {
    const pool = [5000, 10000, 20000, 40000, 80000];
    const low = moneyCoefficient(10000, pool)!;
    const mid = moneyCoefficient(20000, pool)!;
    expect(low).toBeGreaterThan(1);
    expect(mid - low).toBeGreaterThan(0);
  });

  it('без других покупок или при равных ценах коэффициент нейтральный', () => {
    expect(moneyCoefficient(45000, [])).toBe(3);
    expect(moneyCoefficient(45000, [45000])).toBe(3);
    expect(moneyCoefficient(45000, [45000, 45000])).toBe(3);
  });

  it('цены вне пула зажимаются в 1..5, мусор даёт null', () => {
    const pool = [30000, 45000];
    expect(moneyCoefficient(100, pool)).toBe(1);
    expect(moneyCoefficient(9000000, pool)).toBe(5);
    expect(moneyCoefficient(null, pool)).toBeNull();
    expect(moneyCoefficient(undefined, pool)).toBeNull();
    expect(moneyCoefficient(0, pool)).toBeNull();
    expect(moneyCoefficient(-5, pool)).toBeNull();
  });
});

describe('effortOf', () => {
  it('среднее денежного коэффициента и сложности; деньги могут быть дробными', () => {
    expect(effortOf(4, 4)).toBe(4);
    expect(effortOf(2.4, 5)).toBe(3.7);
    expect(effortOf(1, 1)).toBe(1);
  });

  it('сложность держит границы шкалы через clamp', () => {
    expect(effortOf(1, 99)).toBe(3);
  });
});

describe('scoreOf', () => {
  it('считает (R × I × C) / Effort с денежным коэффициентом из пула цен', () => {
    const washer = item({ reach: 5, impact: 5, confidence: 5, complexity: 2, price: 45000 });
    expect(scoreOf(washer, [30000, 45000])).toBeCloseTo(125 / 3.5, 5);

    const cheap = item({ reach: 3, impact: 3, confidence: 2, complexity: 5, price: 30000 });
    expect(scoreOf(cheap, [30000, 45000])).toBeCloseTo(18 / 3, 5);

    const minimum = item({ reach: 1, impact: 1, confidence: 1, complexity: 5, price: 30000 });
    expect(scoreOf(minimum, [30000, 45000])).toBeCloseTo(1 / 3, 5);

    const maximum = item({ reach: 5, impact: 5, confidence: 5, complexity: 1, price: 45000 });
    expect(scoreOf(maximum, [30000, 45000])).toBe(125 / 3);
  });

  it('возвращает null, пока не готовы четыре оценки и сумма', () => {
    const pool = [30000, 45000];
    expect(scoreOf(item(), pool)).toBeNull();
    expect(
      scoreOf(item({ reach: undefined, impact: undefined, confidence: undefined }), pool),
    ).toBeNull();
    expect(
      scoreOf(
        item({ reach: undefined, impact: undefined, confidence: undefined, complexity: undefined, price: 45000 }),
        pool,
      ),
    ).toBeNull();
    expect(
      scoreOf(item({ reach: 4, impact: 4, confidence: 4, complexity: undefined, price: 45000 }), pool),
    ).toBeNull();
    expect(scoreOf(item({ reach: 4, impact: 4, confidence: 4, complexity: 2 }), pool)).toBeNull();
  });
});

describe('isRated', () => {
  it('true только когда четыре оценки и положительная сумма на месте', () => {
    expect(isRated(item({ price: 12000 }))).toBe(true);
    expect(isRated(item())).toBe(false);
    expect(isRated(item({ reach: undefined }))).toBe(false);
    expect(isRated(item({ impact: null }))).toBe(false);
    expect(isRated(item({ price: 0 }))).toBe(false);
    expect(isRated(item({ price: -3 }))).toBe(false);
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

  it('без оценки прочерк', () => {
    expect(formatScore(null)).toBe('—');
  });
});

describe('sortActive', () => {
  it('сортирует по баллу по убыванию, при равенстве — по id', () => {
    const pool = [30000, 45000, 45000];
    const low = item({ id: 1, title: 'Подушки', reach: 1, impact: 1, confidence: 1, complexity: 5, price: 30000 }); // 1/3 ≈ 0.33
    const oldHigh = item({ id: 2, title: 'Старая стиралка', reach: 5, impact: 5, confidence: 5, complexity: 2, price: 45000 }); // 125/3.5
    const newHigh = item({ id: 3, title: 'Новая стиралка', reach: 5, impact: 5, confidence: 5, complexity: 2, price: 45000 });
    const sorted = sortActive([low, newHigh, oldHigh], pool);
    expect(sorted.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('не мутирует исходный массив', () => {
    const a = item({ id: 1, price: 30000 });
    const b = item({ id: 2, confidence: 5, price: 45000 });
    const original = [a, b];
    sortActive(original, [30000, 45000]);
    expect(original.map((r) => r.id)).toEqual([1, 2]);
  });

  it('неоценённые всегда ниже оценённых и не ломают сортировку', () => {
    const rated = item({ id: 1, confidence: 1, price: 30000 }); // 3/3 = 1
    const unrated = item({ id: 2, title: 'Идея', reach: undefined });
    const sorted = sortActive([unrated, rated], [30000]);
    expect(sorted.map((r) => r.id)).toEqual([1, 2]);
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
