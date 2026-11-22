/**
 * Local IndexedDB temporary cache for AI-generated images and videos (3-day TTL).
 * Keeps heavy blobs and Base64 payloads off Firestore so free Spark quota (1MB/doc) is never exceeded.
 */

export const MEDIA_CACHE_TTL_DAYS = 3;
export const MEDIA_CACHE_TTL_MS = MEDIA_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

const DB_NAME = 'scout_media_cache';
const STORE_NAME = 'media';
const DB_VERSION = 1;

interface CachedMediaEntry {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
  expiresAt: number;
}

const objectUrlMemoryCache = new Map<string, string>();

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open media DB'));
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64Data] = dataUrl.split(',');
  const mimeMatch = header?.match(/data:([^;]+)/i);
  const mimeType = mimeMatch?.[1] || 'application/octet-stream';
  const binary = atob(base64Data || '');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export function base64ToBlob(base64: string, mimeType = 'image/png'): Blob {
  if (base64.startsWith('data:')) {
    return dataUrlToBlob(base64);
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function saveTempMediaBlob(
  id: string,
  blobOrDataUrl: Blob | string,
  fallbackMime = 'application/octet-stream'
): Promise<string> {
  const localRef = `local://${id}`;
  try {
    const blob =
      typeof blobOrDataUrl === 'string'
        ? blobOrDataUrl.startsWith('data:')
          ? dataUrlToBlob(blobOrDataUrl)
          : base64ToBlob(blobOrDataUrl, fallbackMime)
        : blobOrDataUrl;

    const db = await openMediaDb();
    const now = Date.now();
    const entry: CachedMediaEntry = {
      id,
      blob,
      mimeType: blob.type || fallbackMime,
      createdAt: now,
      expiresAt: now + MEDIA_CACHE_TTL_MS,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const objUrl = URL.createObjectURL(blob);
    objectUrlMemoryCache.set(localRef, objUrl);
    return localRef;
  } catch (err) {
    console.warn('Could not save media to IndexedDB cache:', err);
    return typeof blobOrDataUrl === 'string' && blobOrDataUrl.startsWith('data:')
      ? blobOrDataUrl
      : '';
  }
}

export async function getTempMediaObjectUrl(localRef?: string): Promise<string | null> {
  if (!localRef || !localRef.startsWith('local://')) return null;

  const memCached = objectUrlMemoryCache.get(localRef);
  if (memCached) return memCached;

  const id = localRef.slice('local://'.length);
  try {
    const db = await openMediaDb();
    const entry = await new Promise<CachedMediaEntry | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result as CachedMediaEntry | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();

    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      return null;
    }

    const objUrl = URL.createObjectURL(entry.blob);
    objectUrlMemoryCache.set(localRef, objUrl);
    return objUrl;
  } catch {
    return null;
  }
}

export async function cleanupExpiredMediaCache(): Promise<void> {
  try {
    const db = await openMediaDb();
    const now = Date.now();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const val = cursor.value as CachedMediaEntry;
        if (!val.expiresAt || val.expiresAt < now) {
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {}
}

/**
 * Generates a lightweight compressed JPEG thumbnail (< 55 KB) suitable for Firestore persistence
 * when an image was returned as a multi-megabyte Base64 payload.
 */
export async function createTinyImageThumbnail(
  source: string | Blob,
  maxDim = 480,
  maxLength = 65000
): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  let objectUrlToRevoke: string | null = null;
  try {
    const imgSrc =
      typeof source === 'string'
        ? source
        : (objectUrlToRevoke = URL.createObjectURL(source));

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image load failed'));
      el.src = imgSrc;
    });

    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || 256) * scale));
    const height = Math.max(1, Math.round((img.height || 256) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of [0.72, 0.55, 0.38]) {
      const compressed = canvas.toDataURL('image/jpeg', quality);
      if (compressed.length <= maxLength) {
        return compressed;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (objectUrlToRevoke) {
      URL.revokeObjectURL(objectUrlToRevoke);
    }
  }
}

export async function downloadMediaAsset(url: string, filename: string): Promise<void> {
  if (!url) return;
  try {
    // For blob:, data:, or CORS-enabled URLs, trigger clean file download
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);
      return;
    }
  } catch {}

  // Fallback direct anchor download
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
