/** Longest edge of an extracted frame. Smaller frames mean fewer tokens per clip. */
const FRAME_EDGE = 768;
/** Frames sent per clip. Enough to read a sequence without a runaway bill. */
export const MAX_FRAMES = 12;
/** Clips longer than this are refused - a full match can't be analysed this way. */
export const MAX_CLIP_SECONDS = 120;

export interface Frame {
  /** Seconds into the clip. */
  at: number;
  /** Base64 JPEG, no data-URL prefix. */
  data: string;
}

export class ClipTooLongError extends Error {
  constructor(readonly seconds: number) {
    super(`This clip is ${Math.round(seconds)}s long.`);
    this.name = 'ClipTooLongError';
  }
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error('Could not read that point in the video.'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

/**
 * Pulls evenly spaced stills out of a clip. Claude reads images, not video, so a
 * clip has to become a sequence of frames before it can be looked at.
 */
export async function extractFrames(blob: Blob, onProgress?: (done: number, total: number) => void): Promise<Frame[]> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('That file could not be read as a video.'));
      setTimeout(() => reject(new Error('Timed out reading the video.')), 20000);
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('That video has no readable length.');
    if (duration > MAX_CLIP_SECONDS) throw new ClipTooLongError(duration);

    // Skip the very start and end, which are often black or shaky.
    const first = Math.min(0.3, duration * 0.05);
    const last = Math.max(first, duration - Math.min(0.3, duration * 0.05));
    const count = Math.max(2, Math.min(MAX_FRAMES, Math.round(duration / 1.5) + 1));
    const step = (last - first) / Math.max(1, count - 1);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot process video frames.');

    const frames: Frame[] = [];
    for (let i = 0; i < count; i++) {
      const at = first + step * i;
      await seek(video, at);

      const w = video.videoWidth || 640;
      const h = video.videoHeight || 360;
      const scale = Math.min(1, FRAME_EDGE / Math.max(w, h));
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      frames.push({ at, data: dataUrl.slice(dataUrl.indexOf(',') + 1) });
      onProgress?.(i + 1, count);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
