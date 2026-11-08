import { useCallback, useEffect, useState } from 'react';
import {
  APPEARANCE_FONT_BODY,
  APPEARANCE_FONT_DISPLAY,
  DEFAULT_APPEARANCE,
  type AppearanceColors,
  type AppearanceState,
} from '@perepelkin-home/core';
import { api } from '../../api';
import { applyAppearance, getAppearanceSnapshot, setAppearanceSnapshot } from '../../appearance';
import {
  APPEARANCE_COLOR_GROUPS,
  APPEARANCE_PRESETS,
  MOTION_OPTIONS,
  RADIUS_OPTIONS,
} from './palettes';

interface AppearanceResponse {
  appearance: AppearanceState;
  customized: boolean;
}

/** Редактор «Оформления»: живой предпросмотр, сохранение общается с /api/admin/appearance. */
export function AppearanceSection() {
  const [baseline, setBaseline] = useState<AppearanceState | null>(null);
  const [customized, setCustomized] = useState(false);
  const [draft, setDraft] = useState<AppearanceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<AppearanceResponse>('/api/admin/appearance')
      .then((data) => {
        if (cancelled) return;
        setBaseline(data.appearance);
        setDraft(data.appearance);
        setCustomized(data.customized);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Не удалось загрузить оформление');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Живой предпросмотр черновика — единственное место, где черновик применяется к документу.
  useEffect(() => {
    if (draft !== null) applyAppearance(draft);
  }, [draft]);

  // При уходе со страницы восстанавливаем сохранённую тему.
  useEffect(() => {
    return () => applyAppearance(getAppearanceSnapshot().state);
  }, []);

  const fail = (err: unknown, fallback: string): void => {
    setError(err instanceof Error ? err.message : fallback);
  };

  const update = useCallback((patch: Partial<AppearanceState>): void => {
    setDraft((prev) => (prev === null ? prev : { ...prev, ...patch }));
  }, []);

  const updateColors = useCallback((patch: Partial<AppearanceColors>): void => {
    setDraft((prev) => (prev === null ? prev : { ...prev, colors: { ...prev.colors, ...patch } }));
  }, []);

  const dirty =
    draft !== null && baseline !== null && JSON.stringify(draft) !== JSON.stringify(baseline);

  const save = async (payload: AppearanceState): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api<AppearanceResponse>('/api/admin/appearance', {
        method: 'PUT',
        body: payload,
      });
      setAppearanceSnapshot({ state: data.appearance, customized: data.customized });
      setBaseline(data.appearance);
      setDraft(data.appearance);
      setCustomized(data.customized);
    } catch (err) {
      fail(err, 'Не удалось сохранить оформление');
    } finally {
      setBusy(false);
    }
  };

  const cancel = (): void => {
    if (baseline === null) return;
    setDraft(baseline); // применение делает эффект предпросмотра по draft
  };

  const resetToDefault = (): void => {
    void save(DEFAULT_APPEARANCE);
  };

  if (error !== null && draft === null) {
    return (
      <p className="auth-error" role="alert">
        {error}
      </p>
    );
  }
  if (baseline === null || draft === null) {
    return <p className="hint">Загружаем…</p>;
  }

  const displayFont = APPEARANCE_FONT_DISPLAY.find((f) => f.id === draft.fonts.display);
  const bodyFont = APPEARANCE_FONT_BODY.find((f) => f.id === draft.fonts.body);

  return (
    <div className="appearance">
      {error !== null && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <fieldset className="appearance-group">
        <legend className="appearance-group-title">Готовые палитры</legend>
        <div className="appearance-presets">
          {APPEARANCE_PRESETS.map((preset) => {
            const active = JSON.stringify(draft.colors) === JSON.stringify(preset.colors);
            return (
              <button
                type="button"
                key={preset.id}
                className="appearance-preset"
                aria-pressed={active}
                onClick={() => updateColors(preset.colors)}
              >
                <span className="appearance-preset-swatches" aria-hidden="true">
                  <i style={{ background: preset.colors.bg }} />
                  <i style={{ background: preset.colors.accent }} />
                  <i style={{ background: preset.colors.ink }} />
                </span>
                {preset.name}
              </button>
            );
          })}
        </div>
        <p className="appearance-hint">Палитра меняет только цвета, шрифты не трогает.</p>
      </fieldset>

      {APPEARANCE_COLOR_GROUPS.map((group) => (
        <fieldset className="appearance-group" key={group.title}>
          <legend className="appearance-group-title">{group.title}</legend>
          <div className="appearance-colors">
            {group.fields.map((field) => (
              <label className="field appearance-color" key={field.key}>
                <span className="field-label">{field.label}</span>
                <input
                  type="color"
                  className="appearance-color-input"
                  value={draft.colors[field.key]}
                  onChange={(e) => updateColors({ [field.key]: e.target.value })}
                />
                <span className="appearance-color-hex">{draft.colors[field.key]}</span>
              </label>
            ))}
          </div>
          {group.fields.some(
            (field) => draft.colors[field.key] !== DEFAULT_APPEARANCE.colors[field.key],
          ) && (
            <button
              type="button"
              className="btn-ghost appearance-reset"
              onClick={() => updateColors(DEFAULT_APPEARANCE.colors)}
            >
              Сбросить цвета к стандартным
            </button>
          )}
        </fieldset>
      ))}

      <fieldset className="appearance-group">
        <legend className="appearance-group-title">Шрифты</legend>
        <div className="appearance-font-row">
          <span className="appearance-mini-title">Заголовки</span>
          <div className="appearance-chip-row">
            {APPEARANCE_FONT_DISPLAY.map((font) => (
              <button
                type="button"
                key={font.id}
                className="appearance-font-chip"
                aria-pressed={draft.fonts.display === font.id}
                onClick={() => update({ fonts: { ...draft.fonts, display: font.id } })}
              >
                <span className="appearance-font-sample" style={{ fontFamily: font.family }}>
                  Аа
                </span>
                {font.label}
              </button>
            ))}
          </div>
        </div>
        <div className="appearance-font-row">
          <span className="appearance-mini-title">Текст</span>
          <div className="appearance-chip-row">
            {APPEARANCE_FONT_BODY.map((font) => (
              <button
                type="button"
                key={font.id}
                className="appearance-font-chip"
                aria-pressed={draft.fonts.body === font.id}
                onClick={() => update({ fonts: { ...draft.fonts, body: font.id } })}
              >
                <span className="appearance-font-sample" style={{ fontFamily: font.family }}>
                  Аа
                </span>
                {font.label}
              </button>
            ))}
          </div>
        </div>
        <p className="appearance-hint">
          Интересующий вариант: заголовки — {displayFont?.label ?? '—'}, текст —{' '}
          {bodyFont?.label ?? '—'}
        </p>
      </fieldset>

      <div className="appearance-pairs">
        <fieldset className="appearance-group">
          <legend className="appearance-group-title">Скругления</legend>
          <div className="appearance-chip-row">
            {RADIUS_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                className="appearance-chip"
                data-radius={option.value}
                aria-pressed={draft.radius === option.value}
                onClick={() => update({ radius: option.value })}
              >
                <i className="appearance-radius-swatch" aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="appearance-group">
          <legend className="appearance-group-title">Анимации</legend>
          <div className="appearance-chip-row">
            {MOTION_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                className="appearance-chip"
                aria-pressed={draft.motion === option.value}
                onClick={() => update({ motion: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="appearance-hint">
            В режиме «Минимальные» анимации отключаются во всём доме — мигающая точка в примере ниже
            застынет.
          </p>
        </fieldset>
      </div>

      {/* Мини-макет карточки модуля: перекрашивается всеми токенами черновика вживую. */}
      <div className="appearance-preview" aria-hidden="true">
        <div className="appearance-preview-head">
          <span className="appearance-preview-name">Полить цветы</span>
          <span className="appearance-preview-badge">метка</span>
        </div>
        <p className="appearance-preview-text">
          Заголовок набран шрифтом заголовков, этот абзац — шрифтом текста. Кнопки, поля и метки во
          всех модулях красятся теми же цветами.
        </p>
        <div className="appearance-preview-row">
          <button type="button" className="btn-primary" tabIndex={-1}>
            Добавить
          </button>
          <button type="button" className="btn-ghost" tabIndex={-1}>
            Отменить
          </button>
          <span className="appearance-motion-dot" />
        </div>
        <input
          type="text"
          className="field-input appearance-preview-input"
          value="Например: полить монстеру"
          readOnly
          tabIndex={-1}
        />
        <ul className="appearance-preview-list">
          <li>
            <span className="appearance-preview-check" />
            Полить монстеру
          </li>
          <li className="is-done">
            <span className="appearance-preview-check" />
            Купить хлеб
          </li>
        </ul>
        <p className="auth-error appearance-demo-error">Сообщение об ошибке</p>
      </div>

      <div className="appearance-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={!dirty || busy}
          onClick={() => void save(draft)}
        >
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button type="button" className="btn-ghost" disabled={!dirty || busy} onClick={cancel}>
          Отменить
        </button>
        {customized && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={resetToDefault}>
            Вернуть стандартную
          </button>
        )}
      </div>
    </div>
  );
}
