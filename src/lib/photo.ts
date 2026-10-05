/** Max edge of the stored profile photo. Small enough to sit in localStorage. */
const SIZE = 256;

/**
 * Crops a picked image to a square and shrinks it to a small JPEG data URL,
 * so a profile photo costs tens of kilobytes rather than several megabytes.
 */
export function toSquareDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          return resolve(null);
        }
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Max edge of an academy's logo, and the most it may take as a data URL (the server's limit is 200,000). */
const LOGO_SIZE = 256;
const LOGO_MAX = 150_000;

/**
 * Shrinks a logo to fit a 256px square without cropping it. PNG first, which
 * keeps a transparent background; a logo too detailed for that is drawn on
 * white and saved as a JPEG instead.
 */
export function toLogoDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (value: string | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    img.onload = () => {
      try {
        const scale = Math.min(1, LOGO_SIZE / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return done(null);
        ctx.drawImage(img, 0, 0, width, height);
        const png = canvas.toDataURL('image/png');
        if (png.length <= LOGO_MAX) return done(png);
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        const jpeg = canvas.toDataURL('image/jpeg', 0.85);
        done(jpeg.length <= LOGO_MAX ? jpeg : null);
      } catch {
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}

/** Longest edge of a photographed certificate - still readable, a fraction of the size. */
const DOCUMENT_EDGE = 1600;
/** PDFs are sent as they are, up to this size. */
export const PDF_MAX_BYTES = 2 * 1024 * 1024;

/**
 * A certificate ready to send: a photo shrunk to a JPEG that is still easy to
 * read, or a PDF as it is if it is small enough. Null with a reason otherwise.
 */
export async function toDocument(
  file: File,
): Promise<{ data: string; mime: 'image/jpeg' | 'application/pdf' } | { error: string }> {
  if (file.type === 'application/pdf') {
    if (file.size > PDF_MAX_BYTES) return { error: 'That PDF is over 2 MB. Try a smaller scan, or a photo of each page.' };
    const data = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    return data ? { data, mime: 'application/pdf' } : { error: "That PDF couldn't be read." };
  }
  if (!file.type.startsWith('image/')) return { error: 'Send a photo or a PDF.' };
  const data = await new Promise<string | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (value: string | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    img.onload = () => {
      try {
        const scale = Math.min(1, DOCUMENT_EDGE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return done(null);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        done(canvas.toDataURL('image/jpeg', 0.8));
      } catch {
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
  return data ? { data, mime: 'image/jpeg' } : { error: "That picture couldn't be read - try a JPEG or PNG." };
}

/** Opens a file kept as a data URL in a new tab. Browsers refuse to open data URLs directly, so it goes as a blob. */
export function openDataUrl(dataUrl: string): void {
  const [head, body] = dataUrl.split(',', 2);
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bytes = Uint8Array.from(atob(body ?? ''), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  window.open(url, '_blank', 'noopener');
  // Long enough for the new tab to load it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
