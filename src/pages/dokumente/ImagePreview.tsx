import React from "react";
import { X } from "lucide-react";

interface ImagePreviewProps {
  url: string;
  onClose: () => void;
}

export default function ImagePreview({ url, onClose }: ImagePreviewProps): React.ReactElement {
  return (
    <div
      className="fixed inset-0 bg-black/85 z-[1000] flex items-center justify-center p-5"
      onClick={onClose}
    >
      <button
        className="absolute top-5 right-5 bg-white/15 border-none rounded-[10px] w-10 h-10 flex items-center justify-center cursor-pointer"
        onClick={onClose}
      >
        <X size={20} color="#fff" />
      </button>
      <img
        src={url}
        alt="Vorschau"
        className="max-w-full max-h-[80vh] rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
