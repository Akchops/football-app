import { useCallback, useEffect, useRef, useState } from 'react';
import { addMedia, deleteMedia, formatBytes, listMedia, type MediaMeta } from '../store/media';
import { MediaTile, MediaViewer } from './MediaViewer';

/**
 * Videos and photos for one match, shown on the match itself. Files live in
 * IndexedDB on the device - a phone clip is far bigger than localStorage allows.
 */
export function MediaGallery({ matchId, onSeeAll }: { matchId: string; onSeeAll?: () => void }) {
  const [items, setItems] = useState<MediaMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<MediaMeta | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listMedia(matchId)
      .then(setItems)
      .catch(() => setError('Could not read saved media on this device.'));
  }, [matchId]);

  useEffect(refresh, [refresh]);

  const onFiles = async (files: FileList) => {
    setBusy(true);
    setError('');
    try {
      for (const file of Array.from(files)) await addMedia(matchId, file);
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
              <MediaTile key={item.id} item={item} onOpen={() => setViewing(item)} onDelete={() => void remove(item)} />
            ))}
          </div>
          <div className="media-foot">
            <span className="muted small">
              {items.length} file{items.length === 1 ? '' : 's'} ·{' '}
              {formatBytes(items.reduce((sum, i) => sum + i.size, 0))}
            </span>
            {onSeeAll && (
              <button className="link-btn" onClick={onSeeAll}>
                See all media
              </button>
            )}
          </div>
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

      <MediaViewer item={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
