import React, { useState } from "react";
import type { CSSProperties } from "react";
import { Trash2 } from "lucide-react";
import type { SpaceMember, UserRole } from "../../types";
import { removeMember, updateMemberRole } from "../../services/spaces.service";
import { getInitials } from "../../utils/stringUtils";

interface MembersTabProps {
  groupId: string;
  members: SpaceMember[];
  isOwner: boolean;
  currentUserId: string | undefined;
}

export default function MembersTab({ groupId, members, isOwner, currentUserId }: MembersTabProps): React.ReactElement {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removingError, setRemovingError] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const handleRemoveMember = async (userId: string) => {
    if (!isOwner) return;
    setRemovingError(null);
    try {
      await removeMember(groupId, userId);
    } catch (e) {
      setRemovingError(e instanceof Error ? e.message : "Fehler beim Entfernen.");
    } finally {
      setRemovingId(null);
    }
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    setUpdatingRoleId(userId);
    try {
      await updateMemberRole(groupId, userId, role);
    } finally {
      setUpdatingRoleId(null);
    }
  };

  if (members.length === 0) {
    return (
      <div style={s.empty}><p style={s.emptyText}>Noch keine Mitglieder</p></div>
    );
  }

  return (
    <div style={s.list}>
      {members.map((m) => {
        const initials = getInitials(m.displayName);
        const isCurrentUser = m.userId === currentUserId;
        const isMemberAdmin = m.role === "admin";
        const canManage = isOwner && !isCurrentUser;
        const isConfirmingRemove = removingId === m.userId;
        const isUpdatingRole = updatingRoleId === m.userId;
        const roleLabel = m.role === "admin" ? "Administrator" : m.role === "editor" ? "Mitarbeiter" : "Beobachter";

        return (
          <div key={m.userId} style={s.item}>
            <div style={s.avatar}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.name}>
                {m.displayName || m.email}
                {isCurrentUser && <span style={s.youBadge}>Du</span>}
              </div>
              <div style={s.email}>{m.email}</div>
            </div>

            {canManage ? (
              isConfirmingRemove ? (
                <div style={s.removeConfirm}>
                  <span style={s.removeQuestion}>Entfernen?</span>
                  <button style={s.confirmRemoveBtn} onClick={() => handleRemoveMember(m.userId)}>Ja</button>
                  <button style={s.cancelSmallBtn} onClick={() => setRemovingId(null)}>Nein</button>
                </div>
              ) : (
                <div style={s.actions}>
                  <select
                    style={{ ...s.roleSelect, opacity: isUpdatingRole ? 0.5 : 1 }}
                    value={m.role}
                    disabled={isUpdatingRole || isMemberAdmin}
                    onChange={(e) => handleRoleChange(m.userId, e.target.value as UserRole)}
                  >
                    <option value="admin">Administrator</option>
                    <option value="editor">Mitarbeiter</option>
                    <option value="viewer">Beobachter</option>
                  </select>
                  {!isMemberAdmin && (
                    <button style={s.removeBtn} onClick={() => setRemovingId(m.userId)} title="Mitglied entfernen">
                      <Trash2 size={15} color="#ef4444" />
                    </button>
                  )}
                </div>
              )
            ) : (
              <span style={s.roleBadge}>{roleLabel}</span>
            )}
          </div>
        );
      })}
      {removingError && (
        <div style={{ padding: "8px 14px", fontSize: 13, color: "#ef4444", background: "#fef2f2", borderRadius: 10, margin: "8px 0" }}>
          {removingError}
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  list: { display: "flex", flexDirection: "column", gap: 10 },
  empty: { textAlign: "center", padding: "48px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
  emptyText: { fontSize: 14, color: "var(--c-text-3)" },
  item: { display: "flex", alignItems: "center", gap: 12, background: "var(--c-surface)", borderRadius: 14, padding: 14 },
  avatar: { width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #2C2926, #2C2926)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 },
  name: { fontSize: 14, fontWeight: 600, color: "var(--c-text-1)", display: "flex", alignItems: "center", gap: 6 },
  email: { fontSize: 12, color: "var(--c-text-3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  youBadge: { fontSize: 10, fontWeight: 700, color: "#2C2926", background: "var(--c-accent-bg)", borderRadius: 6, padding: "1px 6px" },
  roleBadge: { flexShrink: 0, background: "var(--c-surface-2)", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "var(--c-text-2)" },
  actions: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 },
  roleSelect: { border: "1px solid var(--c-border)", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontWeight: 600, color: "var(--c-text-1)", background: "var(--c-surface-2)", cursor: "pointer", outline: "none", minHeight: 40 },
  removeBtn: { background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", alignItems: "center", borderRadius: 8 },
  removeConfirm: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 },
  removeQuestion: { fontSize: 12, fontWeight: 600, color: "#ef4444" },
  confirmRemoveBtn: { background: "#ef4444", border: "none", borderRadius: 7, padding: "5px 10px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" },
  cancelSmallBtn: { background: "var(--c-surface-2)", border: "none", borderRadius: 7, padding: "5px 10px", fontSize: 12, fontWeight: 600, color: "var(--c-text-2)", cursor: "pointer" },
};
