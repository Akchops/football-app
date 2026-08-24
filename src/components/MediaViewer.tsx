import { useEffect, useState, type ReactNode } from 'react';
import { formatBytes, formatDuration, getMediaBlob, type MediaMeta } from '../store/media';

/** Full-screen playback for one photo or clip. */
export function MediaViewer({
  item,
  onClose,
  subtitle,
  actions,
}: {
  item: MediaMeta | null;
  onClose: () => void;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const [url, setUrl] = useState<string | null>(null);

  // Object URLs exist only while a clip is open, and are revoked on close.
  useEffect(() => {
    if (!item) {
      setUrl(null);
      return;
    }
    let created: string | null = null;
    let cancelled = false;
    void getMediaBlob(item.id).then((blob) => {
      if (!blob || cancelled) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div className="viewer" onClick={onClose}>
      <div className="viewer-inner" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-head">
          <span>{item.name}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {!url ? (
          <p className="muted small">Loading…</p>
        ) : item.kind === 'video' ? (
          <video src={url} controls autoPlay playsInline className="viewer-media" />
        ) : (
          <img src={url} alt={item.name} className="viewer-media" />
        )}

        <p className="muted small">
          {subtitle ? `${subtitle} · ` : ''}
          {formatBytes(item.size)}
          {item.duration ? ` · ${formatDuration(item.duration)}` : ''}
        </p>

        {actions && <div className="viewer-actions">{actions}</div>}
      </div>
    </div>
  );
}

/** One thumbnail in a media grid. */
export function MediaTile({
  item,
  onOpen,
  onDelete,
  caption,
}: {
  item: MediaMeta;
  onOpen: () => void;
  onDelete?: () => void;
  caption?: string;
}) {
  return (
    <div className="media-tile">
      <button className="media-open" onClick={onOpen}>
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={item.name} />
        ) : (
          <span className="media-fallback">{item.kind === 'video' ? '🎬' : '🖼'}</span>
        )}
        {item.kind === 'video' && (
          <span className="media-play" aria-hidden="true">
            ▶
          </span>
        )}
        {item.duration ? <span className="media-duration">{formatDuration(item.duration)}</span> : null}
        {caption && <span className="media-caption">{caption}</span>}
      </button>
      {onDelete && (
        <button className="media-delete" onClick={onDelete} aria-label={`Delete ${item.name}`}>
          ✕
        </button>
      )}
    </div>
  );
}
