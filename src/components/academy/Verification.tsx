import { useRef, useState } from 'react';
import {
  DOCUMENT_KIND_LABEL, describeAcademyError, type AcademyDocument, type DocumentKind, type StaffAcademy,
} from '../../lib/academy';
import { openDataUrl, toDocument } from '../../lib/photo';
import { useAcademy } from '../../store/AcademyProvider';
import { Field, Section } from '../ui';
import { VerificationBadge, useLoad } from './parts';

const KINDS = Object.keys(DOCUMENT_KIND_LABEL) as DocumentKind[];

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

/** What the badge means right now, said for the academy's own staff. */
export function verificationLine(academy: StaffAcademy): string {
  switch (academy.verification) {
    case 'verified':
      return `Verified by Matchday${academy.verifiedAt ? ` on ${day(academy.verifiedAt)}` : ''}. Families see the tick wherever your name shows.`;
    case 'pending':
      return academy.verificationNote || 'Matchday is checking your documents. The badge changes here when it is done.';
    case 'rejected':
      return `Matchday couldn't verify the academy${academy.verificationNote ? `: ${academy.verificationNote}` : '.'} Fix what it says and send again.`;
    default:
      return "Not verified yet. Families see a warning when you invite them. Send Matchday your registration and certificates to get the verified badge.";
  }
}

/**
 * Getting the verified badge: the owner sends the academy's registration and
 * certificates, which only they and Matchday's admins can see, and asks for a
 * review. Everyone else on the staff sees where it stands.
 */
export function VerificationSection({ academy }: { academy: StaffAcademy }) {
  const { api, refresh, requireVerification } = useAcademy();
  const owner = academy.role === 'owner';
  const docs = useLoad(api && owner ? () => api.documents(academy.id) : null, academy.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentKind>('registration');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const run = async (work: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await work();
      if (done) setNote(done);
    } catch (e) {
      setError(describeAcademyError(e));
    } finally {
      setBusy(false);
    }
  };

  const upload = (file: File | undefined) => {
    if (!file || !api) return;
    void run(async () => {
      const prepared = await toDocument(file);
      if ('error' in prepared) throw new Error(prepared.error);
      await api.uploadDocument(academy.id, { kind, fileName: file.name, mime: prepared.mime, data: prepared.data });
      await docs.reload();
    });
  };

  const view = (doc: AcademyDocument) => api && void run(async () => openDataUrl(await api.documentData(doc.id)));
  const remove = (doc: AcademyDocument) => {
    if (!api || !confirm(`Remove ${doc.fileName}?`)) return;
    void run(async () => {
      await api.removeDocument(doc.id);
      await docs.reload();
    });
  };
  const submit = () =>
    api &&
    void run(async () => {
      await api.submitForReview(academy.id);
      await refresh();
    }, 'Sent. Matchday checks the documents and the badge changes here.');

  const list = docs.data ?? [];
  const canSend = owner && (academy.verification === 'unverified' || academy.verification === 'rejected');

  return (
    <Section title="Verification">
      <div className="verify-status">
        <VerificationBadge status={academy.verification} />
        <p className="small">{verificationLine(academy)}</p>
      </div>
      {requireVerification && academy.verification !== 'verified' && (
        <p className="notice warn">Until it is verified, the academy cannot add players or accept requests to join.</p>
      )}

      {!owner ? (
        <p className="muted small">The owner sends the documents. Only they and Matchday can see them.</p>
      ) : (
        <>
          <p className="muted small">
            Registration with your FA or league, coaching qualifications and safeguarding certificates. Photos are
            shrunk before sending; a PDF can be up to 2 MB. Only you and Matchday&apos;s admins can see them.
          </p>
          {list.length > 0 && (
            <ul className="doc-list">
              {list.map((doc) => (
                <li key={doc.id}>
                  <span className="player-row-main">
                    <strong>{DOCUMENT_KIND_LABEL[doc.kind]}</strong>
                    <span className="muted small">
                      {doc.fileName} · {day(doc.createdAt)}
                    </span>
                  </span>
                  <button className="link-btn" disabled={busy} onClick={() => view(doc)}>
                    View
                  </button>
                  <button className="link-btn" disabled={busy} onClick={() => remove(doc)} aria-label={`Remove ${doc.fileName}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {academy.verification !== 'pending' && (
            <div className="row two">
              <Field label="Document">
                <select className="input" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {DOCUMENT_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="field">
                <span className="field-label" aria-hidden="true">
                  &nbsp;
                </span>
                <button className="ghost-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
                  {busy ? 'Working…' : 'Add a photo or PDF'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  hidden
                  aria-label="Certificate file"
                  onChange={(e) => {
                    upload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          )}
          {error && <p className="notice warn">{error}</p>}
          {note && <p className="notice">{note}</p>}
          {canSend && (
            <div className="button-row">
              <button className="primary-btn" disabled={busy || list.length === 0} onClick={submit}>
                Send for review
              </button>
              {list.length === 0 && <span className="muted small">Add at least one document first.</span>}
            </div>
          )}
        </>
      )}
    </Section>
  );
}
