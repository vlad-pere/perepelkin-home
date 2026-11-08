/**
 * Контракт «Оформления»: общие для сервера и фронтенда типы, значения по умолчанию
 * и каталог шрифтов. Тема одна на всю установку, меняет администратор.
 */

/** Цветовые токены интерфейса. Все значения — HEX `#rrggbb`. */
export interface AppearanceColors {
  /** Основной фон страницы */
  bg: string;
  /** Верхушка фонового градиента */
  bgGlow: string;
  /** Тонированный фон (карточки на главной, вторичные поверхности) */
  bgWarm: string;
  /** Поверхности: карточки, поля, панели */
  surface: string;
  /** Цвет полос-разделителей */
  line: string;
  /** Более заметные разделители */
  lineStrong: string;
  /** Основной текст */
  ink: string;
  /** Вторичный текст */
  inkSoft: string;
  /** Приглушённый текст, подпись */
  inkMuted: string;
  /** Акцент: кнопки, ссылки, выделения */
  accent: string;
  /** Акцент при наведении/нажатии */
  accentHover: string;
  /** Мягкий фоновый оттенок акцента (чипы, активные состояния) */
  accentSoft: string;
  /** Текст/иконки на акцентном фоне */
  onAccent: string;
  errorText: string;
  errorBg: string;
  errorLine: string;
}

export type RadiusPreset = 'sharp' | 'soft' | 'round';
export type MotionPreset = 'normal' | 'minimal';

export interface AppearanceState {
  colors: AppearanceColors;
  fonts: { display: string; body: string };
  radius: RadiusPreset;
  motion: MotionPreset;
}

/** Каталог шрифтов: то, что реально установлено в приложении (npm @fontsource). */
export interface AppearanceFontOption {
  id: string;
  label: string;
  /** CSS-стек с системными фолбэками — попадает прямо в --font-display/--font-body. */
  family: string;
  /** Веса, которые есть у пакета @fontsource и грузятся на клиенте. */
  weights: number[];
}

export const APPEARANCE_FONT_DISPLAY: AppearanceFontOption[] = [
  { id: 'spectral', label: 'Spectral', family: "'Spectral', Georgia, serif", weights: [500, 600] },
  {
    id: 'playfair-display',
    label: 'Playfair Display',
    family: "'Playfair Display', Georgia, serif",
    weights: [500, 600],
  },
  { id: 'lora', label: 'Lora', family: "'Lora', Georgia, serif", weights: [500, 600] },
  { id: 'pt-serif', label: 'PT Serif', family: "'PT Serif', Georgia, serif", weights: [400, 700] },
];

export const APPEARANCE_FONT_BODY: AppearanceFontOption[] = [
  {
    id: 'manrope',
    label: 'Manrope',
    family: "'Manrope', 'Avenir Next', 'Segoe UI', sans-serif",
    weights: [400, 500, 600],
  },
  { id: 'rubik', label: 'Rubik', family: "'Rubik', 'Segoe UI', sans-serif", weights: [400, 500, 600] },
  {
    id: 'source-sans-3',
    label: 'Source Sans 3',
    family: "'Source Sans 3', 'Segoe UI', sans-serif",
    weights: [400, 500, 600],
  },
  { id: 'pt-sans', label: 'PT Sans', family: "'PT Sans', 'Segoe UI', sans-serif", weights: [400, 700] },
];

const DISPLAY_IDS = APPEARANCE_FONT_DISPLAY.map((f) => f.id);
const BODY_IDS = APPEARANCE_FONT_BODY.map((f) => f.id);

export const DEFAULT_APPEARANCE: AppearanceState = {
  colors: {
    bg: '#f4efe4',
    bgGlow: '#fbf6ea',
    bgWarm: '#f9f5eb',
    surface: '#fffbf3',
    line: '#e4ddcc',
    lineStrong: '#d3cab4',
    ink: '#2d2a24',
    inkSoft: '#6e6a5e',
    inkMuted: '#8c867a',
    accent: '#667853',
    accentHover: '#526440',
    accentSoft: '#e5ecdb',
    onAccent: '#fbfcf6',
    errorText: '#9c4527',
    errorBg: '#fbeae1',
    errorLine: '#ebc9b8',
  },
  fonts: { display: 'spectral', body: 'manrope' },
  radius: 'soft',
  motion: 'normal',
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

const TOP_LEVEL_KEYS = ['colors', 'fonts', 'radius', 'motion'];
const FONT_KEYS = ['display', 'body'];

function rejectUnknownKeys(
  raw: Record<string, unknown>,
  allowed: readonly string[],
  scope: string,
): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      throw new Error(`Оформление: неизвестное поле «${key}» (${scope})`);
    }
  }
}

/**
 * Строгая проверка на границе API: сервер и редактор работают только с этим свойством.
 * Неизвестные поля — ошибка клиента (см. removeAdditional: false в app.ts), а не
 * данные «на выброс»; опечатка вроде `accentt` не должна молча теряться.
 */
export function validateAppearance(value: unknown): AppearanceState {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Оформление: ожидается объект');
  }
  const raw = value as Record<string, unknown>;
  rejectUnknownKeys(raw, TOP_LEVEL_KEYS, 'верхний уровень');
  if (typeof raw.colors !== 'object' || raw.colors === null) {
    throw new Error('Оформление: обязательны цвета');
  }
  const colorsRaw = raw.colors as Record<string, unknown>;
  rejectUnknownKeys(
    colorsRaw,
    Object.keys(DEFAULT_APPEARANCE.colors),
    'цвета',
  );
  const colors = {} as AppearanceColors;
  for (const key of Object.keys(DEFAULT_APPEARANCE.colors) as (keyof AppearanceColors)[]) {
    if (!isHex(colorsRaw[key])) throw new Error(`Оформление: некорректный цвет «${key}»`);
    colors[key] = (colorsRaw[key] as string).toLowerCase();
  }
  const fontsRaw = raw.fonts;
  if (typeof fontsRaw !== 'object' || fontsRaw === null) {
    throw new Error('Оформление: обязательны шрифты');
  }
  rejectUnknownKeys(fontsRaw as Record<string, unknown>, FONT_KEYS, 'шрифты');
  const fonts = fontsRaw as { display?: unknown; body?: unknown };
  if (typeof fonts.display !== 'string' || !DISPLAY_IDS.includes(fonts.display)) {
    throw new Error('Оформление: неизвестный шрифт заголовков');
  }
  if (typeof fonts.body !== 'string' || !BODY_IDS.includes(fonts.body)) {
    throw new Error('Оформление: неизвестный шрифт текста');
  }
  if (raw.radius !== 'sharp' && raw.radius !== 'soft' && raw.radius !== 'round') {
    throw new Error('Оформление: некорректный вариант скруглений');
  }
  if (raw.motion !== 'normal' && raw.motion !== 'minimal') {
    throw new Error('Оформление: некорректный вариант анимаций');
  }
  return { colors, fonts: { display: fonts.display, body: fonts.body }, radius: raw.radius, motion: raw.motion };
}

/** Разбирает сохранённое на сервере значение; при любых повреждениях — тема по умолчанию. */
export function parseAppearance(value: string | null | undefined): AppearanceState | null {
  if (!value) return null;
  try {
    return validateAppearance(JSON.parse(value));
  } catch {
    return null;
  }
}
