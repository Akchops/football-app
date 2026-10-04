import { useRef, useState } from 'react';
import { describeAcademyError, type Academy, type AcademyDetails } from '../../lib/academy';
import { toLogoDataUrl } from '../../lib/photo';
import { useAcademy } from '../../store/AcademyProvider';
import { useSync } from '../../store/SyncProvider';
import { AGE_GROUPS } from '../../types';
import { Field } from '../ui';
import { AcademyLogo } from './parts';

export function detailsOf(academy: Academy): AcademyDetails {
  return {
    name: academy.name,
    town: academy.town,
    country: academy.country,
    contactEmail: academy.contactEmail,
    ageGroups: academy.ageGroups,
    logo: academy.logo,
  };
}

/** What makes the details unsaveable, if anything. */
export function detailsProblem(details: AcademyDetails): string | null {
  const name = details.name.trim();
  if (name.length < 2) return 'Give the academy a name.';
  if (name.length > 80) return 'That name is too long - 80 letters at most.';
  if (details.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.contactEmail.trim())) {
    return "That contact email doesn't look right.";
  }
  return null;
}

/** Name, logo, where it is, how to reach it and which age groups it runs. */
export function AcademyDetailsFields({
  value,
  onChange,
}: {
  value: AcademyDetails;
  onChange: (next: AcademyDetails) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState('');
  const set = (patch: Partial<AcademyDetails>) => onChange({ ...value, ...patch });

  const pickLogo = async (file: File | undefined) => {
    setLogoError('');
    if (!file) return;
    const logo = await toLogoDataUrl(file);
    if (logo) set({ logo });
    else setLogoError("That picture couldn't be used - try a PNG or JPEG.");
  };

  const toggleAge = (group: string) =>
    set({
      ageGroups: value.ageGroups.includes(group)
        ? value.ageGroups.filter((g) => g !== group)
        : AGE_GROUPS.filter((g) => g === group || value.ageGroups.includes(g)),
    });

  return (
    <>
      <Field group label="Logo">
        <div className="logo-row">
          <AcademyLogo name={value.name} logo={value.logo} size={56} />
          <button type="button" className="ghost-btn" onClick={() => fileRef.current?.click()}>
            {value.logo ? 'Change' : 'Add a logo'}
          </button>
          {value.logo && (
            <button type="button" className="link-btn" onClick={() => set({ logo: '' })}>
              Remove
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              void pickLogo(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        {logoError && <span className="field-hint bad">{logoError}</span>}
      </Field>

      <Field label="Academy name">
        <input
          className="input"
          value={value.name}
          maxLength={80}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Riverside Football Academy"
        />
      </Field>

      <div className="row two">
        <Field label="Town or city">
          <input className="input" value={value.town} maxLength={80} onChange={(e) => set({ town: e.target.value })} placeholder="e.g. Leeds" />
        </Field>
        <Field label="Country">
          <input
            className="input"
            value={value.country}
            maxLength={60}
            onChange={(e) => set({ country: e.target.value })}
            placeholder="e.g. England"
          />
        </Field>
      </div>

      <Field label="Contact email" hint="For families with a question. Shown to your staff and to Matchday.">
        <input
          className="input"
          type="email"
          inputMode="email"
          value={value.contactEmail}
          maxLength={120}
          onChange={(e) => set({ contactEmail: e.target.value })}
          placeholder="info@your-academy.com"
        />
      </Field>

      <Field group label="Age groups you run">
        <div className="chip-wrap">
          {AGE_GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              className={value.ageGroups.includes(group) ? 'filter-chip on' : 'filter-chip'}
              aria-pressed={value.ageGroups.includes(group)}
              onClick={() => toggleAge(group)}
            >
              {group}
            </button>
          ))}
        </div>
      </Field>
    </>
  );
}

/** Making a new academy. Whoever makes it is its owner. */
export function CreateAcademyForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel?: () => void }) {
  const academy = useAcademy();
  const sync = useSync();
  const [details, setDetails] = useState<AcademyDetails>({
    name: '',
    town: '',
    country: '',
    contactEmail: sync.account?.email ?? '',
    ageGroups: [],
    logo: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    const problem = detailsProblem(details);
    if (problem) return setError(problem);
    if (!academy.api) return;
    setBusy(true);
    setError('');
    try {
      const id = await academy.api.createAcademy(details);
      await academy.refresh();
      academy.choose(id);
      onCreated(id);
    } catch (e) {
      setError(describeAcademyError(e));
      setBusy(false);
    }
  };

  return (
    <div className="detail-block">
      <AcademyDetailsFields value={details} onChange={setDetails} />
      <p className="muted small">
        You&apos;ll be its owner. It starts as <strong>Not verified</strong> - you can send Matchday its registration and
        coaching certificates later, to get the verified badge.
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="button-row">
        <button className="primary-btn" disabled={busy} onClick={() => void create()}>
          {busy ? 'Creating…' : 'Create academy'}
        </button>
        {onCancel && (
          <button className="ghost-btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
