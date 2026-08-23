import { createId } from './storage';

/**
 * Match videos and photos live in IndexedDB, not localStorage - a single clip
 * from a phone is far bigger than the ~5MB localStorage allows.
 */
const DB_NAME = 'matchday.media';
const DB_VERSION = 1;
const STORE = 'media';

export interface MediaItem {
  id: string;
  matchId: string;
  kind: 'video' | 'photo';
  name: string;
  type: string;
  size: number;
  /** Small JPEG data URL used for the gallery grid. */
  thumbnail: string | null;
  /** Video length in seconds, when known. */
  duration: number | null;
  note: string;
  createdAt: string;
  blob: Blob;
}

/** Everything except the blob - enough to render the gallery. */
export type MediaMeta = Omit<MediaItem, 'blob'>;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB, so media can\'t be stored.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('matchId', 'matchId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the media store.'));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Media request failed.'));
      }),
  );
}

const stripBlob = ({ blob: _blob, ...meta }: MediaItem): MediaMeta => meta;

export async function listMedia(matchId: string): Promise<MediaMeta[]> {
  const items = await tx<MediaItem[]>('readonly', (store) => store.index('matchId').getAll(matchId));
  return items.map(stripBlob).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listAllMedia(): Promise<MediaMeta[]> {
  const items = await tx<MediaItem[]>('readonly', (store) => store.getAll());
  return items.map(stripBlob);
}

export async function getMediaBlob(id: string): Promise<Blob | null> {
  const item = await tx<MediaItem | undefined>('readonly', (store) => store.get(id));
  return item?.blob ?? null;
}

export async function deleteMedia(id: string): Promise<void> {
  await tx<undefined>('readwrite', (store) => store.delete(id) as IDBRequest<undefined>);
}

export async function deleteMediaForMatch(matchId: string): Promise<void> {
  const items = await listMedia(matchId);
  await Promise.all(items.map((item) => deleteMedia(item.id)));
}

export async function updateMediaNote(id: string, note: string): Promise<void> {
  const item = await tx<MediaItem | undefined>('readonly', (store) => store.get(id));
  if (!item) return;
  await tx<IDBValidKey>('readwrite', (store) => store.put({ ...item, note }));
}

/** Grabs a frame from a video so the gallery has something to show. */
function videoThumbnail(file: File): Promise<{ thumbnail: string | null; duration: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const done = (thumbnail: string | null, duration: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve({ thumbnail, duration });
    };

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    video.onloadeddata = () => {
      // A frame a second in is more representative than a black opening frame.
      video.currentTime = Math.min(1, (video.duration || 1) / 3);
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 320 / (video.videoWidth || 320));
        canvas.width = Math.max(1, Math.round((video.videoWidth || 320) * scale));
        canvas.height = Math.max(1, Math.round((video.videoHeight || 180) * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return done(null, video.duration || null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        done(canvas.toDataURL('image/jpeg', 0.7), video.duration || null);
      } catch {
        done(null, video.duration || null);
      }
    };
    video.onerror = () => done(null, null);
    // Never let a stubborn file block the upload.
    setTimeout(() => done(null, video.duration || null), 6000);
  });
}

function photoThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 320 / img.width);
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          return resolve(null);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
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

export async function addMedia(matchId: string, file: File): Promise<MediaMeta> {
  const kind: MediaItem['kind'] = file.type.startsWith('video') ? 'video' : 'photo';
  let thumbnail: string | null = null;
  let duration: number | null = null;

  if (kind === 'video') {
    const shot = await videoThumbnail(file);
    thumbnail = shot.thumbnail;
    duration = shot.duration;
  } else {
    thumbnail = await photoThumbnail(file);
  }

  const item: MediaItem = {
    id: createId('media'),
    matchId,
    kind,
    name: file.name || (kind === 'video' ? 'Clip' : 'Photo'),
    type: file.type,
    size: file.size,
    thumbnail,
    duration,
    note: '',
    createdAt: new Date().toISOString(),
    blob: file,
  };

  await tx<IDBValidKey>('readwrite', (store) => store.put(item));
  return stripBlob(item);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
