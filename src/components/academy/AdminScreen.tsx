import { useState } from 'react';
import { DOCUMENT_KIND_LABEL, describeAcademyError, type AcademyDocument, type ReviewItem } from '../../lib/academy';
import { openDataUrl } from '../../lib/photo';
import { useAcademy } from '../../store/AcademyProvider';
import { Field, Section, Sheet } from '../ui';
import { VerificationBadge, useLoad } from './parts';

function day(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Matchday's own admin screen: academies waiting to be verified, their
 * documents, approving or turning them down with a note, and the switch that
 * makes verification required before an academy can add players.
 */
export function AdminScreen({ onBack }: { onBack: () => void }) {
  const { api, requireVerification, refresh } = useAcademy();
  const list = useLoad(api ? () => api.academiesForReview() : null, 'review');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The switch moves when tapped, and moves back if the server says no.
  const [switching, setSwitching] = useState<boolean | null>(null);
  const switchOn = switching ?? requireVerification;

  const items = list.data ?? [];
  const waiting = items.filter((a) => a.verification === 'pending');
  const rest = items.filter((a) => a.verification !== 'pending');
  const open = items.find((a) => a.id === openId) ?? null;

  const toggle = async (on: boolean) => {
    if (!api) return;
    const question = on
      ? 'Require verification? Unverified academies stop being able to add players or accept requests. Players already linked stay.'
      : 'Stop requiring verification? Any academy can add players again, marked Not verified.';
    if (!confirm(question)) return;
    setSwitching(on);
    setBusy(true);
    setError('');
    try {
      await api.setRequireVerification(on);
      await refresh();
    } catch (e) {
      setError(describeAcademyError(e));
    } finally {
      setSwitching(null);
      setBusy(false);
    }
  };

  const row = (a: ReviewItem) => (
    <li key={a.id}>
      <button className="squad-card" onClick={() => setOpenId(a.id)}>
        <span className="squad-card-main">
          <strong>{a.name}</strong>
          <VerificationBadge status={a.verification} />
        </span>
        <span className="muted small">
          {[a.town, a.country].filter(Boolean).join(', ') || 'No place given'} · {a.owner ? `@${a.owner}` : 'no owner'} ·{' '}
          {a.documents} document{a.documents === 1 ? '' : 's'} · made {day(a.createdAt)}
        </span>
      </button>
    </li>
  );

  return (
    <div className="screen">
      <button className="link-btn back-link" onClick={onBack}>
        ‹ Back
      </button>
      <div className="screen-head">
        <h1>Review academies</h1>
      </div>
      <p className="muted small">Only Matchday&apos;s admins see this.</p>

      <Section title="Approval">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={switchOn}
            disabled={busy}
            onChange={(e) => void toggle(e.target.checked)}
          />
          <span>Academies must be verified before they can add players</span>
        </label>
        <p className="muted small">
          {switchOn
            ? 'On: an unverified academy cannot invite players or accept requests to join. Players already linked stay.'
            : 'Off: an academy works as soon as it is made, marked Not verified, and families see a warning.'}
        </p>
        {error && <p className="notice warn">{error}</p>}
      </Section>

      {list.error && <p className="notice warn">{list.error}</p>}
      {!list.data && !list.error && <p className="muted small">Loading…</p>}

      {list.data && (
        <Section title={`Waiting for review · ${waiting.length}`}>
          {waiting.length === 0 ? <p className="muted small">Nothing waiting.</p> : <ul className="squad-list">{waiting.map(row)}</ul>}
        </Section>
      )}
      {rest.length > 0 && (
        <Section title={`Every other academy · ${rest.length}`}>
          <ul className="squad-list">{rest.map(row)}</ul>
        </Section>
      )}

      {open && (
        <ReviewSheet
          key={open.id}
          item={open}
          onClose={() => setOpenId(null)}
          onDone={async () => {
            setOpenId(null);
            await list.reload();
          }}
        />
      )}
    </div>
  );
}

function ReviewSheet({ item, onClose, onDone }: { item: ReviewItem; onClose: () => void; onDone: () => Promise<void> }) {
  const { api } = useAcademy();
  const docs = useLoad(api ? () => api.documents(item.id) : null, item.id);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [note, setNote] = useState(item.verification === 'rejected' ? item.verificationNote : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const view = async (doc: AcademyDocument) => {
    if (!api) return;
    setError('');
    try {
      const data = await api.documentData(doc.id);
      if (doc.mime === 'application/pdf') openDataUrl(data);
      else setPreviews((p) => ({ ...p, [doc.id]: data }));
    } catch (e) {
      setError(describeAcademyError(e));
    }
  };

  const decide = async (approve: boolean) => {
    if (!api) return;
    if (!approve && !note.trim()) return setError('Say why, so the owner knows what to fix.');
    setBusy(true);
    setError('');
    try {
      await api.reviewAcademy(item.id, approve, note);
      await onDone();
    } catch (e) {
      setError(describeAcademyError(e));
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      title={item.name}
      subtitle={[item.town, item.country].filter(Boolean).join(', ')}
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn wide" disabled={busy} onClick={() => void decide(false)}>
            Turn down
          </button>
          <button className="primary-btn wide" disabled={busy} onClick={() => void decide(true)}>
            Verify
          </button>
        </>
      }
    >
      <dl className="facts">
        <dt>Status</dt>
        <dd>
          <VerificationBadge status={item.verification} />
        </dd>
        <dt>Owner</dt>
        <dd>{item.owner ? `@${item.owner}` : '-'}</dd>
        <dt>Contact</dt>
        <dd>{item.contactEmail || '-'}</dd>
        <dt>Made</dt>
        <dd>{day(item.createdAt)}</dd>
      </dl>

      <Field group label={`Documents · ${docs.data?.length ?? item.documents}`}>
        {docs.error && <p className="notice warn">{docs.error}</p>}
        {docs.data && docs.data.length === 0 && <p className="muted small">None sent.</p>}
        <ul className="doc-list">
          {(docs.data ?? []).map((doc) => (
            <li key={doc.id}>
              <span className="player-row-main">
                <strong>{DOCUMENT_KIND_LABEL[doc.kind]}</strong>
                <span className="muted small">
                  {doc.fileName} · {day(doc.createdAt)}
                </span>
                {previews[doc.id] && <img className="doc-preview" src={previews[doc.id]} alt={doc.fileName} />}
              </span>
              <button className="link-btn" onClick={() => void view(doc)}>
                {doc.mime === 'application/pdf' ? 'Open' : 'View'}
              </button>
            </li>
          ))}
        </ul>
      </Field>

      <Field label="Note for the academy" hint="Shown to the owner. Needed to turn one down.">
        <textarea
          className="input"
          rows={3}
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Checked the FA registration"
        />
      </Field>
      {error && <p className="form-error">{error}</p>}
    </Sheet>
  );
}
