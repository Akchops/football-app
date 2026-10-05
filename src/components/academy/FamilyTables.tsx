import { useState } from 'react';
import type { Membership } from '../../lib/academy';
import { useAcademy } from '../../store/AcademyProvider';
import { Sheet } from '../ui';
import { CompetitionTables, competitionFacts } from './CompetitionTables';
import { useLoad } from './parts';

/** An academy's tables, as a linked family sees them: to read, not to change. */
export function FamilyTablesSheet({ membership, onClose }: { membership: Membership | null; onClose: () => void }) {
  const { api } = useAcademy();
  const academyId = membership?.academyId ?? '';
  const competitions = useLoad(api && membership ? () => api.competitions(academyId) : null, academyId);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!membership) return null;

  const list = competitions.data ?? [];
  const open = list.find((c) => c.id === openId) ?? null;
  const close = () => {
    setOpenId(null);
    onClose();
  };

  return (
    <Sheet
      open
      title={open ? open.name : `${membership.academyName}'s tables`}
      subtitle={open ? competitionFacts(open) : undefined}
      onClose={close}
    >
      {open ? (
        <>
          <button className="link-btn back-link" onClick={() => setOpenId(null)}>
            ‹ All competitions
          </button>
          <CompetitionTables competition={open} editable={false} />
        </>
      ) : (
        <>
          {competitions.error && <p className="notice warn">{competitions.error}</p>}
          {!competitions.data && !competitions.error && <p className="muted small">Loading…</p>}
          {competitions.data && list.length === 0 && (
            <p className="muted small">The academy hasn&apos;t added any competitions yet.</p>
          )}
          <ul className="squad-list">
            {list.map((c) => (
              <li key={c.id}>
                <button className="squad-card" onClick={() => setOpenId(c.id)}>
                  <strong>{c.name}</strong>
                  <span className="muted small">{competitionFacts(c)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
