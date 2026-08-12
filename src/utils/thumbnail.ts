// Erzeugt kleine, vorskalierte Thumbnails aus den (bewusst groß gehaltenen, bis zu
// 600x600px) Produktfotos. Ein <img> mit dem vollen Base64-Bild direkt auf z.B. 64x64
// zu zwingen spart nur beim Layout, nicht beim Decode — der Browser dekodiert trotzdem
// die vollen Pixel, was beim Scrollen durch viele Karten (Suchliste) spürbar ruckelt.
// Hier wird stattdessen einmalig pro Bild ein echtes kleines JPEG erzeugt und als
// Object-URL im Speicher zwischengelagert, wodurch nachfolgende Renders sofort ein
// bereits winziges Bild bekommen.

import { useEffect, useState } from 'react';

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

async function generateThumbnail(dataUrl: string, size: number): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: size,
    resizeHeight: size,
    resizeQuality: 'medium',
  });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const thumbBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7));
  if (!thumbBlob) throw new Error('toBlob failed');
  return URL.createObjectURL(thumbBlob);
}

function getThumbnail(dataUrl: string, size: number): Promise<string> {
  const key = `${size}:${dataUrl}`;
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;

  const promise = generateThumbnail(dataUrl, size)
    .then((url) => { cache.set(key, url); pending.delete(key); return url; })
    .catch((err) => { pending.delete(key); throw err; });
  pending.set(key, promise);
  return promise;
}

/** Liefert eine kleine, vorskalierte Version von `imageUrl` (oder `null`, solange sie
 *  noch nicht bereit ist / kein Bild vorhanden ist). */
export function useThumbnail(imageUrl: string | null | undefined, size = 96): string | null {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl) { setThumb(null); return; }
    let cancelled = false;
    getThumbnail(imageUrl, size)
      .then((url) => { if (!cancelled) setThumb(url); })
      .catch(() => { if (!cancelled) setThumb(null); });
    return () => { cancelled = true; };
  }, [imageUrl, size]);

  return thumb;
}
