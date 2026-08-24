import { useRef } from 'react';
import { toSquareDataUrl } from '../lib/photo';

/** The player's photo, or their initials when there isn't one. */
export function Avatar({ photo, name, size = 40 }: { photo: string; name: string; size?: number }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '⚽';

  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {photo ? <img src={photo} alt="" /> : <span aria-hidden="true">{initials}</span>}
    </span>
  );
}

/** Avatar plus the controls to set or clear the photo. */
export function AvatarPicker({
  photo,
  name,
  onChange,
}: {
  photo: string;
  name: string;
  onChange: (photo: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="avatar-picker">
      <Avatar photo={photo} name={name} size={76} />
      <div className="avatar-actions">
        <button className="ghost-btn" onClick={() => fileRef.current?.click()}>
          {photo ? 'Change photo' : 'Add photo'}
        </button>
        {photo && (
          <button className="danger-link" onClick={() => onChange('')}>
            Remove
          </button>
        )}
        <span className="muted small">Stays on this device. Shown around the app and on shared match cards.</span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const dataUrl = await toSquareDataUrl(file);
          if (dataUrl) onChange(dataUrl);
        }}
      />
    </div>
  );
}
