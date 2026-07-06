function drawResized(
  file: File,
  maxDimension: number
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function compressImageToBase64(
  file: File,
  maxDimension = 600,
  quality = 0.75
): Promise<string> {
  const canvas = await drawResized(file, maxDimension);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Verkleinert ein Bild clientseitig vor dem Hochladen, statt das rohe Kamerafoto in
 *  voller Auflösung zu übertragen. */
export async function compressImageToBlob(
  file: File,
  maxDimension = 1280,
  quality = 0.8
): Promise<File> {
  const canvas = await drawResized(file, maxDimension);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
