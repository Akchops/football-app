import { useEffect, useRef, useState } from 'react';
import {
  addMedia, deleteMedia, formatBytes, formatDuration, getMediaBlob, listMedia, type MediaMeta,
} from '../store/media';

/**
 * Videos and photos for one match. Files live in IndexedDB on the device -
 * a phone clip is far too big for localStorage, and nothing is uploaded.
 */
export function MediaGallery({ matchId }: { matchId: string }) {
  const [items, setItems] = useState<MediaMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<MediaMeta | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    listMedia(matchId)
      .then(setItems)
      .catch(() => setError('Could not read saved media on this device.'));
  };

  useEffect(refresh, [matchId]);

  // Object URLs are created only while a clip is open, and revoked on close.
  useEffect(() => {
    if (!viewing) {
      setViewUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    getMediaBlob(viewing.id).then((blob) => {
      if (!blob || cancelled) return;
      url = URL.createObjectURL(blob);
      setViewUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [viewing]);

  const onFiles = async (files: FileList) => {
    setBusy(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        await addMedia(matchId, file);
      }
      refresh();
    } catch {
      setError("Couldn't save that file — the device may be out of space.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: MediaMeta) => {
    if (!confirm(`Delete "${item.name}"? This can't be undone.`)) return;
    await deleteMedia(item.id);
    if (viewing?.id === item.id) setViewing(null);
    refresh();
  };

  const videoCount = items.filter((i) => i.kind === 'video').length;

  return (
    <div className="media-block">
      <div className="section-head">
        <h3>Video & photos</h3>
        <button className="ghost-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Saving…' : '+ Add'}
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="video/*,image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void onFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {error && <p className="form-error">{error}</p>}

      {items.length === 0 ? (
        <p className="muted small">
          Add clips of your game — saves, goals, big moments. Everything stays on this device.
        </p>
      ) : (
        <>
          <div className="media-grid">
            {items.map((item) => (
              <div key={item.id} className="media-tile">
                <button className="media-open" onClick={() => setViewing(item)}>
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
                </button>
                <button className="media-delete" onClick={() => remove(item)} aria-label={`Delete ${item.name}`}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <p className="muted small">
            {items.length} file{items.length === 1 ? '' : 's'} ·{' '}
            {formatBytes(items.reduce((sum, i) => sum + i.size, 0))} on this device
          </p>
        </>
      )}

      {videoCount > 0 && (
        <div className="ai-slot">
          <div className="ai-slot-head">
            <span className="ai-badge">Coming soon</span>
            <strong>AI clip analysis</strong>
          </div>
          <p>
            {videoCount} clip{videoCount === 1 ? '' : 's'} ready. Automatic feedback on positioning, handling and
            distribution isn't switched on yet — it needs a server to do the video processing, so it's the next
            thing to build rather than something running on the phone.
          </p>
        </div>
      )}

      {viewing && (
        <div className="viewer" onClick={() => setViewing(null)}>
          <div className="viewer-inner" onClick={(e) => e.stopPropagation()}>
            <div className="viewer-head">
              <span>{viewing.name}</span>
              <button className="icon-btn" onClick={() => setViewing(null)} aria-label="Close">
                ✕
              </button>
            </div>
            {!viewUrl ? (
              <p className="muted small">Loading…</p>
            ) : viewing.kind === 'video' ? (
              <video src={viewUrl} controls autoPlay playsInline className="viewer-media" />
            ) : (
              <img src={viewUrl} alt={viewing.name} className="viewer-media" />
            )}
            <p className="muted small">
              {formatBytes(viewing.size)}
              {viewing.duration ? ` · ${formatDuration(viewing.duration)}` : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
