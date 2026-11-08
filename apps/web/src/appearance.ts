/**
 * Рантайм оформления: применяет тему (цвета, шрифты, скругления, анимации) к документу.
 * Тема общая для всей установки, поэтому кэшируется и применяется до первого рендера,
 * чтобы страница не мигала дефолтными цветами при повторных заходах.
 */
import {
  APPEARANCE_FONT_BODY,
  APPEARANCE_FONT_DISPLAY,
  DEFAULT_APPEARANCE,
  validateAppearance,
  type AppearanceColors,
  type AppearanceState,
} from '@perepelkin-home/core';
import { api } from './api';

const CACHE_KEY = 'appearance.v1';

/** Ключ цвета → имя CSS-переменной. Должно совпадать с блоком :root в styles.css. */
const COLOR_VARS: Record<keyof AppearanceColors, string> = {
  bg: '--bg',
  bgGlow: '--bg-glow',
  bgWarm: '--bg-warm',
  surface: '--surface',
  line: '--line',
  lineStrong: '--line-strong',
  ink: '--ink',
  inkSoft: '--ink-soft',
  inkMuted: '--ink-muted',
  accent: '--accent',
  accentHover: '--accent-hover',
  accentSoft: '--accent-soft',
  onAccent: '--on-accent',
  errorText: '--error-text',
  errorBg: '--error-bg',
  errorLine: '--error-line',
};

/**
 * CSS-файлы каждого шрифта/веса (пакеты @fontsource, self-hosted). Ключ — `${id}:${weight}`.
 * Синхронизация: ключи должны покрывать ровно те id+weights, что перечислены в
 * `APPEARANCE_FONT_DISPLAY`/`APPEARANCE_FONT_BODY` (packages/core/src/appearance.ts);
 * статические импорты manrope/spectral в main.tsx — подмножество этих же весов.
 * Отклонение ловит dev-проверка ниже; в проде недостающий вес тихо падает в системный фолбэк.
 */
const FONT_FILES: Record<string, () => Promise<unknown>> = {
  'spectral:500': () => import('@fontsource/spectral/500.css'),
  'spectral:600': () => import('@fontsource/spectral/600.css'),
  'playfair-display:500': () => import('@fontsource/playfair-display/500.css'),
  'playfair-display:600': () => import('@fontsource/playfair-display/600.css'),
  'lora:500': () => import('@fontsource/lora/500.css'),
  'lora:600': () => import('@fontsource/lora/600.css'),
  'pt-serif:400': () => import('@fontsource/pt-serif/400.css'),
  'pt-serif:700': () => import('@fontsource/pt-serif/700.css'),
  'manrope:400': () => import('@fontsource/manrope/400.css'),
  'manrope:500': () => import('@fontsource/manrope/500.css'),
  'manrope:600': () => import('@fontsource/manrope/600.css'),
  'rubik:400': () => import('@fontsource/rubik/400.css'),
  'rubik:500': () => import('@fontsource/rubik/500.css'),
  'rubik:600': () => import('@fontsource/rubik/600.css'),
  'source-sans-3:400': () => import('@fontsource/source-sans-3/400.css'),
  'source-sans-3:500': () => import('@fontsource/source-sans-3/500.css'),
  'source-sans-3:600': () => import('@fontsource/source-sans-3/600.css'),
  'pt-sans:400': () => import('@fontsource/pt-sans/400.css'),
  'pt-sans:700': () => import('@fontsource/pt-sans/700.css'),
};

const loadedFonts = new Set<string>();

// Целостность ручной карты выше: в dev падаем сразу, в проде — деградируем в фолбэк.
if (import.meta.env.DEV) {
  const missing = [...APPEARANCE_FONT_DISPLAY, ...APPEARANCE_FONT_BODY]
    .flatMap((option) => option.weights.map((weight) => `${option.id}:${weight}`))
    .filter((key) => !(key in FONT_FILES));
  if (missing.length !== 0) {
    throw new Error(`FONT_FILES не покрывает веса каталога шрифтов: ${missing.join(', ')}`);
  }
}

function loadFonts(state: AppearanceState): void {
  const options = [...APPEARANCE_FONT_DISPLAY, ...APPEARANCE_FONT_BODY];
  for (const option of options) {
    if (option.id !== state.fonts.display && option.id !== state.fonts.body) continue;
    for (const weight of option.weights) {
      const key = `${option.id}:${weight}`;
      if (loadedFonts.has(key)) continue;
      const loader = FONT_FILES[key];
      if (loader === undefined) continue;
      loadedFonts.add(key);
      void loader().catch(() => loadedFonts.delete(key));
    }
  }
}

/** Применяет состояние к документу. Используется и для живого предпросмотра черновика. */
export function applyAppearance(state: AppearanceState): void {
  const html = document.documentElement;
  for (const [key, cssVar] of Object.entries(COLOR_VARS) as [keyof AppearanceColors, string][]) {
    html.style.setProperty(cssVar, state.colors[key]);
  }
  const display = APPEARANCE_FONT_DISPLAY.find((f) => f.id === state.fonts.display);
  const body = APPEARANCE_FONT_BODY.find((f) => f.id === state.fonts.body);
  if (display !== undefined) html.style.setProperty('--font-display', display.family);
  if (body !== undefined) html.style.setProperty('--font-body', body.family);
  html.dataset.radius = state.radius;
  html.dataset.motion = state.motion;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.colors.bg);
  loadFonts(state);
}

export interface AppearanceSnapshot {
  state: AppearanceState;
  customized: boolean;
}

/** Последнее сохранённое на сервере состояние (или дефолт во время загрузки). */
let persisted: AppearanceSnapshot = { state: DEFAULT_APPEARANCE, customized: false };

export function getAppearanceSnapshot(): AppearanceSnapshot {
  return persisted;
}

/**
 * Применяет сохранённую тему из localStorage до загрузки React
 * (вызывается из boot.ts до main.tsx), затем initAppearance сверяет с сервером.
 */
export function bootFromCache(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return;
    const state = validateAppearance(JSON.parse(raw));
    persisted = { state, customized: true };
    applyAppearance(state);
  } catch {
    // Битый кэш — используем дефолт, серверное значение загрузится следом.
  }
}

/** Загружает тему установки с сервера и применяет её. */
export async function initAppearance(): Promise<AppearanceSnapshot> {
  try {
    const data = await api<{ appearance: unknown; customized: boolean }>('/api/appearance');
    const state = validateAppearance(data.appearance);
    persisted = { state, customized: data.customized };
    applyAppearance(state);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(state));
    } catch {
      /* приватный режим — обходимся без кэша */
    }
  } catch {
    /* сервер недоступен: остаёмся на кэше или дефолте */
  }
  return persisted;
}

/** После сохранения на сервере — фиксирует новое состояние как «сохранённое». */
export function setAppearanceSnapshot(snapshot: AppearanceSnapshot): void {
  persisted = snapshot;
  applyAppearance(snapshot.state);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot.state));
  } catch {
    /* приватный режим */
  }
}
