import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import './ui.css';

export interface ApiClient {
  <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export interface MoveProps {
  moduleId: string;
  api: ApiClient;
  canWrite: boolean;
  public?: boolean;
}

interface PageRow {
  id: number;
  title: string;
  location: string | null;
  video_id: string | null;
}

interface ManifestInfo {
  name: string;
  description: string;
}

export function Move({ moduleId, api, canWrite, public: isPublic }: MoveProps) {
  const base = `/api/modules/${moduleId}`;
  const pageBase = `${base}/page`;
  const filesBase = `${base}/files`;

  const [page, setPage] = useState<PageRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPage = useCallback(async (): Promise<void> => {
    try {
      const res = await api<{ items: PageRow[] }>(pageBase);
      setPage(res.items[0] ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить страницу');
    } finally {
      setLoading(false);
    }
  }, [api, pageBase]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const videoUrl = page?.video_id ? `${filesBase}/${page.video_id}` : null;

  if (loading) {
    return (
      <main className="move">
        <p className="move-hint">Загружаем…</p>
      </main>
    );
  }

  if (error !== null && page === null) {
    return (
      <main className="move">
        <p className="auth-error" role="alert">{error}</p>
      </main>
    );
  }

  if (isPublic) {
    return (
      <MovePublic
        title={page?.title ?? 'Мы переехали'}
        location={page?.location ?? null}
        videoUrl={videoUrl}
      />
    );
  }

  return (
    <MoveAdmin
      page={page}
      pageBase={pageBase}
      filesBase={filesBase}
      api={api}
      canWrite={canWrite}
      error={error}
      onSaved={() => void loadPage()}
      onError={setError}
    />
  );
}

/* ---------- Публичная страница ---------- */

function VideoPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onPlay = (): void => {
      v.muted = false;
      setMuted(false);
    };
    v.addEventListener('play', onPlay, { once: true });
    return () => v.removeEventListener('play', onPlay);
  }, []);

  return (
    <div className="move-video-wrap">
      <video
        ref={ref}
        className="move-video"
        src={src}
        autoPlay
        muted={muted}
        loop
        playsInline
      />
      <button
        className="move-sound-btn"
        type="button"
        aria-label={muted ? 'Включить звук' : 'Выключить звук'}
        onClick={() => {
          const v = ref.current;
          if (!v) return;
          v.muted = !muted;
          setMuted((m) => !m);
        }}
      >
        {muted ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </button>
    </div>
  );
}

function MovePublic({
  title,
  location,
  videoUrl,
}: {
  title: string;
  location: string | null;
  videoUrl: string | null;
}) {
  return (
    <main className="move move-public">
      <header className="move-public-head">
        <span className="move-eyebrow">Дом Перепелкиных</span>
        <h1 className="move-title">{title}</h1>
      </header>

      {videoUrl !== null && <VideoPlayer src={videoUrl} />}

      {location !== null && location !== '' && (
        <p className="move-location">{location}</p>
      )}

      <footer className="move-foot">С любовью, семья Перепелкиных</footer>
    </main>
  );
}

/* ---------- Админ-панель ---------- */

function MoveAdmin({
  page,
  pageBase,
  filesBase,
  api,
  canWrite,
  error,
  onSaved,
  onError,
}: {
  page: PageRow | null;
  pageBase: string;
  filesBase: string;
  api: ApiClient;
  canWrite: boolean;
  error: string | null;
  onSaved: () => void;
  onError: (err: string | null) => void;
}) {
  const [title, setTitle] = useState(page?.title ?? 'Мы переехали');
  const [location, setLocation] = useState(page?.location ?? '');
  const [videoId, setVideoId] = useState<string | null>(page?.video_id ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const videoUrl = videoId !== null ? `${filesBase}/${videoId}` : null;

  const onUpload = useCallback(
    async (file: File): Promise<void> => {
      setUploading(true);
      onError(null);
      try {
        const res = await api<{ file: { id: string } }>(
          `${filesBase}?name=${encodeURIComponent(file.name)}`,
          { method: 'POST', body: file },
        );
        setVideoId(res.file.id);
        setDirty(true);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Не удалось загрузить видео');
      } finally {
        setUploading(false);
      }
    },
    [api, filesBase, onError],
  );

  const onDeleteVideo = useCallback(async (): Promise<void> => {
    if (videoId === null) return;
    setUploading(true);
    onError(null);
    try {
      await api(`${filesBase}/${videoId}`, { method: 'DELETE' });
      setVideoId(null);
      setDirty(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Не удалось удалить видео');
    } finally {
      setUploading(false);
    }
  }, [api, filesBase, videoId, onError]);

  const onSave = useCallback(
    async (e: FormEvent): Promise<void> => {
      e.preventDefault();
      if (saving) return;
      setSaving(true);
      onError(null);
      try {
        const body = { title: title.trim(), location: location.trim(), video_id: videoId };
        if (page !== null) {
          await api(`${pageBase}/${page.id}`, { method: 'PATCH', body });
        } else {
          await api(pageBase, { method: 'POST', body });
        }
        setDirty(false);
        onSaved();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Не удалось сохранить');
      } finally {
        setSaving(false);
      }
    },
    [api, pageBase, page, title, location, videoId, saving, onSaved, onError],
  );

  return (
    <main className="move">
      <h1 className="move-admin-title">Переезд — настройки</h1>

      {error !== null && (
        <p className="auth-error" role="alert">{error}</p>
      )}

      <form className="move-form" onSubmit={(e) => void onSave(e)}>
        <label className="field">
          <span className="field-label">Заголовок</span>
          <input
            className="field-input"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Описание локации</span>
          <textarea
            className="field-input"
            rows={4}
            value={location}
            onChange={(e) => { setLocation(e.target.value); setDirty(true); }}
            placeholder="Где мы находимся"
          />
        </label>

        <div className="field">
          <span className="field-label">Видео</span>
          {videoUrl !== null && (
            <div className="move-admin-video">
              <video className="move-admin-video-player" src={videoUrl} controls muted />
              {canWrite && (
                <button
                  className="btn-ghost btn-danger"
                  type="button"
                  disabled={uploading}
                  onClick={() => void onDeleteVideo()}
                >
                  Удалить видео
                </button>
              )}
            </div>
          )}
          {canWrite && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="move-file-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onUpload(file);
                  e.target.value = '';
                }}
              />
              <button
                className="btn-primary"
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? 'Загружаем…' : videoId !== null ? 'Заменить видео' : 'Загрузить видео'}
              </button>
            </>
          )}
        </div>

        {canWrite && (
          <div className="move-form-actions">
            <button className="btn-primary" type="submit" disabled={saving || !dirty}>
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        )}
      </form>
    </main>
  );
}

export default Move;
