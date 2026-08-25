export type Rating = 1 | 2 | 3 | 4 | 5;

export const STATUS_WANT = 1;
export const STATUS_PLANNED = 2;
export const STATUS_BOUGHT = 3;

export type StatusValue = typeof STATUS_WANT | typeof STATUS_PLANNED | typeof STATUS_BOUGHT;

export const STATUS_LABELS: Record<number, string> = {
  [STATUS_WANT]: 'Хочу',
  [STATUS_PLANNED]: 'В планах',
  [STATUS_BOUGHT]: 'Куплено',
};

/** Оцениваемые вручную параметры покупки: подписи в интерфейсе и короткие пояснения шкалы. */
export const RATING_PARAMS = [
  { name: 'reach', label: 'Охват', hint: 'кто и как часто этим пользуется' },
  { name: 'impact', label: 'Польза', hint: 'насколько улучшит быт и комфорт' },
  { name: 'confidence', label: 'Уверенность', hint: 'точно ли нужна, не будет пылиться' },
  { name: 'complexity', label: 'Сложность', hint: 'установка, время, место хранения' },
] as const;

export type RatingFieldName = (typeof RATING_PARAMS)[number]['name'];

export interface RiceItem {
  id: number;
  title: string;
  status: number;
  reach?: number | null;
  impact?: number | null;
  confidence?: number | null;
  complexity?: number | null;
  price: number | null;
  link: string | null;
  comment: string | null;
  created_by_username: string | null;
  created_at: string;
  updated_at: string;
}

type Ratings = Pick<RiceItem, RatingFieldName>;

/** Приводит любое значение к оценке 1..5; мусор превращается в нейтральную тройку. */
export function clampRating(value: unknown): Rating {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(value))) as Rating;
}

function isValidPrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}

/**
 * Денежный коэффициент из суммы: логарифмическая шкала между самой дешёвой
 * и самой дорогой покупкой пула (цены бытовой техники различаются на порядки,
 * поэтому лог сглаживает выбросы). Нет пула или все цены равны — нейтральная тройка.
 */
export function moneyCoefficient(price: unknown, pool: readonly unknown[]): number | null {
  if (!isValidPrice(price)) return null;
  const prices = pool.filter(isValidPrice);
  if (prices.length === 0) return 3;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (!(max > min)) return 3;
  const t = Math.log(price / min) / Math.log(max / min);
  return Math.min(5, Math.max(1, 1 + 4 * t));
}

/** Идея готова к ранжированию, когда выставлены четыре оценки и указана сумма. */
export function isRated(item: { price?: unknown } & { [K in RatingFieldName]?: unknown }): boolean {
  const manual = RATING_PARAMS.every((p) => {
    const v = item[p.name];
    return typeof v === 'number' && Number.isFinite(v);
  });
  return manual && isValidPrice(item.price);
}

/** Усилие (знаменатель формулы): среднее денег и сложности, от 1 до 5 с шагом 0.5. */
export function effortOf(money: number, complexity: unknown): number {
  return (money + clampRating(complexity)) / 2;
}

/**
 * Priority Score = (Reach × Impact × Confidence) / Effort.
 * Деньги — коэффициент moneyCoefficient из пула цен; сложность — ручная оценка.
 * Пока не готовы четыре оценки и сумма — null: идея живёт в бэклоге без балла.
 */
export function scoreOf(item: Ratings & Pick<RiceItem, 'price'>, pricePool: readonly unknown[]): number | null {
  const money = moneyCoefficient(item.price, pricePool);
  if (money === null) return null;
  if (
    RATING_PARAMS.some((p) => {
      const v = item[p.name];
      return typeof v !== 'number' || !Number.isFinite(v);
    })
  ) {
    return null;
  }
  const reach = clampRating(item.reach);
  const impact = clampRating(item.impact);
  const confidence = clampRating(item.confidence);
  const effort = effortOf(money, item.complexity);
  return (reach * impact * confidence) / effort;
}

/** Целый балл — без дробной части, иначе один знак после запятой; без оценки — прочерк. */
export function formatScore(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return '—';
  if (Number.isInteger(score)) return String(score);
  return String(Math.round(score * 10) / 10);
}

/** Активные покупки: по баллу по убыванию, при равенстве — старые записи раньше; неоценённые внизу. */
export function sortActive<T extends RiceItem>(items: readonly T[], pricePool: readonly unknown[]): T[] {
  return [...items].sort((a, b) => {
    const sa = scoreOf(a, pricePool);
    const sb = scoreOf(b, pricePool);
    if (sa === null && sb === null) return a.id - b.id;
    if (sa === null) return 1;
    if (sb === null) return -1;
    const diff = sb - sa;
    if (diff !== 0) return diff;
    return a.id - b.id;
  });
}

/** Архив: недавно купленные сверху. */
export function sortBought<T extends RiceItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const diff = String(b.updated_at).localeCompare(String(a.updated_at));
    if (diff !== 0) return diff;
    return b.id - a.id;
  });
}
