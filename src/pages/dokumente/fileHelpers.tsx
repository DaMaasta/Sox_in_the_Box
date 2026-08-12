import React from "react";
import { FileText, File as FileIcon, Image as ImageIcon } from "lucide-react";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function fileIconColor(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "#22c55e";
  if (mimeType === "application/pdf") return "#ef4444";
  if (mimeType.includes("word") || mimeType.includes("document")) return "#3b82f6";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "#16a34a";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "#f59e0b";
  return "#94a3b8";
}

export function fileIconBg(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "#dcfce7";
  if (mimeType === "application/pdf") return "#fee2e2";
  if (mimeType.includes("word") || mimeType.includes("document")) return "#dbeafe";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "#dcfce7";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "#fef3c7";
  return "var(--c-surface-2)";
}

export function FileTypeIcon({ mimeType, size = 20 }: { mimeType: string; size?: number }): React.ReactElement {
  const color = fileIconColor(mimeType);
  if (mimeType.startsWith("image/")) return <ImageIcon size={size} color={color} />;
  if (mimeType === "application/pdf" || mimeType.includes("word") || mimeType.includes("document") ||
    mimeType.includes("sheet") || mimeType.includes("presentation"))
    return <FileText size={size} color={color} />;
  return <FileIcon size={size} color={color} />;
}
