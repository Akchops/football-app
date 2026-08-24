import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/AppStore';
import type { Match } from '../types';
import { formatDateShort, kickoffAt } from '../lib/date';
import { outcomeOf, scoreline } from '../lib/stats';
import {
  UNASSIGNED, addMedia, deleteMedia, formatBytes, listAllMedia, updateMediaMatch, type MediaMeta,
} from '../store/media';
import { MediaTile, MediaViewer } from './MediaViewer';
import { MatchPickerSheet } from './MatchPickerSheet';
import { EmptyState } from './ui';

type Filter = 'all' | 'video' | 'photo';

interface Group {
  key: string;
  match: Match | null;
  items: MediaMeta[];
}

export function MediaScreen({ onOpenMatch }: { onOpenMatch: (match: Match) => void }) {
  const { matches, competitionOf, teamOf, teams } = useStore();
  const [items, setItems] = useState<MediaMeta[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [viewing, setViewing] = useState<MediaMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** Files chosen but not yet filed against a match. */
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  /** An existing item being moved to a different match. */
  const [reassigning, setReassigning] = useState<MediaMeta | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listAllMedia()
      .then(setItems)
      .catch(() => setError('Could not read saved media on this device.'));
  }, []);

  useEffect(refresh, [refresh]);

  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  const groups = useMemo(() => {
    const visible = items.filter((i) => filter === 'all' || i.kind === filter);
    const byMatch = new Map<string, Group>();

    for (const item of visible) {
      const match = matchById.get(item.matchId) ?? null;
      const key = match ? match.id : UNASSIGNED;
      let group = byMatch.get(key);
      if (!group) {
        group = { key, match, items: [] };
        byMatch.set(key, group);
      }
      group.items.push(item);
    }

    return [...byMatch.values()].sort((a, b) => {
      // Anything still unfiled sits at the top, waiting to be sorted out.
      if (!a.match) return -1;
      if (!b.match) return 1;
      return kickoffAt(b.match.date, b.match.time).getTime() - kickoffAt(a.match.date, a.match.time).getTime();
    });
  }, [items, filter, matchById]);

  const saveFiles = async (files: File[], matchId: string) => {
    setBusy(true);
    setError('');
    try {
      for (const file of files) await addMedia(matchId, file);
      refresh();
    } catch {
      setError("Couldn't save that file — the device may be out of space.");
    } finally {
      setBusy(false);
      setPendingFiles(null);
    }
  };

  const remove = async (item: MediaMeta) => {
    if (!confirm(`Delete "${item.name}"? This can't be undone.`)) return;
    await deleteMedia(item.id);
    if (viewing?.id === item.id) setViewing(null);
    refresh();
  };

  const videoCount = items.filter((i) => i.kind === 'video').length;
  const totalBytes = items.reduce((sum, i) => sum + i.size, 0);
  const viewingMatch = viewing ? matchById.get(viewing.matchId) ?? null : null;

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Media</h1>
        <button className="primary-btn small" onClick={() => fileRef.current?.click()} disabled={busy}>
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
          const chosen = Array.from(e.target.files ?? []);
          // Ask which match it belongs to before saving anything.
          if (chosen.length) setPendingFiles(chosen);
          e.target.value = '';
        }}
      />

      {error && <p className="form-error">{error}</p>}

      {items.length === 0 ? (
        <EmptyState
          icon="🎬"
          title="No photos or clips yet"
          message="Add videos and photos from your matches — saves, goals, big moments. You choose which match each one belongs to, and it shows up on that match too."
          action={
            <button className="primary-btn" onClick={() => fileRef.current?.click()}>
              Add your first clip
            </button>
          }
        />
      ) : (
        <>
          <div className="chip-scroll">
            {(['all', 'video', 'photo'] as Filter[]).map((f) => (
              <button
                key={f}
                className={filter === f ? 'filter-chip on' : 'filter-chip'}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? `All (${items.length})` : f === 'video' ? `Video (${videoCount})` : `Photos (${items.length - videoCount})`}
              </button>
            ))}
          </div>

          {groups.map((group) => {
            const match = group.match;
            const competition = match ? competitionOf(match) : null;
            const team = match ? teamOf(match) : null;
            return (
              <div key={group.key} className="media-group">
                {match ? (
                  <button className="media-group-head" onClick={() => onOpenMatch(match)}>
                    <span className="media-group-title">
                      {match.venue === 'away' ? '@' : 'vs'} {match.opponent || 'TBC'}
                    </span>
                    <span className="media-group-meta">
                      {formatDateShort(match.date)}
                      {teams.length > 1 && team ? ` · ${team.name}` : ''}
                      {competition ? ` · ${competition.name}` : ''}
                      {match.result ? ` · ${scoreline(match.result)}` : ''}
                    </span>
                    {match.result && (
                      <span className={`badge outcome-${outcomeOf(match.result).toLowerCase()}`}>
                        {outcomeOf(match.result)}
                      </span>
                    )}
                  </button>
                ) : (
                  <div className="media-group-head unfiled">
                    <span className="media-group-title">Not filed yet</span>
                    <span className="media-group-meta">Tap a clip to choose which match it's from</span>
                  </div>
                )}

                <div className="media-grid">
                  {group.items.map((item) => (
                    <MediaTile
                      key={item.id}
                      item={item}
                      onOpen={() => setViewing(item)}
                      onDelete={() => void remove(item)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          <p className="muted small">
            {items.length} file{items.length === 1 ? '' : 's'} · {formatBytes(totalBytes)} on this device. Media
            stays on the phone and is not included in the backup file.
          </p>
        </>
      )}

      <MediaViewer
        item={viewing}
        onClose={() => setViewing(null)}
        subtitle={viewingMatch ? `${viewingMatch.venue === 'away' ? '@' : 'vs'} ${viewingMatch.opponent}` : 'Not filed'}
        actions={
          viewing && (
            <>
              <button
                className="ghost-btn"
                onClick={() => {
                  setReassigning(viewing);
                  setViewing(null);
                }}
              >
                {viewingMatch ? 'Change match' : 'Choose match'}
              </button>
              {viewingMatch && (
                <button
                  className="ghost-btn"
                  onClick={() => {
                    setViewing(null);
                    onOpenMatch(viewingMatch);
                  }}
                >
                  Open match
                </button>
              )}
            </>
          )
        }
      />

      <MatchPickerSheet
        open={pendingFiles !== null}
        title={`Which match ${pendingFiles && pendingFiles.length > 1 ? 'are these from' : 'is this from'}?`}
        subtitle={
          pendingFiles
            ? `${pendingFiles.length} file${pendingFiles.length === 1 ? '' : 's'} ready to save`
            : undefined
        }
        onPick={(matchId) => void saveFiles(pendingFiles ?? [], matchId)}
        onClose={() => setPendingFiles(null)}
      />

      <MatchPickerSheet
        open={reassigning !== null}
        title="Move to which match?"
        currentMatchId={reassigning?.matchId}
        onPick={(matchId) => {
          const item = reassigning;
          setReassigning(null);
          if (!item) return;
          void updateMediaMatch(item.id, matchId).then(refresh);
        }}
        onClose={() => setReassigning(null)}
      />
    </div>
  );
}
