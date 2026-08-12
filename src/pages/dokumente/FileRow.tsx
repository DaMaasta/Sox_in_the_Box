import React from "react";
import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { formatSize, fileIconBg, FileTypeIcon } from "./fileHelpers";
import type { DocFile } from "../../services/documents.service";

interface FileRowProps {
  file: DocFile;
  isReadOnly: boolean;
  deleteFileConfirm: string | null;
  onOpen: (file: DocFile) => void;
  onDelete: (file: DocFile) => void;
}

export default function FileRow({ file, isReadOnly, deleteFileConfirm, onOpen, onDelete }: FileRowProps): React.ReactElement {
  return (
    <div className="flex items-center bg-c-surface rounded-[14px] overflow-hidden min-h-[56px]">
      <button
        className="flex-1 flex items-center gap-3 py-3 px-3.5 bg-none border-none cursor-pointer text-left min-w-0"
        onClick={() => onOpen(file)}
      >
        <div
          className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center shrink-0"
          style={{ background: fileIconBg(file.mimeType) }}
        >
          <FileTypeIcon mimeType={file.mimeType} />
        </div>
        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
          <span className="flex-1 text-sm font-semibold text-c-text-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {file.name}
          </span>
          <span className="text-[11px] text-c-text-3">{formatSize(file.size)}</span>
        </div>
      </button>
      {!isReadOnly && (
        <div className="flex items-center pr-1 gap-0.5 shrink-0">
          <button
            className={clsx(
              "border-none cursor-pointer p-2 flex items-center rounded-lg transition-colors duration-150",
              deleteFileConfirm === file.id ? "bg-[#fee2e2]" : "bg-none"
            )}
            onClick={() => onDelete(file)}
            title="Löschen"
          >
            <Trash2 size={14} color={deleteFileConfirm === file.id ? "#ef4444" : "var(--c-text-4)"} />
          </button>
        </div>
      )}
    </div>
  );
}
