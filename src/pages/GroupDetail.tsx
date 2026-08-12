import React, { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { UserPlus, Plus, Package, Users, Clock } from "lucide-react";
import type { NavigateFn, PageParams } from "../App";
import type { Space, SpaceMember } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useHeader } from "../contexts/HeaderContext";
import { subscribeToSpace } from "../services/spaces.service";
import InviteSheet from "./group/InviteSheet";
import BoxesTab from "./group/BoxesTab";
import MembersTab from "./group/MembersTab";
import HistoryTab from "./group/HistoryTab";

type Tab = "Boxen" | "Mitglieder" | "Verlauf";

interface GroupDetailProps {
  navigate: NavigateFn;
  params: PageParams<"GroupDetail">;
}

export default function GroupDetail({ navigate, params }: GroupDetailProps): React.ReactElement {
  const initialGroup = params.group;
  const { user } = useAuth();
  const { setHeader } = useHeader();

  const [group, setGroup] = useState<Space>(initialGroup);
  const [activeTab, setActiveTab] = useState<Tab>("Boxen");
  const [tabDir, setTabDir] = useState<"forward" | "back">("forward");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tabIndicatorLeft, setTabIndicatorLeft] = useState<number | null>(null);
  const [tabIndicatorWidth, setTabIndicatorWidth] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const tabs: Tab[] = ["Boxen", "Mitglieder", "Verlauf"];

  useEffect(() => {
    const idx = tabs.indexOf(activeTab);
    const el = tabRefs.current[idx];
    if (el) {
      setTabIndicatorLeft(el.offsetLeft);
      setTabIndicatorWidth(el.offsetWidth);
    }
  }, [activeTab]);

  const handleTabChange = (tab: Tab) => {
    const fromIdx = tabs.indexOf(activeTab);
    const toIdx = tabs.indexOf(tab);
    setTabDir(toIdx > fromIdx ? "forward" : "back");
    setActiveTab(tab);
  };

  useEffect(() => {
    if (!initialGroup?.id) return;
    return subscribeToSpace(initialGroup.id, (updated) => {
      if (updated) {
        setGroup(updated);
        setHeader({ title: updated.name, onBack: () => navigate("Groups") });
      }
    });
  }, [initialGroup?.id]);

  useEffect(() => {
    setHeader({ title: initialGroup?.name ?? "Lager", onBack: () => navigate("Groups") });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const members: SpaceMember[] = Object.values(group?.members ?? {});
  const currentMember = members.find((m) => m.userId === user?.uid);
  const isOwner = group?.ownerId === user?.uid || currentMember?.role === "admin";
  const isViewer = !isOwner && currentMember?.role === "viewer";

  return (
    <div style={styles.container}>
      {showInvite && (
        <InviteSheet groupId={group.id} isOwner={isOwner} onClose={() => setShowInvite(false)} />
      )}

      <div style={styles.groupHeader}>
        {!isViewer && (
          <div style={styles.actions}>
            <button style={styles.actionBtn} onClick={() => setShowInvite(true)}>
              <UserPlus size={13} color="var(--c-dark-btn-text)" /> Einladen
            </button>
            <button style={styles.primaryBtn} onClick={() => { setShowCreate(true); setActiveTab("Boxen"); }}>
              <Plus size={13} /> Neue Box
            </button>
          </div>
        )}
      </div>

      <div style={{ ...styles.tabRow, position: "relative" }}>
        {tabIndicatorLeft !== null && (
          <div style={{
            position: "absolute", top: 4, left: tabIndicatorLeft,
            width: tabIndicatorWidth, height: "calc(100% - 8px)",
            borderRadius: 9, background: "var(--c-bg)",
            transition: "left 0.32s cubic-bezier(0.34, 1.3, 0.64, 1), width 0.32s cubic-bezier(0.34, 1.3, 0.64, 1)",
            pointerEvents: "none", zIndex: 0,
          }} />
        )}
        {tabs.map((tab, idx) => (
          <button
            key={tab}
            ref={el => { tabRefs.current[idx] = el; }}
            style={{ ...styles.tab, position: "relative", zIndex: 1, ...(activeTab === tab ? { color: "var(--c-text-1)", fontWeight: 700 } : {}) }}
            onClick={() => handleTabChange(tab)}
          >
            {tab === "Boxen" ? <Package size={14} /> : tab === "Mitglieder" ? <Users size={14} /> : <Clock size={14} />}
            {tab}
          </button>
        ))}
      </div>

      <div key={activeTab} className={`tab-${tabDir}`}>
        {activeTab === "Boxen" && (
          <BoxesTab group={group} navigate={navigate} isViewer={isViewer}
            showCreate={showCreate} onShowCreateChange={setShowCreate} />
        )}
        {activeTab === "Mitglieder" && (
          <MembersTab groupId={group.id} members={members} isOwner={isOwner} currentUserId={user?.uid} />
        )}
        {activeTab === "Verlauf" && (
          <HistoryTab groupId={group.id} isViewer={isViewer} />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: { padding: "16px" },
  groupHeader: { marginBottom: 16 },
  actions: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 4 },
  actionBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 4, background: "var(--c-dark-btn)", border: "none", borderRadius: 10, padding: "8px 2px", fontSize: 11, fontWeight: 700, color: "var(--c-dark-btn-text)", cursor: "pointer", whiteSpace: "nowrap" as const, overflow: "hidden" as const },
  primaryBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 4, background: "#534D41", border: "none", borderRadius: 10, padding: "8px 2px", fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" as const, overflow: "hidden" as const },
  tabRow: { display: "flex", gap: 6, marginBottom: 16, background: "var(--c-surface-2)", borderRadius: 12, padding: 4 },
  tab: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, background: "none", border: "none", borderRadius: 9, padding: "9px 4px", fontSize: 14, fontWeight: 600, color: "var(--c-text-3)", cursor: "pointer" },
};
