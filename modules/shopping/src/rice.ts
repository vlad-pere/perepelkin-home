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

/** Оцениваемые параметры покупки: подписи в интерфейсе и короткие пояснения шкалы. */
export const RATING_PARAMS = [
  { name: 'reach', label: 'Охват', hint: 'кто и как часто этим пользуется' },
  { name: 'impact', label: 'Польза', hint: 'насколько улучшит быт и комфорт' },
  { name: 'confidence', label: 'Уверенность', hint: 'точно ли нужна, не будет пылиться' },
  { name: 'cost', label: 'Деньги', hint: 'чем дороже, тем больше цифра' },
  { name: 'complexity', label: 'Сложность', hint: 'установка, время, место хранения' },
] as const;

export type RatingFieldName = (typeof RATING_PARAMS)[number]['name'];

export interface RiceItem {
  id: number;
  title: string;
  status: number;
  reach: number;
  impact: number;
  confidence: number;
  cost: number;
  complexity: number;
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

/** Усилие (знаменатель формулы): среднее денег и сложности, от 1 до 5 с шагом 0.5. */
export function effortOf(cost: unknown, complexity: unknown): number {
  return (clampRating(cost) + clampRating(complexity)) / 2;
}

/** Priority Score = (Reach × Impact × Confidence) / Effort, максимум 125, минимум 0.2. */
export function scoreOf(ratings: Ratings): number {
  const reach = clampRating(ratings.reach);
  const impact = clampRating(ratings.impact);
  const confidence = clampRating(ratings.confidence);
  const effort = effortOf(ratings.cost, ratings.complexity);
  return (reach * impact * confidence) / effort;
}

/** Целый балл — без дробной части, иначе один знак после запятой. */
export function formatScore(score: number): string {
  if (!Number.isFinite(score)) return '—';
  if (Number.isInteger(score)) return String(score);
  return String(Math.round(score * 10) / 10);
}

/** Активные покупки: по баллу по убыванию, при равенстве — старые записи раньше. */
export function sortActive<T extends RiceItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const diff = scoreOf(b) - scoreOf(a);
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
