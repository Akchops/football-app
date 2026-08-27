/**
 * A phone photo of a fixture sheet is around 12 megapixels. Base64 inflates it
 * by a third again, and all of that has to leave a phone on mobile data before
 * anything can even start reading it - which is minutes, not seconds.
 *
 * Text stays legible far below that. The model tiles an image at 768px anyway,
 * so anything past a couple of thousand pixels is bytes spent for no accuracy.
 */
const MAX_EDGE = 1800;
const QUALITY = 0.82;

export interface Prepared {
  file: Blob;
  /** Set when the image was shrunk, so the UI can say what it did. */
  shrunkFrom: number | null;
}

/** PDFs go as they are; photos are cut down to something sendable. */
export async function prepareSchedule(file: File): Promise<Prepared> {
  if (file.type === 'application/pdf') return { file, shrunkFrom: null };

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await loadImage(file);
  }

  const width = 'width' in bitmap ? bitmap.width : 0;
  const height = 'height' in bitmap ? bitmap.height : 0;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

  // Already small enough - re-encoding would only lose detail.
  if (scale === 1 && file.size <= 900_000) {
    close(bitmap);
    return { file, shrunkFrom: null };
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    close(bitmap);
    return { file, shrunkFrom: null };
  }
  // Photos of paper are smooth-toned; the better resampler is worth it for text.
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  close(bitmap);

  const shrunk = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', QUALITY);
  });

  // A tiny screenshot can come out larger as a JPEG than it went in as a PNG.
  if (!shrunk || shrunk.size >= file.size) return { file, shrunkFrom: null };
  return { file: shrunk, shrunkFrom: file.size };
}

function close(bitmap: ImageBitmap | HTMLImageElement) {
  if ('close' in bitmap) bitmap.close();
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be opened.'));
    };
    img.src = url;
  });
}
