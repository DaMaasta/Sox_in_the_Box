import React, { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { UserPlus, X, QrCode, Copy, ExternalLink, Mail } from "lucide-react";
import QRCodeLib from "qrcode";
import BottomSheet from "../../components/BottomSheet";
import { addMember } from "../../services/spaces.service";

interface InviteSheetProps {
  groupId: string;
  isOwner: boolean;
  onClose: () => void;
}

export default function InviteSheet({ groupId, isOwner, onClose }: InviteSheetProps): React.ReactElement {
  const [inviteTab, setInviteTab] = useState<"qr" | "email">("qr");
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteList, setInviteList] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const inviteInputRef = useRef<HTMLInputElement>(null);

  const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${groupId}`;

  useEffect(() => {
    if (inviteTab !== "qr" || !qrCanvasRef.current) return;
    QRCodeLib.toCanvas(qrCanvasRef.current, inviteUrl, {
      width: 160, margin: 1,
      color: { dark: "#2d3a52", light: "#e0e5ec" },
    });
  }, [inviteTab, inviteUrl]);

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addEmailToList = () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (inviteList.includes(email)) { setInviteEmail(""); return; }
    setInviteList((prev) => [...prev, email]);
    setInviteEmail("");
    setInviteError("");
    setTimeout(() => inviteInputRef.current?.focus(), 0);
  };

  const handleInvite = async () => {
    if (inviteList.length === 0 || inviting || !isOwner) return;
    setInviting(true);
    setInviteError("");
    try {
      await Promise.all(inviteList.map((email) => addMember(groupId, email, email, email, "viewer")));
      setInviteList([]);
      onClose();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Fehler beim Einladen.");
    } finally {
      setInviting(false);
    }
  };

  return (
    <BottomSheet onClose={onClose}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.headerIcon}><UserPlus size={16} color="#2C2926" /></div>
          <span style={s.title}>Einladen</span>
        </div>
        <button style={s.close} onClick={onClose}><X size={18} color="#94a3b8" /></button>
      </div>

      <div style={s.tabRow}>
        <button style={{ ...s.tabBtn, ...(inviteTab === "qr" ? s.tabActive : {}) }} onClick={() => setInviteTab("qr")}>
          <QrCode size={14} /> QR-Code
        </button>
        <button style={{ ...s.tabBtn, ...(inviteTab === "email" ? s.tabActive : {}) }} onClick={() => setInviteTab("email")}>
          <Mail size={14} /> E-Mail
        </button>
      </div>

      {inviteTab === "qr" ? (
        <>
          <p style={s.sub}>QR-Code scannen oder Link teilen.</p>
          <div style={s.qrBox}><canvas ref={qrCanvasRef} style={{ borderRadius: 12 }} /></div>
          <div style={s.linkRow}><span style={s.linkText} title={inviteUrl}>{inviteUrl}</span></div>
          <div style={s.actions}>
            <button style={s.copyBtn} onClick={handleCopyLink}>
              <Copy size={14} /> {copied ? "Kopiert!" : "Link kopieren"}
            </button>
            <button style={s.openBtn} onClick={() => window.open(inviteUrl, "_blank")}>
              <ExternalLink size={14} /> Öffnen
            </button>
          </div>
        </>
      ) : (
        <>
          <label style={s.label}>E-Mail-Adressen</label>
          <div style={s.inputRow}>
            <input ref={inviteInputRef} style={s.input} type="email" placeholder="name@email.de"
              value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEmailToList()} />
            <button style={s.addBtn} onClick={addEmailToList} type="button">
              <Mail size={16} color={inviteEmail.includes("@") ? "#2C2926" : "#cbd5e1"} />
            </button>
          </div>
          {inviteList.length > 0 && (
            <div style={s.chipRow}>
              {inviteList.map((email) => (
                <div key={email} style={s.chip}>
                  <span style={s.chipText}>{email}</span>
                  <button style={s.chipRemove} onClick={() => setInviteList((p) => p.filter((e) => e !== email))}><X size={11} color="#2C2926" /></button>
                </div>
              ))}
            </div>
          )}
          {inviteError && <div style={s.error}>{inviteError}</div>}
          <div style={s.bottomActions}>
            <button style={s.cancelBtn} onClick={onClose}>Abbrechen</button>
            <button style={{ ...s.confirmBtn, opacity: inviteList.length === 0 || inviting ? 0.5 : 1 }}
              onClick={handleInvite} disabled={inviteList.length === 0 || inviting}>
              {inviting ? "Lädt…" : `${inviteList.length} einladen`}
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}

const s: Record<string, CSSProperties> = {
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { display: "flex", alignItems: "center", gap: 8 },
  headerIcon: { width: 28, height: 28, background: "var(--c-accent-bg)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: 800, color: "var(--c-text-1)" },
  close: { background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2 },
  tabRow: { display: "flex", gap: 8, background: "var(--c-bg)", borderRadius: 12, padding: 4 },
  tabBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", border: "none", borderRadius: 9, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "var(--c-text-3)", cursor: "pointer", transition: "all 0.18s" },
  tabActive: { background: "var(--c-surface)", color: "#2C2926" },
  sub: { fontSize: 12, color: "var(--c-text-3)", lineHeight: 1.4, margin: 0 },
  qrBox: { display: "flex", justifyContent: "center", background: "var(--c-bg)", borderRadius: 14, padding: 10 },
  linkRow: { background: "var(--c-bg)", borderRadius: 10, padding: "6px 10px" },
  linkText: { fontSize: 10, color: "var(--c-text-3)", wordBreak: "break-all" as const, display: "block" },
  actions: { display: "flex", gap: 8 },
  copyBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "linear-gradient(135deg, #2C2926, #2C2926)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  openBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--c-bg)", color: "var(--c-text-1)", border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  label: { fontSize: 12, fontWeight: 600, color: "var(--c-text-2)" },
  inputRow: { display: "flex", alignItems: "center", borderRadius: 12, overflow: "hidden", background: "var(--c-bg)" },
  input: { flex: 1, border: "none", outline: "none", padding: "10px 12px", fontSize: 14, color: "var(--c-text-1)", background: "transparent" },
  addBtn: { padding: "0 12px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", height: "100%" },
  chipRow: { display: "flex", flexWrap: "wrap" as const, gap: 6 },
  chip: { display: "flex", alignItems: "center", gap: 4, background: "var(--c-accent-bg)", borderRadius: 20, padding: "4px 10px 4px 12px" },
  chipText: { fontSize: 12, color: "#c2410c", fontWeight: 500 },
  chipRemove: { background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 1 },
  error: { background: "#fef2f2", borderRadius: 10, padding: "6px 10px", fontSize: 12, color: "#dc2626" },
  bottomActions: { display: "flex", gap: 8, marginTop: 2 },
  cancelBtn: { flex: 1, background: "var(--c-bg)", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 13, fontWeight: 600, color: "var(--c-text-1)", cursor: "pointer" },
  confirmBtn: { flex: 1, background: "linear-gradient(135deg, #2C2926, #2C2926)", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" },
};
