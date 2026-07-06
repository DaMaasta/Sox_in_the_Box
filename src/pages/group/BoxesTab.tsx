import React, { useState, useEffect, useMemo, useRef } from "react";
import { ChevronRight, Package, Plus, Pencil, Trash2, X, Inbox, Luggage, Archive, BoxIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import BottomSheet from "../../components/BottomSheet";
import type { NavigateFn } from "../../App";
import type { Space } from "../../types";
import { useAuth } from "../../contexts/AuthContext";
import { subscribeToChildSpaces, createSpace, updateSpace, deleteSpace } from "../../services/spaces.service";
import { subscribeToSpaceProducts, subscribeToProductsInSpaces } from "../../services/products.service";

const BOX_COLORS = ["#2C2926","#ef4444","#eab308","#22c55e","#14b8a6","#3b82f6","#8b5cf6","#ec4899"];

const BOX_CATEGORIES: { value: Space["type"]; label: string; icon: LucideIcon }[] = [
  { value: "box", label: "Box", icon: Package },
  { value: "trolley", label: "Trolley", icon: Luggage },
  { value: "kiste", label: "Kiste", icon: Archive },
  { value: "karton", label: "Karton", icon: BoxIcon },
];

interface BoxesTabProps {
  group: Space;
  navigate: NavigateFn;
  isViewer: boolean;
  showCreate: boolean;
  onShowCreateChange: (v: boolean) => void;
}

export default function BoxesTab({ group, navigate, isViewer, showCreate, onShowCreateChange }: BoxesTabProps): React.ReactElement {
  const { user } = useAuth();
  const [boxes, setBoxes] = useState<Space[]>([]);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("#2C2926");
  const [newCategory, setNewCategory] = useState<Space["type"]>("box");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("#2C2926");
  const [editNumber, setEditNumber] = useState<number | null>(null);
  const [editCategory, setEditCategory] = useState<Space["type"]>("box");
  const [deleteBox, setDeleteBox] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [unboxedCount, setUnboxedCount] = useState(0);
  const [boxItemCounts, setBoxItemCounts] = useState<Record<string, number>>({});
  const autoAssignedRef = useRef(false);

  useEffect(() => {
    if (!group?.id) return;
    return subscribeToChildSpaces(group.id, setBoxes);
  }, [group?.id]);

  useEffect(() => {
    if (!group?.id) return;
    return subscribeToSpaceProducts(group.id, (products) => setUnboxedCount(products.length));
  }, [group?.id]);

  const boxIds = useMemo(() => boxes.map((b) => b.id), [boxes]);
  const boxIdsKey = boxIds.join(",");
  useEffect(() => {
    if (boxIds.length === 0) { setBoxItemCounts({}); return; }
    return subscribeToProductsInSpaces(boxIds, (products) => {
      const counts: Record<string, number> = {};
      products.forEach((p) => { counts[p.spaceId] = (counts[p.spaceId] ?? 0) + 1; });
      setBoxItemCounts(counts);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxIdsKey]);

  useEffect(() => {
    if (autoAssignedRef.current || boxes.length === 0) return;
    const withoutNum = boxes.filter(b => b.boxNumber == null);
    if (withoutNum.length === 0) return;
    autoAssignedRef.current = true;
    const maxNum = boxes.reduce((m, b) => b.boxNumber != null && b.boxNumber > m ? b.boxNumber : m, 0);
    const sorted = [...withoutNum].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    sorted.forEach((box, idx) => {
      updateSpace(box.id, { boxNumber: maxNum + idx + 1 });
    });
  }, [boxes]);

  const handleCreate = async () => {
    if (!newName.trim() || !user || creating) return;
    setCreating(true);
    try {
      await createSpace(user.uid, user.email ?? "", user.displayName ?? "", {
        name: newName.trim(), type: newCategory, parentId: group.id,
        description: newDesc.trim(), icon: "📦", color: newColor,
      });
      setNewName(""); setNewDesc(""); setNewColor("#2C2926"); setNewCategory("box"); onShowCreateChange(false);
    } finally { setCreating(false); }
  };

  const startEdit = (box: Space) => {
    setEditingId(box.id);
    setEditName(box.name);
    setEditDesc(box.description ?? "");
    setEditColor(box.color ?? "#2C2926");
    setEditNumber(box.boxNumber ?? null);
    setEditCategory(box.type ?? "box");
    setDeleteBox(null);
  };

  const handleEdit = async () => {
    if (!editName.trim() || !editingId) return;
    await updateSpace(editingId, { name: editName.trim(), description: editDesc.trim(), color: editColor, boxNumber: editNumber, type: editCategory });
    setEditingId(null);
  };

  const handleDelete = async () => {
    if (!deleteBox || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSpace(deleteBox.id);
      setDeleteBox(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Fehler beim Löschen.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {deleteBox && (
        <BottomSheet onClose={() => { setDeleteBox(null); setDeleteError(null); }}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-c-text-1">Box löschen?</span>
            <button className="bg-transparent border-none cursor-pointer flex p-0.5" onClick={() => { setDeleteBox(null); setDeleteError(null); }}><X size={18} color="#94a3b8" /></button>
          </div>
          <p className="text-sm text-c-text-2 m-0 mb-1 leading-normal">
            <strong>"{deleteBox.name}"</strong> und alle darin enthaltenen Gegenstände werden unwiderruflich gelöscht.
          </p>
          {deleteError && <div className="bg-[#fef2f2] rounded-[10px] px-3 py-2 text-[13px] text-[#dc2626]">{deleteError}</div>}
          <div className="flex gap-2.5">
            <button className="flex-1 bg-c-bg border-none rounded-[10px] py-[11px] text-[13px] font-semibold text-c-text-1 cursor-pointer" onClick={() => { setDeleteBox(null); setDeleteError(null); }}>Abbrechen</button>
            <button className="flex-1 border-none rounded-[10px] py-[11px] text-[13px] font-bold text-white cursor-pointer"
              style={{ background: "linear-gradient(135deg,#ef4444 0%,#dc2626 100%)", opacity: deleting ? 0.6 : 1 }}
              onClick={handleDelete} disabled={deleting}>{deleting ? "Löschen..." : "Löschen"}</button>
          </div>
        </BottomSheet>
      )}

      {editingId && (
        <BottomSheet onClose={() => setEditingId(null)}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-c-text-1">Box bearbeiten</span>
            <button className="bg-transparent border-none cursor-pointer flex p-0.5" onClick={() => setEditingId(null)}><X size={18} color="#94a3b8" /></button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-c-text-3 uppercase tracking-[0.06em]">Name</label>
            <div className="flex gap-2 items-center">
              <input className="flex-1 w-full border-none rounded-[10px] px-3.5 py-2.5 text-sm outline-none box-border bg-c-bg text-c-text-1" value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleEdit(); }}
                placeholder="Box-Name" />
              <div className="flex items-center gap-0.5 bg-c-bg rounded-[10px] px-2.5 h-10 shrink-0">
                <span className="text-sm font-bold text-c-text-3">#</span>
                <input type="number" className="w-10 border-none outline-none bg-transparent text-sm font-bold text-c-text-1 text-center font-[inherit]"
                  value={editNumber ?? ""} onChange={(e) => setEditNumber(e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="–" min={1} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-c-text-3 uppercase tracking-[0.06em]">Beschreibung</label>
            <input className="w-full border-none rounded-[10px] px-3.5 py-2.5 text-sm outline-none box-border bg-c-bg text-c-text-1" value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)} placeholder="Optional" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-c-text-3 uppercase tracking-[0.06em]">Kategorie</label>
            <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {BOX_CATEGORIES.map((cat) => (
                <button key={cat.value}
                  className={clsx(
                    "flex items-center gap-[5px] border-[1.5px] rounded-[10px] px-3.5 py-2 text-[13px] font-semibold cursor-pointer whitespace-nowrap shrink-0",
                    editCategory === cat.value
                      ? "bg-[#2C2926] text-white border-[#2C2926]"
                      : "bg-c-bg border-c-border text-c-text-2"
                  )}
                  onClick={() => setEditCategory(cat.value)}>
                  <cat.icon size={14} /> {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-c-text-3 uppercase tracking-[0.06em]">Farbe</label>
            <div className="flex gap-[4px] flex-wrap">
              {BOX_COLORS.map((c) => (
                <button type="button" key={c}
                  className="w-[44px] h-[44px] rounded-full border-none cursor-pointer p-0 shrink-0 flex items-center justify-center bg-transparent"
                  style={{ touchAction: "manipulation" }}
                  onClick={() => setEditColor(c)}>
                  <div className="w-[28px] h-[28px] rounded-full transition-all duration-150"
                    style={{ background: c, boxShadow: editColor === c ? `0 0 0 3px var(--c-surface), 0 0 0 5px ${c}` : "none", transform: editColor === c ? "scale(1.2)" : "scale(1)" }} />
                </button>
              ))}
            </div>
          </div>

          <button className="w-full bg-[#2C2926] text-white border-none rounded-xl py-3.5 text-[15px] font-bold cursor-pointer" onClick={handleEdit}>Speichern</button>

          <button className="flex items-center justify-center gap-1.5 bg-transparent border-none cursor-pointer py-2 text-[13px] font-semibold text-[#ef4444]"
            onClick={() => { setDeleteBox({ id: editingId, name: editName }); setEditingId(null); }}>
            <Trash2 size={14} color="#ef4444" />
            <span>Box löschen</span>
          </button>
        </BottomSheet>
      )}

      {showCreate && (
        <BottomSheet onClose={() => { onShowCreateChange(false); setNewName(""); setNewDesc(""); setNewColor("#2C2926"); setNewCategory("box"); }}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-c-text-1">Neue Box</span>
            <button className="bg-transparent border-none cursor-pointer flex p-0.5" onClick={() => { onShowCreateChange(false); setNewName(""); setNewDesc(""); setNewColor("#2C2926"); setNewCategory("box"); }}><X size={18} color="#94a3b8" /></button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-c-text-3 uppercase tracking-[0.06em]">Name</label>
            <input className="w-full border-none rounded-[10px] px-3.5 py-2.5 text-sm outline-none box-border bg-c-bg text-c-text-1" placeholder="z.B. Werkzeugbox" value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-c-text-3 uppercase tracking-[0.06em]">Beschreibung</label>
            <input className="w-full border-none rounded-[10px] px-3.5 py-2.5 text-sm outline-none box-border bg-c-bg text-c-text-1" placeholder="Optional" value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-c-text-3 uppercase tracking-[0.06em]">Kategorie</label>
            <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {BOX_CATEGORIES.map((cat) => (
                <button key={cat.value}
                  className={clsx(
                    "flex items-center gap-[5px] border-[1.5px] rounded-[10px] px-3.5 py-2 text-[13px] font-semibold cursor-pointer whitespace-nowrap shrink-0",
                    newCategory === cat.value
                      ? "bg-[#2C2926] text-white border-[#2C2926]"
                      : "bg-c-bg border-c-border text-c-text-2"
                  )}
                  onClick={() => setNewCategory(cat.value)}>
                  <cat.icon size={14} /> {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-c-text-3 uppercase tracking-[0.06em]">Farbe</label>
            <div className="flex gap-[4px] flex-wrap">
              {BOX_COLORS.map((c) => (
                <button type="button" key={c}
                  className="w-[44px] h-[44px] rounded-full border-none cursor-pointer p-0 shrink-0 flex items-center justify-center bg-transparent"
                  style={{ touchAction: "manipulation" }}
                  onClick={() => setNewColor(c)}>
                  <div className="w-[28px] h-[28px] rounded-full transition-all duration-150"
                    style={{ background: c, boxShadow: newColor === c ? `0 0 0 3px var(--c-surface), 0 0 0 5px ${c}` : "none", transform: newColor === c ? "scale(1.2)" : "scale(1)" }} />
                </button>
              ))}
            </div>
          </div>

          <button className="w-full bg-[#2C2926] text-white border-none rounded-xl py-3.5 text-[15px] font-bold cursor-pointer"
            style={{ opacity: creating ? 0.7 : 1 }} onClick={handleCreate} disabled={creating}>
            {creating ? "Wird erstellt..." : "Erstellen"}
          </button>
        </BottomSheet>
      )}

      {boxes.length === 0 && !showCreate ? (
        <div className="text-center px-5 py-12 flex flex-col items-center gap-3">
          <Package size={48} color="var(--c-border)" />
          <p className="text-sm text-c-text-3">Noch keine Boxen an diesem Ort</p>
          {!isViewer && (
            <button className="flex items-center gap-1.5 bg-c-accent border-none rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-[#2C2926] cursor-pointer" onClick={() => onShowCreateChange(true)}>
              <Plus size={14} color="#2C2926" /> Erste Box erstellen
            </button>
          )}
        </div>
      ) : (
        <div>
          {BOX_CATEGORIES
            .filter(cat => boxes.some(b => (b.type ?? "box") === cat.value))
            .map((cat, catIdx) => {
              const catBoxes = [...boxes]
                .filter(b => (b.type ?? "box") === cat.value)
                .sort((a, b) => {
                  if (a.boxNumber != null && b.boxNumber != null) return a.boxNumber - b.boxNumber;
                  if (a.boxNumber != null) return -1;
                  if (b.boxNumber != null) return 1;
                  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                });
              return (
                <div key={cat.value} style={{ marginTop: catIdx > 0 ? 20 : 0 }}>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-c-text-3 uppercase tracking-[0.04em] mb-2">
                    <cat.icon size={14} color="var(--c-text-3)" />
                    <span>{cat.label === "Box" ? "Boxen" : cat.label === "Trolley" ? "Trolleys" : cat.label === "Kiste" ? "Kisten" : "Kartons"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {catBoxes.map((box) => (
                      <div key={box.id} className="bg-c-surface rounded-[14px] overflow-hidden">
                        <button className="block w-full px-2.5 py-3 bg-transparent border-none cursor-pointer text-left" onClick={() => navigate("BoxDetail", { box, place: group })}>
                          <div className="flex justify-between items-start mb-2">
                            {(() => { const Icon = BOX_CATEGORIES.find(c => c.value === box.type)?.icon ?? Package; return <Icon size={22} color={box.color ?? "#2C2926"} />; })()}
                            <div className="flex items-center gap-1.5">
                              {box.boxNumber != null && <span className="text-[10px] font-bold text-[#2C2926] bg-c-accent rounded-[6px] px-1.5 py-0.5">#{box.boxNumber}</span>}
                              <ChevronRight size={14} color="var(--c-text-4)" />
                            </div>
                          </div>
                          <div className="text-[13px] font-bold text-c-text-1 mb-0.5">{box.name}</div>
                          <div className="text-[11px] text-c-text-3">{box.description || cat.label}</div>
                          <div className="text-[11px] text-c-text-3 mt-0.5">
                            {boxItemCounts[box.id] ?? 0} Gegenstand{(boxItemCounts[box.id] ?? 0) !== 1 ? "e" : ""}
                          </div>
                        </button>
                        <div className="flex justify-end gap-0.5 px-1 pb-1.5">
                          {!isViewer && <button className="bg-transparent border-none cursor-pointer p-2 flex items-center min-w-[36px] min-h-[36px] justify-center" onClick={() => startEdit(box)}><Pencil size={13} color="var(--c-text-3)" /></button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      <button className="w-full flex items-center gap-3.5 bg-c-surface rounded-2xl p-4 border-none cursor-pointer text-left mt-2.5"
        onClick={() => navigate("UnboxedDetail", { space: group, from: "GroupDetail", fromParam: { group } })}>
        <div className="w-11 h-11 rounded-xl bg-c-accent flex items-center justify-center shrink-0"><Inbox size={20} color="#2C2926" /></div>
        <div className="flex-1">
          <div className="text-[15px] font-bold text-c-text-1">Ohne Box</div>
          <div className="text-xs text-c-text-3 mt-0.5">{unboxedCount} Gegenstand{unboxedCount !== 1 ? "e" : ""}</div>
        </div>
        <ChevronRight size={16} color="var(--c-text-4)" />
      </button>
    </>
  );
}
