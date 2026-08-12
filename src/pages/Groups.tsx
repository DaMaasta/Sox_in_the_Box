import React, { useState, useEffect } from "react";
import clsx from "clsx";
import { Users, Plus, QrCode, AlertTriangle } from "lucide-react";
import type { NavigateFn } from "../App";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToUserSpaces, createSpace, deleteSpace, generateAccessCode } from "../services/spaces.service";
import { api } from "../config/api";
import type { DocFolder } from "../services/documents.service";
import type { Space } from "../types";
import JoinSheet from "./groups/JoinSheet";
import GroupRow from "./groups/GroupRow";

interface GroupsProps {
  navigate: NavigateFn;
}

interface DeleteConfirm {
  id: string;
  name: string;
  boxes: number;
  products: number;
}

export default function Groups({ navigate }: GroupsProps): React.ReactElement {
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newWithCode, setNewWithCode] = useState(false);
  const [newCodeLength, setNewCodeLength] = useState(4);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);

  const [rootFolders, setRootFolders] = useState<DocFolder[]>([]);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    api.get<DocFolder[]>('/documents/folders?parentId=').then(setRootFolders).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    return subscribeToUserSpaces(user.uid, setSpaces);
  }, [user]);

  const groups = spaces.filter((s) => s.isGroup);

  const handleCreate = async () => {
    if (!newName.trim() || !user || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const code = newWithCode && newCodeLength > 0 ? generateAccessCode(newCodeLength) : undefined;
      await createSpace(user.uid, user.email ?? "", user.displayName ?? "", {
        name: newName.trim(), type: "other", description: newDesc.trim(),
        icon: "👥", color: "#2C2926", isGroup: true,
        ...(code ? { accessCode: code } : {}),
      });
      setNewName(""); setNewDesc(""); setNewWithCode(false); setNewCodeLength(4); setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Erstellen fehlgeschlagen");
    } finally { setCreating(false); }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    await deleteSpace(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  return (
    <div className="py-5 px-4 w-full box-border overflow-x-hidden">

      {/* Delete modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-5" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-c-surface rounded-[20px] py-7 px-6 w-full max-w-[340px] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="w-[52px] h-[52px] bg-[#fef3c7] rounded-full flex items-center justify-center">
              <AlertTriangle size={24} color="#f59e0b" />
            </div>
            <h3 className="text-lg font-extrabold text-[#0f172a] m-0">Ort löschen?</h3>
            <p className="text-sm text-[#475569] text-center leading-normal m-0">
              <strong>„{deleteConfirm.name}"</strong> enthält{" "}
              {deleteConfirm.boxes > 0 && <><strong>{deleteConfirm.boxes} {deleteConfirm.boxes === 1 ? "Box" : "Boxen"}</strong></>}
              {deleteConfirm.boxes > 0 && deleteConfirm.products > 0 && " und "}
              {deleteConfirm.products > 0 && <><strong>{deleteConfirm.products} {deleteConfirm.products === 1 ? "Gegenstand" : "Gegenstände"}</strong></>}
              . Alles wird unwiderruflich gelöscht.
            </p>
            <div className="flex gap-2.5 w-full mt-1">
              <button className="flex-1 bg-[#f1f5f9] border-none rounded-xl py-3 text-sm font-semibold text-[#0f172a] cursor-pointer" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
              <button className="flex-1 bg-[#ef4444] border-none rounded-xl py-3 text-sm font-bold text-white cursor-pointer" onClick={confirmDelete}>Löschen</button>
            </div>
          </div>
        </div>
      )}

      {/* Join sheet */}
      {showJoin && (
        <JoinSheet
          onClose={() => setShowJoin(false)}
          onJoined={(space) => navigate("GroupDetail", { group: space })}
        />
      )}

      <div className="mb-4">
        <div className="flex gap-2 items-center">
          <button className="flex items-center gap-[5px] bg-c-dark-btn text-c-dark-btn-text border-none rounded-[10px] py-[7px] px-2.5 text-xs font-semibold cursor-pointer whitespace-nowrap" onClick={() => setShowJoin(true)}>
            <QrCode size={15} color="var(--c-dark-btn-text)" /> Beitreten
          </button>
          <button className="flex items-center gap-[5px] bg-c-dark-btn text-c-dark-btn-text border-none rounded-[10px] py-[7px] px-2.5 text-xs font-semibold cursor-pointer whitespace-nowrap" onClick={() => setShowCreate(true)}>
            <Plus size={16} color="#fff" /> Neues Lager
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="bg-c-surface rounded-2xl p-4 mb-4">
          <input className="w-full border border-c-border rounded-[10px] py-2.5 px-3.5 text-sm outline-none box-border bg-c-bg text-c-text-1" placeholder="Name des Ortes..." value={newName}
            onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
          <input className="w-full border border-c-border rounded-[10px] py-2.5 px-3.5 text-[13px] text-c-text-2 outline-none box-border bg-c-bg mt-2" placeholder="Beschreibung (optional)..." value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
          <button className="flex items-center justify-between bg-none border-none cursor-pointer w-full pt-2.5 px-0.5 pb-0.5" onClick={() => { setNewWithCode((v) => !v); setNewCodeLength(4); }} type="button">
            <span className="text-[13px] font-semibold text-c-text-2">Zugangscode</span>
            <div className={clsx("w-[42px] h-6 rounded-xl relative transition-colors shrink-0", newWithCode ? "bg-[#2C2926]" : "bg-c-surface-2")}>
              <div className="absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white transition-transform" style={{ transform: newWithCode ? "translateX(18px)" : "translateX(0)" }} />
            </div>
          </button>
          {newWithCode && (
            <div className="flex items-center gap-2.5 mt-2">
              <span className="text-[13px] text-c-text-2 font-semibold">Stellen:</span>
              <button className="w-7 h-7 rounded-lg border-[1.5px] border-c-border bg-c-surface-2 text-base font-bold cursor-pointer flex items-center justify-center text-c-text-1" onClick={() => setNewCodeLength((v) => Math.max(1, v - 1))}>−</button>
              <span className="text-lg font-extrabold text-c-text-1 min-w-[24px] text-center">{newCodeLength}</span>
              <button className="w-7 h-7 rounded-lg border-[1.5px] border-c-border bg-c-surface-2 text-base font-bold cursor-pointer flex items-center justify-center text-c-text-1" onClick={() => setNewCodeLength((v) => Math.min(12, v + 1))}>+</button>
            </div>
          )}
          {createError && <div className="text-xs text-[#dc2626] mt-2">{createError}</div>}
          <div className="flex gap-2 mt-2.5 justify-end">
            <button className="bg-c-surface-2 border-none rounded-lg py-[7px] px-3.5 cursor-pointer text-[13px] font-semibold text-c-text-2" onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); setCreateError(""); }}>Abbrechen</button>
            <button className={clsx("bg-[#2C2926] border-none rounded-lg py-[7px] px-3.5 cursor-pointer text-[13px] font-semibold text-white", creating && "opacity-70")} onClick={handleCreate} disabled={creating}>
              {creating ? "…" : "Erstellen"}
            </button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-[60px] px-5 flex flex-col items-center gap-3">
          <Users size={48} color="var(--c-border)" />
          <p className="text-sm text-c-text-3 max-w-[240px]">Noch keine Lager. Erstelle eines und lade Mitglieder ein.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {groups.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              isOwner={g.ownerId === user?.uid}
              rootFolders={rootFolders}
              onNavigate={(group) => navigate("GroupDetail", { group })}
              onDeleteConfirm={setDeleteConfirm}
            />
          ))}
        </div>
      )}
    </div>
  );
}
