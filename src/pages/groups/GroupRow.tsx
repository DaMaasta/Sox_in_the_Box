import React, { useState } from "react";
import clsx from "clsx";
import { Users, ChevronRight, Package, Pencil, Check, X, Trash2, Key, FolderOpen, Copy, RefreshCw } from "lucide-react";
import type { Space } from "../../types";
import type { DocFolder } from "../../services/documents.service";
import { updateSpace, deleteSpace, removeAccessCode, getSpaceContentCount, regenerateAccessCode, generateAccessCode } from "../../services/spaces.service";

interface DeleteConfirm {
  id: string;
  name: string;
  boxes: number;
  products: number;
}

interface GroupRowProps {
  group: Space;
  isOwner: boolean;
  rootFolders: DocFolder[];
  onNavigate: (group: Space) => void;
  onDeleteConfirm: (confirm: DeleteConfirm) => void;
}

export default function GroupRow({ group: g, isOwner, rootFolders, onNavigate, onDeleteConfirm }: GroupRowProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCodeLength, setEditCodeLength] = useState(0);
  const [editCodeDirty, setEditCodeDirty] = useState(false);
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [checkingDelete, setCheckingDelete] = useState(false);

  const [copiedId, setCopiedId] = useState(false);
  const [regenConfirm, setRegenConfirm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const startEdit = () => {
    setEditing(true);
    setEditName(g.name);
    setEditCodeLength(g.accessCode?.length ?? 0);
    setEditCodeDirty(false);
    setEditFolderId(g.folderId ?? null);
    setShowFolderPicker(false);
  };

  const handleEdit = async () => {
    if (!editName.trim()) return;
    const folderUpdate = { folderId: editFolderId };
    if (editCodeDirty) {
      if (editCodeLength === 0) {
        await Promise.all([
          updateSpace(g.id, { name: editName.trim(), ...folderUpdate }),
          removeAccessCode(g.id),
        ]);
      } else {
        await updateSpace(g.id, { name: editName.trim(), accessCode: generateAccessCode(editCodeLength), ...folderUpdate });
      }
    } else {
      await updateSpace(g.id, { name: editName.trim(), ...folderUpdate });
    }
    setEditing(false);
  };

  const requestDelete = async () => {
    setCheckingDelete(true);
    try {
      const { boxes, products } = await getSpaceContentCount(g.id);
      if (boxes === 0 && products === 0) {
        await deleteSpace(g.id);
      } else {
        onDeleteConfirm({ id: g.id, name: g.name, boxes, products });
      }
    } finally { setCheckingDelete(false); }
  };

  const handleCopy = async () => {
    if (!g.accessCode) return;
    await navigator.clipboard.writeText(g.accessCode);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleRegen = async () => {
    if (!regenConfirm) { setRegenConfirm(true); return; }
    setRegenConfirm(false);
    setRegenerating(true);
    try { await regenerateAccessCode(g.id, g.accessCode?.length ?? 4); }
    finally { setRegenerating(false); }
  };

  return (
    <div className="bg-c-surface rounded-2xl overflow-hidden">
      {editing ? (
        <div className="bg-c-surface rounded-2xl p-3.5">
          <input className="w-full border border-[#2C2926] rounded-lg py-2 px-3 text-sm outline-none bg-c-bg text-c-text-1 box-border" value={editName} onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleEdit(); if (e.key === "Escape") setEditing(false); }} />
          <div className="flex items-center gap-2 mt-1.5 py-1">
            <span className="text-xs text-c-text-3 font-semibold">Code-Stellen:</span>
            <button className="w-7 h-7 rounded-lg border-[1.5px] border-c-border bg-c-surface-2 text-base font-bold cursor-pointer flex items-center justify-center text-c-text-1" onClick={() => { setEditCodeLength((v) => Math.max(0, v - 1)); setEditCodeDirty(true); }}>−</button>
            <span className="text-base font-extrabold text-c-text-1 min-w-[20px] text-center">
              {editCodeLength === 0 ? "–" : editCodeLength}
            </span>
            <button className="w-7 h-7 rounded-lg border-[1.5px] border-c-border bg-c-surface-2 text-base font-bold cursor-pointer flex items-center justify-center text-c-text-1" onClick={() => { setEditCodeLength((v) => Math.min(12, v + 1)); setEditCodeDirty(true); }}>+</button>
            <span className="text-[11px] text-c-text-4">
              {editCodeLength === 0 ? "(kein Code)" : "→ neuer Code wird generiert"}
            </span>
          </div>

          <button className="flex items-center justify-between bg-none border-none cursor-pointer w-full pt-2.5 px-0.5 pb-0.5" onClick={() => setShowFolderPicker(v => !v)} type="button">
            <div className="flex items-center gap-1.5">
              <FolderOpen size={13} color="var(--c-text-2)" />
              <span className="text-[13px] font-semibold text-c-text-2">Ordner</span>
            </div>
            <span className="text-xs text-c-text-3">
              {editFolderId ? (rootFolders.find(f => f.id === editFolderId)?.name ?? "Verknüpft") : "Kein Ordner"}
            </span>
          </button>
          {showFolderPicker && (
            <div className="flex flex-col gap-[3px] mt-1">
              <button
                className={clsx("flex items-center gap-2 py-2 px-2.5 rounded-lg border-none cursor-pointer text-left", !editFolderId ? "bg-c-accent" : "bg-c-bg")}
                onClick={() => { setEditFolderId(null); setShowFolderPicker(false); }}
              >
                <X size={13} color="var(--c-text-3)" />
                <span className="text-[13px] text-c-text-1 flex-1">Kein Ordner</span>
                {!editFolderId && <Check size={12} color="#2C2926" />}
              </button>
              {rootFolders.map(f => (
                <button
                  key={f.id}
                  className={clsx("flex items-center gap-2 py-2 px-2.5 rounded-lg border-none cursor-pointer text-left", editFolderId === f.id ? "bg-c-accent" : "bg-c-bg")}
                  onClick={() => { setEditFolderId(f.id); setShowFolderPicker(false); }}
                >
                  <FolderOpen size={13} color="var(--c-text-3)" />
                  <span className="text-[13px] text-c-text-1 flex-1">{f.name}</span>
                  {editFolderId === f.id && <Check size={12} color="#2C2926" />}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-2.5">
            <button className="flex-1 flex items-center justify-center gap-[5px] bg-[#22c55e] border-none rounded-[10px] py-2.5 text-[13px] font-bold text-white cursor-pointer" onClick={handleEdit}>
              <Check size={14} color="#fff" /> Speichern
            </button>
            <button className="flex-1 bg-c-surface-2 border-none rounded-[10px] py-2.5 text-[13px] font-semibold text-c-text-2 cursor-pointer" onClick={() => setEditing(false)}>
              Abbrechen
            </button>
            <button
              className={clsx("w-10 bg-[#fef2f2] border border-[#fca5a5] rounded-[10px] flex items-center justify-center cursor-pointer shrink-0", checkingDelete && "opacity-50")}
              disabled={checkingDelete}
              onClick={() => { setEditing(false); requestDelete(); }}
            >
              <Trash2 size={14} color="#ef4444" />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center">
            <button className="flex-1 flex items-center gap-3 py-3.5 px-4 bg-none border-none cursor-pointer text-left" onClick={() => onNavigate(g)}>
              <div className="w-[38px] h-[38px] rounded-[10px] bg-c-accent flex items-center justify-center shrink-0">
                <Package size={18} color="#2C2926" />
              </div>
              <div className="flex-1 flex flex-col gap-[3px] min-w-0">
                <span className="text-[15px] font-bold text-c-text-1">{g.name}</span>
                <span className="flex items-center gap-1 text-xs text-c-text-3">
                  <Users size={11} color="var(--c-text-3)" />
                  {g.memberIds.length} Mitglieder
                  {g.description ? ` · ${g.description}` : ""}
                </span>
              </div>
              <ChevronRight size={15} color="var(--c-text-4)" />
            </button>
            {isOwner && (
              <button className="bg-none border-none cursor-pointer p-1.5 flex items-center" onClick={startEdit}>
                <Pencil size={14} color="var(--c-text-3)" />
              </button>
            )}
          </div>

          {g.accessCode && (
            <div className="flex items-center gap-2 px-4 pt-2 pb-2.5 border-t border-c-border-2 bg-c-surface">
              <div className="w-[22px] h-[22px] rounded-md bg-c-accent flex items-center justify-center shrink-0">
                <Key size={13} color="#2C2926" />
              </div>
              <span className="text-[11px] font-bold text-c-text-3 tracking-wide shrink-0">Zutritt</span>
              <span className="text-lg font-extrabold text-c-text-1 tracking-[0.18em] font-mono flex-1">
                {g.accessCode ?? "—"}
              </span>
              <div className="flex gap-0.5">
                <button className="bg-none border-none cursor-pointer p-[5px] flex items-center rounded-md" onClick={handleCopy} title="Kopieren">
                  {copiedId ? <Check size={13} color="#22c55e" /> : <Copy size={13} color="var(--c-text-3)" />}
                </button>
                {isOwner && (
                  <>
                    {regenConfirm && <span className="text-[10px] font-bold text-[#2C2926] whitespace-nowrap">Bestätigen?</span>}
                    <button
                      className={clsx(
                        "bg-none border-none cursor-pointer p-[5px] flex items-center rounded-md",
                        regenerating && "opacity-50",
                        regenConfirm && "!bg-c-accent"
                      )}
                      onClick={handleRegen}
                      disabled={regenerating}
                      title="Neuen Code generieren"
                    >
                      <RefreshCw size={13} color={regenConfirm ? "#2C2926" : "var(--c-text-3)"}
                        style={{ animation: regenerating ? "spin 0.8s linear infinite" : "none" }} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
