import React, { useState, useEffect, useRef } from "react";
import clsx from "clsx";
import {
  FolderOpen, Folder,
  Plus, Upload, ChevronRight, ChevronLeft, X, Check,
  AlertTriangle,
} from "lucide-react";
import type { NavigateFn } from "../App";
import { api } from "../config/api";
import { useAuth } from "../contexts/AuthContext";
import { useHeader } from "../contexts/HeaderContext";
import {
  subscribeToFolderContents,
  createFolder, renameFolder, deleteFolder,
  uploadFile, deleteFile,
  type DocFolder, type DocFile,
} from "../services/documents.service";
import ImagePreview from "./dokumente/ImagePreview";
import FolderRow from "./dokumente/FolderRow";
import FileRow from "./dokumente/FileRow";

interface DokumenteProps {
  navigate: NavigateFn;
}

interface Breadcrumb { id: string | null; name: string; }

export default function Dokumente({ navigate: _navigate }: DokumenteProps): React.ReactElement {
  const { user } = useAuth();
  const { setHeader, clearHeader } = useHeader();

  const [folderId, setFolderId] = useState<string | null>(null);
  const [crumbs, setCrumbs] = useState<Breadcrumb[]>([{ id: null, name: "Dokumente" }]);
  const [animKey, setAnimKey]   = useState(0);
  const [animDir, setAnimDir]   = useState<"forward" | "back">("forward");

  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [files, setFiles] = useState<DocFile[]>([]);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const newFolderActiveRef = useRef(false);

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");

  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState<string | null>(null);
  const [deleteFileConfirm, setDeleteFileConfirm] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [spaceFolders, setSpaceFolders] = useState<(DocFolder & { space_name: string })[]>([]);
  const [sharedRootId, setSharedRootId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api.get<(DocFolder & { space_name: string })[]>('/documents/space-folders')
      .then(setSpaceFolders).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToFolderContents(user.uid, folderId, ({ folders, files }) => {
      setFolders(folders);
      setFiles(files);
    });
  }, [user, folderId]);

  useEffect(() => {
    if (crumbs.length > 1) {
      const current = crumbs[crumbs.length - 1];
      setHeader({
        title: current.name,
        onBack: () => goToCrumb(crumbs.length - 2),
      });
    } else {
      clearHeader();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crumbs]);

  useEffect(() => {
    if (!deleteFolderConfirm && !deleteFileConfirm) return;
    const t = setTimeout(() => {
      setDeleteFolderConfirm(null);
      setDeleteFileConfirm(null);
    }, 3000);
    return () => clearTimeout(t);
  }, [deleteFolderConfirm, deleteFileConfirm]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const enterFolder = (folder: DocFolder) => {
    newFolderActiveRef.current = false;
    setAnimDir("forward");
    setAnimKey((k) => k + 1);
    setFolderId(folder.id);
    setCrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    if (visibleSpaceFolders.some(sf => sf.id === folder.id)) setSharedRootId(folder.id);
    setEditingFolderId(null);
    setDeleteFolderConfirm(null);
    setDeleteFileConfirm(null);
    setShowNewFolder(false);
    setNewFolderName("");
  };

  const goToCrumb = (index: number) => {
    newFolderActiveRef.current = false;
    setAnimDir("back");
    setAnimKey((k) => k + 1);
    const crumb = crumbs[index];
    setFolderId(crumb.id);
    setCrumbs((prev) => prev.slice(0, index + 1));
    setShowNewFolder(false);
    setNewFolderName("");
  };

  // ── Folder actions ──────────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    if (!user || !newFolderName.trim() || creating || !newFolderActiveRef.current) return;
    newFolderActiveRef.current = false;
    const name = newFolderName.trim();
    const parentId = folderId;
    setCreating(true);
    setDeleteError(null);
    try {
      await createFolder(user.uid, name, parentId);
      setNewFolderName("");
      setShowNewFolder(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Ordner erstellen fehlgeschlagen");
      newFolderActiveRef.current = true;
    } finally {
      setCreating(false);
    }
  };

  const startRename = (folder: DocFolder) => {
    setEditingFolderId(folder.id);
    setEditFolderName(folder.name);
    setDeleteFolderConfirm(null);
  };

  const handleRename = async () => {
    if (!editingFolderId || !editFolderName.trim()) return;
    await renameFolder(editingFolderId, editFolderName.trim());
    setEditingFolderId(null);
  };

  const handleDeleteFolder = async (folder: DocFolder) => {
    if (deleteFolderConfirm !== folder.id) { setDeleteFolderConfirm(folder.id); return; }
    setDeleteFolderConfirm(null);
    setDeleteError(null);
    try {
      await deleteFolder(folder.id);
    } catch {
      setDeleteError(`Ordner „${folder.name}" konnte nicht gelöscht werden.`);
    }
  };

  // ── File actions ────────────────────────────────────────────────────────────

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    try {
      await uploadFile(user.uid, file, folderId, setUploadProgress);
    } catch {
      setUploadError("Upload fehlgeschlagen. Bitte versuche es erneut.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleOpenFile = async (file: DocFile) => {
    try {
      const filename = file.url.split('/').pop() ?? '';
      const blob = await api.blob(`/documents/serve/${filename}`);
      const objectUrl = URL.createObjectURL(blob);
      if (file.mimeType.startsWith("image/")) {
        setPreviewUrl(objectUrl);
      } else {
        const a = document.createElement('a');
        a.href = objectUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      }
    } catch {
      window.open(file.url, "_blank");
    }
  };

  const handleDeleteFile = async (file: DocFile) => {
    if (deleteFileConfirm !== file.id) { setDeleteFileConfirm(file.id); return; }
    setDeleteFileConfirm(null);
    setDeleteError(null);
    try {
      await deleteFile(file.id);
    } catch {
      setDeleteError(`Datei „${file.name}" konnte nicht gelöscht werden.`);
    }
  };

  const ownFolderIds = new Set(folders.map(f => f.id));
  const visibleSpaceFolders = folderId === null
    ? spaceFolders.filter(sf => !ownFolderIds.has(sf.id))
    : [];

  const isEmpty = folders.length === 0 && files.length === 0 && visibleSpaceFolders.length === 0;
  const isReadOnly = sharedRootId !== null && crumbs.some(c => c.id === sharedRootId);

  return (
    <div className="p-5 px-4 w-full box-border">

      {previewUrl && <ImagePreview url={previewUrl} onClose={() => setPreviewUrl(null)} />}

      {/* Action buttons */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex gap-2 mt-1.5 shrink-0">
          {!isReadOnly && (
            <button
              className="flex items-center gap-[5px] bg-c-dark-btn border-none rounded-[10px] py-[7px] px-2.5 cursor-pointer"
              onClick={() => { newFolderActiveRef.current = true; setShowNewFolder(true); setNewFolderName(""); }}
              title="Neuer Ordner"
            >
              <Plus size={15} color="var(--c-dark-btn-text)" />
              <span className="text-xs font-semibold text-c-dark-btn-text">Ordner</span>
            </button>
          )}
          {!isReadOnly && (
            <button
              className="flex items-center gap-[5px] bg-c-dark-btn border-none rounded-[10px] py-[7px] px-2.5 cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Datei hochladen"
            >
              <Upload size={15} color="var(--c-dark-btn-text)" />
              <span className="text-xs font-semibold text-c-dark-btn-text">Hochladen</span>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {/* Breadcrumbs */}
      {crumbs.length > 1 && (
        <div className="flex items-center gap-1 flex-wrap mb-3">
          {crumbs.map((crumb, i) => (
            <React.Fragment key={crumb.id ?? "root"}>
              {i > 0 && <ChevronRight size={11} color="var(--c-text-4)" />}
              <button
                className={clsx(
                  "bg-none border-none text-[13px] py-0.5 px-0",
                  i === crumbs.length - 1
                    ? "text-c-text-1 font-bold cursor-default"
                    : "text-c-text-3 font-medium cursor-pointer"
                )}
                onClick={() => i < crumbs.length - 1 && goToCrumb(i)}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex items-center gap-2.5 bg-c-surface rounded-[14px] py-[11px] px-3.5 mb-2 border-[1.5px] border-[#2C2926]">
          <Folder size={17} color="#2C2926" />
          <input
            className="flex-1 border-none outline-none text-sm bg-transparent text-c-text-1"
            placeholder="Ordnername…"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
              if (e.key === "Escape") { newFolderActiveRef.current = false; setShowNewFolder(false); }
            }}
            autoFocus
          />
          <button className="bg-none border-none cursor-pointer p-1 flex items-center rounded-md" onClick={() => { newFolderActiveRef.current = false; setShowNewFolder(false); }}>
            <X size={14} color="var(--c-text-3)" />
          </button>
          <button className="bg-none border-none cursor-pointer p-1 flex items-center rounded-md" onClick={handleCreateFolder} disabled={creating}>
            <Check size={14} color="#2C2926" />
          </button>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="relative h-[34px] bg-c-surface rounded-[10px] overflow-hidden mb-2.5 flex items-center">
          <div className="absolute left-0 top-0 bottom-0 bg-[#2C2926] transition-[width] duration-200 ease-out" style={{ width: `${uploadProgress}%` }} />
          <span className="relative text-xs font-semibold text-c-text-1 px-3.5">Hochladen… {Math.round(uploadProgress)}%</span>
        </div>
      )}

      {/* Error banners */}
      {deleteError && (
        <div className="flex items-center gap-2 bg-[#fef2f2] border border-[#fecaca] rounded-[10px] py-2.5 px-3 mb-2.5 text-[13px] text-[#dc2626]">
          <AlertTriangle size={14} color="#dc2626" />
          <span>{deleteError}</span>
          <button className="bg-none border-none cursor-pointer p-1 flex items-center rounded-md" onClick={() => setDeleteError(null)}>
            <X size={13} color="#dc2626" />
          </button>
        </div>
      )}
      {uploadError && (
        <div className="flex items-center gap-2 bg-[#fef2f2] border border-[#fecaca] rounded-[10px] py-2.5 px-3 mb-2.5 text-[13px] text-[#dc2626]">
          <AlertTriangle size={14} color="#dc2626" />
          <span>{uploadError}</span>
          <button className="bg-none border-none cursor-pointer p-1 flex items-center rounded-md" onClick={() => setUploadError(null)}>
            <X size={13} color="#dc2626" />
          </button>
        </div>
      )}

      {/* Animated content */}
      <div key={animKey} className={`page-${animDir}`}>

      {isEmpty && !showNewFolder ? (
        <div className="flex flex-col items-center py-[60px] px-5 gap-2 text-center">
          <FolderOpen size={44} color="var(--c-border)" />
          <p className="text-base font-bold text-c-text-2 m-0">Noch leer</p>
          <p className="text-[13px] text-c-text-3 max-w-[240px] m-0">Erstelle einen Ordner oder lade eine Datei hoch.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">

          {/* Space-linked folders */}
          {visibleSpaceFolders.length > 0 && (
            <>
              <div className="text-[11px] font-bold text-c-text-3 tracking-[0.06em] pt-2 pb-1 uppercase">Lager-Ordner</div>
              {visibleSpaceFolders.map((sf) => (
                <div key={sf.id} className="flex items-center bg-c-surface rounded-[14px] overflow-hidden min-h-[56px]">
                  <button className="flex-1 flex items-center gap-3 py-3 px-3.5 bg-none border-none cursor-pointer text-left min-w-0" onClick={() => enterFolder(sf)}>
                    <div className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center shrink-0" style={{ background: "var(--c-accent-bg)" }}>
                      <FolderOpen size={19} color="#2C2926" />
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="flex-1 text-sm font-semibold text-c-text-1 overflow-hidden text-ellipsis whitespace-nowrap">{sf.name}</span>
                      <span className="text-[11px] text-c-text-3">{sf.space_name}</span>
                    </div>
                    <ChevronRight size={15} color="var(--c-text-4)" className="shrink-0" />
                  </button>
                </div>
              ))}
              {(folders.length > 0 || files.length > 0) && <div className="h-px bg-c-border-2 my-1" />}
            </>
          )}

          {/* Folders */}
          {folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              isReadOnly={isReadOnly}
              editingFolderId={editingFolderId}
              editFolderName={editFolderName}
              deleteFolderConfirm={deleteFolderConfirm}
              onEnter={enterFolder}
              onStartRename={startRename}
              onEditNameChange={setEditFolderName}
              onRename={handleRename}
              onCancelRename={() => setEditingFolderId(null)}
              onDelete={handleDeleteFolder}
            />
          ))}

          {folders.length > 0 && files.length > 0 && <div className="h-px bg-c-border-2 my-1" />}

          {/* Files */}
          {files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              isReadOnly={isReadOnly}
              deleteFileConfirm={deleteFileConfirm}
              onOpen={handleOpenFile}
              onDelete={handleDeleteFile}
            />
          ))}
        </div>
      )}

      {crumbs.length > 1 && (
        <button className="flex items-center gap-1.5 bg-none border-none cursor-pointer text-[13px] font-semibold text-c-text-2 mt-5 p-0" onClick={() => goToCrumb(crumbs.length - 2)}>
          <ChevronLeft size={15} color="var(--c-text-2)" />
          Zurück zu „{crumbs[crumbs.length - 2].name}"
        </button>
      )}

      </div>
    </div>
  );
}
