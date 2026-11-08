import { DEFAULT_APPEARANCE, type AppearanceColors } from '@perepelkin-home/core';

/** Готовые палитры: подменяют только цвета, шрифты и прочее остаются как есть. */
export interface AppearancePreset {
  id: string;
  name: string;
  colors: AppearanceColors;
}

export const APPEARANCE_PRESETS: AppearancePreset[] = [
  {
    // Стандартная палитра: цвета берём из дефолта ядра, чтобы при его смене
    // пресет не разъезжался и продолжал подсвечиваться как активный.
    id: 'olive',
    name: 'Оливковая',
    colors: DEFAULT_APPEARANCE.colors,
  },
  {
    id: 'terracotta',
    name: 'Терракота',
    colors: {
      bg: '#f6ede5',
      bgGlow: '#fcf4ea',
      bgWarm: '#f9f0e7',
      surface: '#fffbf5',
      line: '#ecdfd2',
      lineStrong: '#ddcabb',
      ink: '#33281e',
      inkSoft: '#7c6c5d',
      inkMuted: '#9b8a7b',
      accent: '#b4633c',
      accentHover: '#9a5029',
      accentSoft: '#f6e3d7',
      onAccent: '#fff9f3',
      errorText: '#8f2f1d',
      errorBg: '#f9e5df',
      errorLine: '#e8c6bc',
    },
  },
  {
    id: 'graphite',
    name: 'Графит',
    colors: {
      bg: '#f0f0ee',
      bgGlow: '#f7f7f5',
      bgWarm: '#f5f5f3',
      surface: '#fcfcfb',
      line: '#e0e0dc',
      lineStrong: '#cfcec9',
      ink: '#26292c',
      inkSoft: '#5f666a',
      inkMuted: '#83898d',
      accent: '#536a70',
      accentHover: '#42555b',
      accentSoft: '#e0eaeb',
      onAccent: '#f6fafb',
      errorText: '#93342d',
      errorBg: '#f9e7e5',
      errorLine: '#e9cac6',
    },
  },
  {
    id: 'mist',
    name: 'Туманная',
    colors: {
      bg: '#eef1f4',
      bgGlow: '#f6f9fb',
      bgWarm: '#f1f4f6',
      surface: '#fbfcfd',
      line: '#dce1e6',
      lineStrong: '#c9d1da',
      ink: '#22282e',
      inkSoft: '#5c666e',
      inkMuted: '#808a93',
      accent: '#3f6a8b',
      accentHover: '#335874',
      accentSoft: '#e0eaf1',
      onAccent: '#f7fafc',
      errorText: '#99302b',
      errorBg: '#f8e5e4',
      errorLine: '#e8c8c5',
    },
  },
  {
    id: 'plum',
    name: 'Сливовая',
    colors: {
      bg: '#f3eff2',
      bgGlow: '#f9f4f7',
      bgWarm: '#f7f1f4',
      surface: '#fdfafc',
      line: '#e5dce1',
      lineStrong: '#d2c6cd',
      ink: '#2b2530',
      inkSoft: '#675f6e',
      inkMuted: '#877e91',
      accent: '#83586f',
      accentHover: '#6b4759',
      accentSoft: '#ecdfe6',
      onAccent: '#fbf8fa',
      errorText: '#933344',
      errorBg: '#f8e4e8',
      errorLine: '#e6c5cc',
    },
  },
  {
    id: 'pine',
    name: 'Хвойная',
    colors: {
      bg: '#edf0e9',
      bgGlow: '#f4f7f0',
      bgWarm: '#f1f4ed',
      surface: '#fafbf8',
      line: '#dcdfd4',
      lineStrong: '#c5c9b8',
      ink: '#24291f',
      inkSoft: '#5c6357',
      inkMuted: '#7d8376',
      accent: '#4a6d4f',
      accentHover: '#3a5940',
      accentSoft: '#dfebdd',
      onAccent: '#f6fbf4',
      errorText: '#9c4527',
      errorBg: '#f9e7e0',
      errorLine: '#e9cbc2',
    },
  },
];

export interface AppearanceColorField {
  key: keyof AppearanceColors;
  label: string;
}

export const APPEARANCE_COLOR_GROUPS: { title: string; fields: AppearanceColorField[] }[] = [
  {
    title: 'Фон и поверхности',
    fields: [
      { key: 'bg', label: 'Фон страницы' },
      { key: 'bgGlow', label: 'Свет у верхнего края' },
      { key: 'bgWarm', label: 'Тонированный фон' },
      { key: 'surface', label: 'Поверхности (карточки)' },
      { key: 'line', label: 'Разделители' },
      { key: 'lineStrong', label: 'Жирные разделители' },
    ],
  },
  {
    title: 'Текст',
    fields: [
      { key: 'ink', label: 'Основной текст' },
      { key: 'inkSoft', label: 'Вторичный текст' },
      { key: 'inkMuted', label: 'Приглушённый текст' },
    ],
  },
  {
    title: 'Акцент',
    fields: [
      { key: 'accent', label: 'Акцент' },
      { key: 'accentHover', label: 'Акцент при наведении' },
      { key: 'accentSoft', label: 'Мягкий акцент (фон чипов)' },
      { key: 'onAccent', label: 'Текст на акценте' },
    ],
  },
  {
    title: 'Ошибки',
    fields: [
      { key: 'errorText', label: 'Текст ошибок' },
      { key: 'errorBg', label: 'Фон ошибок' },
      { key: 'errorLine', label: 'Обводка ошибок' },
    ],
  },
];

export const RADIUS_OPTIONS: { value: 'sharp' | 'soft' | 'round'; label: string }[] = [
  { value: 'sharp', label: 'Фактурные' },
  { value: 'soft', label: 'Как сейчас' },
  { value: 'round', label: 'Округлые' },
];

export const MOTION_OPTIONS: { value: 'normal' | 'minimal'; label: string }[] = [
  { value: 'normal', label: 'Обычные' },
  { value: 'minimal', label: 'Минимальные' },
];
