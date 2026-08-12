import React from "react";
import clsx from "clsx";
import { Folder, ChevronRight, Pencil, Trash2, X, Check } from "lucide-react";
import type { DocFolder } from "../../services/documents.service";

interface FolderRowProps {
  folder: DocFolder;
  isReadOnly: boolean;
  editingFolderId: string | null;
  editFolderName: string;
  deleteFolderConfirm: string | null;
  onEnter: (folder: DocFolder) => void;
  onStartRename: (folder: DocFolder) => void;
  onEditNameChange: (name: string) => void;
  onRename: () => void;
  onCancelRename: () => void;
  onDelete: (folder: DocFolder) => void;
}

export default function FolderRow({
  folder, isReadOnly, editingFolderId, editFolderName, deleteFolderConfirm,
  onEnter, onStartRename, onEditNameChange, onRename, onCancelRename, onDelete,
}: FolderRowProps): React.ReactElement {
  if (editingFolderId === folder.id) {
    return (
      <div className="flex items-center bg-c-surface rounded-[14px] overflow-hidden min-h-[56px]">
        <div className="flex-1 flex items-center gap-2.5 py-2.5 px-3.5 border-[1.5px] border-[#2C2926] rounded-[14px] bg-c-surface">
          <Folder size={17} color="#2C2926" className="shrink-0" />
          <input
            className="flex-1 border-none outline-none text-sm bg-transparent text-c-text-1"
            value={editFolderName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRename();
              if (e.key === "Escape") onCancelRename();
            }}
            autoFocus
          />
          <button className="bg-none border-none cursor-pointer p-1 flex items-center rounded-md" onClick={onCancelRename}>
            <X size={14} color="var(--c-text-3)" />
          </button>
          <button className="bg-none border-none cursor-pointer p-1 flex items-center rounded-md" onClick={onRename}>
            <Check size={14} color="#22c55e" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center bg-c-surface rounded-[14px] overflow-hidden min-h-[56px]">
      <button
        className="flex-1 flex items-center gap-3 py-3 px-3.5 bg-none border-none cursor-pointer text-left min-w-0"
        onClick={() => onEnter(folder)}
      >
        <div className="w-[38px] h-[38px] rounded-[10px] bg-c-accent flex items-center justify-center shrink-0">
          <Folder size={19} color="#2C2926" />
        </div>
        <span className="flex-1 text-sm font-semibold text-c-text-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {folder.name}
        </span>
        <ChevronRight size={15} color="var(--c-text-4)" className="shrink-0" />
      </button>
      {!isReadOnly && (
        <div className="flex items-center pr-1 gap-0.5 shrink-0">
          <button
            className="bg-none border-none cursor-pointer p-2 flex items-center rounded-lg transition-colors duration-150"
            onClick={() => onStartRename(folder)}
            title="Umbenennen"
          >
            <Pencil size={14} color="var(--c-text-3)" />
          </button>
          <button
            className={clsx(
              "border-none cursor-pointer p-2 flex items-center rounded-lg transition-colors duration-150",
              deleteFolderConfirm === folder.id ? "bg-[#fee2e2]" : "bg-none"
            )}
            onClick={() => onDelete(folder)}
            title="Löschen"
          >
            <Trash2 size={14} color={deleteFolderConfirm === folder.id ? "#ef4444" : "var(--c-text-4)"} />
          </button>
        </div>
      )}
    </div>
  );
}
