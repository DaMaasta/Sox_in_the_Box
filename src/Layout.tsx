import React, { useState, useEffect, useRef } from "react";
import clsx from "clsx";
import { FolderOpen, MapPin, ShoppingCart, Search, Settings, Bell, X, ChevronLeft, WifiOff } from "lucide-react";
import { getInitials } from "./utils/stringUtils";
import BottomSheet from "./components/BottomSheet";
import type { NavigateFn, PageName } from "./App";
import { useAuth } from "./contexts/AuthContext";
import { useCart } from "./contexts/CartContext";
import { useHeader } from "./contexts/HeaderContext";
import { setErrorHandler } from "./utils/errorBus";

import { subscribeToUnreadNotifications, markAllNotificationsRead, getNotificationsEnabled, subscribeToPush } from "./services/notifications.service";
import type { AppNotification } from "./types";

interface NavItem {
  name: string;
  icon: React.ElementType;
  page: PageName;
  label: string;
  highlight?: boolean;
}

const navItems: NavItem[] = [
  { name: "Dokumente",  icon: FolderOpen,   page: "Dokumente",  label: "Dokumente" },
  { name: "Lager",     icon: MapPin,       page: "Groups",     label: "Lager" },
  { name: "Warenkorb", icon: ShoppingCart, page: "Cart",       label: "Warenkorb", highlight: true },
  { name: "Suche",     icon: Search,       page: "SearchPage", label: "Suche" },
  { name: "Settings",  icon: Settings,     page: "Settings",   label: "Einstellung" },
];


interface LayoutProps {
  children: React.ReactNode;
  currentPageName: PageName;
  navigate: NavigateFn;
}

export default function Layout({ children, currentPageName, navigate }: LayoutProps): React.ReactElement {
  const { user } = useAuth();
  const { items } = useCart();
  const { headerState } = useHeader();
  const cartCount = items.length;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [bellRinging, setBellRinging] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const pillTitleRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(64);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setErrorHandler((msg) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast(msg);
      toastTimer.current = setTimeout(() => setToast(null), 4000);
    });
    return () => setErrorHandler(() => {});
  }, []);

  const ROOT_PAGES = new Set(["Groups", "Cart", "SearchPage", "Settings"]);
  const showLogo = ROOT_PAGES.has(currentPageName) || !headerState?.title;

  // Synchronous width: ~10px per char + 62px overhead (back btn + padding)
  const pillWidth = showLogo
    ? 44
    : Math.min(62 + (headerState?.title?.length ?? 0) * 10, 280);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPageName]);

  useEffect(() => {
    if (!headerRef.current) return;
    const el = headerRef.current;
    const observer = new ResizeObserver(() => {
      const height = el.getBoundingClientRect().height;
      setHeaderHeight(height);
      document.documentElement.style.setProperty('--header-height', `${height}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (getNotificationsEnabled() && Notification.permission === 'granted') {
      subscribeToPush();
    }
    return subscribeToUnreadNotifications(user.uid, setNotifications);
  }, [user?.uid]);


  const handleMarkAllRead = async () => {
    if (!user) return;
    await markAllNotificationsRead(user.uid);
    setShowNotifs(false);
  };

  const handleNotifClick = (_notif: AppNotification) => {
    setShowNotifs(false);
    navigate("Groups");
  };


  const unreadCount = notifications.length;

  return (
    <div className="app-shell">
      {/* Header */}
      <header ref={headerRef} className="app-header flex items-center justify-between px-4 pt-[max(10px,env(safe-area-inset-top))] pb-2.5 bg-c-surface shrink-0">
        <div className="flex items-center flex-1 min-w-0">
          <div
            className={clsx("header-pill", !showLogo && "header-pill-expanded")}
            style={{ width: pillWidth }}
          >
            <button
              className="header-pill-logo-slot"
              onClick={() => navigate("Settings")}
              tabIndex={showLogo ? 0 : -1}
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-11 h-11 rounded-full block object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-11 h-11 rounded-full bg-[#534D41] text-white flex items-center justify-center text-[15px] font-bold shrink-0">
                  {getInitials(user?.displayName ?? user?.email ?? "?")}
                </div>
              )}
            </button>
            <div ref={pillTitleRef} className="header-pill-title-slot">
              {headerState?.onBack && (
                <button className="bg-transparent border-none cursor-pointer px-0.5 py-0 flex items-center shrink-0" onClick={headerState.onBack}>
                  <ChevronLeft size={20} color="#ffffff" />
                </button>
              )}
              <span className="text-base font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis">{headerState?.title ?? ""}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Notification Bell */}
          <div className="relative">
            <button
              ref={bellRef}
              className={clsx(
                "relative bg-c-surface border-none cursor-pointer w-11 h-11 flex items-center justify-center rounded-full",
                "bell-btn",
                bellRinging && "bell-ringing"
              )}
              onClick={() => {
                setShowNotifs((v) => !v);
                setBellRinging(true);
                setTimeout(() => setBellRinging(false), 900);
              }}
              aria-label="Benachrichtigungen"
            >
              <Bell size={20} color={unreadCount > 0 ? "#2C2926" : "var(--c-text-3)"} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 bg-[#ef4444] text-white text-[9px] font-bold min-w-[16px] h-4 rounded-lg flex items-center justify-center px-[3px] border-2 border-c-surface leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

          </div>

        </div>
      </header>

      {/* Content */}
      <main className="app-main" style={{ marginTop: headerHeight }}>
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPageName === item.page ||
            (item.page === "Groups" && (currentPageName === "GroupDetail" || currentPageName === "BoxDetail" || currentPageName === "UnboxedDetail"));
          return (
            <button
              key={item.name}
              className={clsx("bnav-btn", isActive && "active")}
              onClick={() => navigate(item.page)}
            >
              <div className="bnav-icon">
                <Icon size={22} />
                {item.highlight && cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#ef4444] w-2.5 h-2.5 rounded-full border-2 border-c-surface" />
                )}
              </div>
              <span className="bnav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {toast && (
        <div
          className="fixed bottom-[100px] left-4 right-4 max-w-[468px] mx-auto flex items-center gap-2 bg-[#fef2f2] border border-[#fecaca] rounded-xl px-4 py-3 text-[13px] text-[#dc2626] font-medium z-[200] cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.1)] animate-[pageFadeUp_0.28s_cubic-bezier(0.22,1,0.36,1)_both]"
          onClick={() => setToast(null)}
        >
          <WifiOff size={14} color="#dc2626" />
          <span>{toast}</span>
        </div>
      )}

      {showNotifs && (
        <BottomSheet onClose={() => setShowNotifs(false)}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-c-text-1">Benachrichtigungen</span>
            <button className="bg-transparent border-none cursor-pointer flex p-0.5" onClick={() => setShowNotifs(false)}>
              <X size={18} color="var(--c-text-3)" />
            </button>
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-[13px] text-c-text-3 text-center">Keine neuen Benachrichtigungen</div>
          ) : (
            <>
              <div className="max-h-[280px] overflow-y-auto">
                {notifications.map((n) => (
                  <button key={n.id} className="w-full flex items-start gap-2.5 px-4 py-3 bg-transparent border-none cursor-pointer text-left border-b border-c-border-2" onClick={() => handleNotifClick(n)}>
                    <div className="w-2 h-2 rounded-full bg-[#2C2926] mt-1 shrink-0" />
                    <div className="flex flex-col gap-0.5 flex-1">
                      <span className="text-[13px] text-c-text-1 leading-[1.4]">{n.message}</span>
                      <span className="text-[11px] text-c-text-3">
                        {n.createdAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
                        {" · "}{n.createdAt.toLocaleDateString("de-DE", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <button className="w-full bg-transparent border-none cursor-pointer px-4 py-3 text-[13px] font-semibold text-[#2C2926] text-center" onClick={handleMarkAllRead}>
                Alle als gelesen markieren
              </button>
            </>
          )}
        </BottomSheet>
      )}
    </div>
  );
}
