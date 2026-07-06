import React, { useState, useEffect, useRef } from "react";
import Layout from "./Layout";
import Dokumente from "./pages/Dokumente";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import BoxDetail from "./pages/BoxDetail";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import SearchPage from "./pages/SearchPage";
import Settings from "./pages/Settings";
import AccountSettings from "./pages/AccountSettings";

import LoginPage from "./pages/LoginPage";
import WelcomePage from "./pages/WelcomePage";
import UnboxedDetail from "./pages/UnboxedDetail";
import ItemView from "./pages/ItemView";
import ErrorBoundary from "./components/ErrorBoundary";
import BoxLoader from "./components/BoxLoader";
import { useAuth } from "./contexts/AuthContext";
import { getSpace, joinGroup } from "./services/spaces.service";
import type { Space, Product } from "./types";

export type PageParamsMap = {
  Groups: Record<string, never>;
  Dokumente: Record<string, never>;
  Cart: Record<string, never>;
  SearchPage: Record<string, never>;
  Settings: Record<string, never>;
  AccountSettings: Record<string, never>;
  GroupDetail: { group: Space };
  BoxDetail: { box: Space; place?: Space | null };
  UnboxedDetail: { space: Space; from?: string; fromParam?: PageParamsMap[keyof PageParamsMap] };
  ProductDetail: { product: Product; box: Space; place?: Space | null; from?: string };
  ItemView: { product: Product; box: Space; parent?: Space; from?: string };
};

export type PageName = keyof PageParamsMap;

export type NavigateFn = <P extends PageName>(
  page: P,
  ...args: Record<string, never> extends PageParamsMap[P] ? [params?: PageParamsMap[P]] : [params: PageParamsMap[P]]
) => void;

export type PageParams<P extends PageName = PageName> = PageParamsMap[P];

type NavDirection = "forward" | "back" | "lateral";

const PAGE_DEPTH: Record<PageName, number> = {
  Groups:          0,
  Dokumente:       1,
  Cart:            1,
  SearchPage:      1,
  Settings:        1,
  GroupDetail:     2,
  AccountSettings:  2,
  UnboxedDetail:   3,
  BoxDetail:       3,
  ProductDetail:   4,
  ItemView:        4,
};

const TAB_PAGES = new Set<PageName>(["Groups", "Dokumente", "Cart", "SearchPage", "Settings"]);
const TAB_ORDER: PageName[] = ["Dokumente", "Groups", "Cart", "SearchPage", "Settings"];

const HASH_TO_PAGE: Record<string, PageName> = {
  "":            "Groups",
  "lager":       "Groups",
  "dokumente":   "Dokumente",
  "warenkorb":   "Cart",
  "suche":       "SearchPage",
  "einstellungen": "Settings",
  "konto":       "AccountSettings",
};

const PAGE_TO_HASH: Partial<Record<PageName, string>> = {
  Groups:          "lager",
  Dokumente:       "dokumente",
  Cart:            "warenkorb",
  SearchPage:      "suche",
  Settings:        "einstellungen",
  AccountSettings: "konto",
};

function parseHash(): { page: PageName; groupId?: string } {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [segment, id] = raw.split("/");
  if (segment === "group" && id) return { page: "GroupDetail", groupId: id };
  return { page: HASH_TO_PAGE[segment] ?? "Groups" };
}

function getPendingInvite(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("invite");
}

function clearInviteParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  window.history.replaceState(window.history.state, "", url.toString());
}

function getInitialPage(): PageName {
  return parseHash().page;
}

export default function App(): React.ReactElement {
  const { user, loading } = useAuth();
  const [gatePassed, setGatePassed] = useState(() => localStorage.getItem("kistle_gate") === "1");
  const [currentPage, setCurrentPage] = useState<PageName>(getInitialPage);
  const [pageParams, setPageParams]   = useState<PageParamsMap[PageName]>({} as PageParamsMap[PageName]);
  const [navDir, setNavDir]           = useState<NavDirection>("lateral");
  const [pendingInvite] = useState<string | null>(getPendingInvite);
  const [updateReady, setUpdateReady] = useState(false);
  const [minSplashDone, setMinSplashDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateReady(true);
          }
        });
      });
    });
  }, []);

  // Stable ref so the popstate handler always sees the current page without re-registering
  const currentPageRef = useRef<PageName>(currentPage);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  // Resolve deep-link for GroupDetail on app start
  useEffect(() => {
    const { page, groupId } = parseHash();
    window.history.replaceState({ page, params: {} }, "");
    if (page === "GroupDetail" && groupId && user) {
      getSpace(groupId).then((group) => {
        if (group) {
          setPageParams({ group });
          setCurrentPage("GroupDetail");
        } else {
          setCurrentPage("Groups");
          window.history.replaceState({ page: "Groups", params: {} }, "", "#/lager");
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Browser back / forward button support
  useEffect(() => {
    const handlePop = (e: PopStateEvent) => {
      const toPage = (e.state?.page as PageName) ?? parseHash().page;
      const params = (e.state?.params ?? {}) as PageParamsMap[PageName];
      const fromDepth = PAGE_DEPTH[currentPageRef.current] ?? 0;
      const toDepth   = PAGE_DEPTH[toPage] ?? 0;
      setNavDir(toDepth < fromDepth ? "back" : toDepth > fromDepth ? "forward" : "lateral");
      setCurrentPage(toPage);
      setPageParams(params);
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  // Invite-Link handling — always clear the URL param, whether the space exists or not
  useEffect(() => {
    if (!user || !pendingInvite) return;
    joinGroup(pendingInvite, user.uid, user.email ?? "", user.displayName ?? "")
      .catch(() => { /* already member or error — continue anyway */ })
      .then(() => getSpace(pendingInvite))
      .then((group) => {
        clearInviteParam();
        if (group) {
          window.history.pushState({ page: "GroupDetail", params: { group } }, "");
          setNavDir("forward");
          setCurrentPage("GroupDetail");
          setPageParams({ group });
        }
      })
      .catch(() => { clearInviteParam(); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pendingInvite]);

  if (loading || !minSplashDone) {
    return (
      <div className="loading-screen">
        <BoxLoader />
      </div>
    );
  }

  if (!gatePassed) return <WelcomePage onSuccess={() => { localStorage.setItem("kistle_gate", "1"); setGatePassed(true); }} />;
  if (!user) return <LoginPage />;

  const navigate: NavigateFn = (page, ...args) => {
    const params = args[0] ?? ({} as PageParamsMap[typeof page]);
    const from = PAGE_DEPTH[currentPage] ?? 0;
    const to   = PAGE_DEPTH[page] ?? 0;
    const isTabSwitch = TAB_PAGES.has(currentPage) && TAB_PAGES.has(page);
    const fromTabIdx = TAB_ORDER.indexOf(currentPage);
    const toTabIdx   = TAB_ORDER.indexOf(page);
    const dir: NavDirection = isTabSwitch
      ? (toTabIdx > fromTabIdx ? "forward" : toTabIdx < fromTabIdx ? "back" : "lateral")
      : to > from ? "forward" : to < from ? "back" : "lateral";
    setNavDir(dir);
    setCurrentPage(page);
    setPageParams(params);
    const groupId = page === "GroupDetail" ? (params as PageParamsMap["GroupDetail"]).group?.id : undefined;
    const hash = page === "GroupDetail" && groupId
      ? `#/group/${groupId}`
      : `#/${PAGE_TO_HASH[page] ?? "lager"}`;
    window.history.pushState({ page, params }, "", hash);
  };

  const renderPage = (): React.ReactElement => {
    const p = pageParams;
    switch (currentPage) {
      case "Dokumente":      return <Dokumente navigate={navigate} />;
      case "Groups":         return <Groups navigate={navigate} />;
      case "Cart":           return <Cart navigate={navigate} />;
      case "SearchPage":     return <SearchPage navigate={navigate} />;
      case "Settings":       return <Settings navigate={navigate} />;
      case "AccountSettings": return <AccountSettings navigate={navigate} />;
      case "GroupDetail":    return <GroupDetail navigate={navigate} params={p as PageParamsMap["GroupDetail"]} />;
      case "BoxDetail":      return <BoxDetail navigate={navigate} params={p as PageParamsMap["BoxDetail"]} />;
      case "UnboxedDetail":  return <UnboxedDetail navigate={navigate} params={p as PageParamsMap["UnboxedDetail"]} />;
      case "ProductDetail":  return <ProductDetail navigate={navigate} params={p as PageParamsMap["ProductDetail"]} />;
      case "ItemView":       return <ItemView navigate={navigate} params={p as PageParamsMap["ItemView"]} />;
      default:               return <Groups navigate={navigate} />;
    }
  };

  return (
    <>
      {updateReady && (
        <div
          className="fixed top-0 left-0 right-0 z-[9999] bg-[#2C2926] text-white px-4 pt-[calc(10px+env(safe-area-inset-top))] pb-2.5 text-center text-[13px] font-semibold cursor-pointer"
          onClick={() => window.location.reload()}
        >
          Neue Version verfügbar – Tippen zum Aktualisieren
        </div>
      )}
      <Layout currentPageName={currentPage} navigate={navigate}>
        <ErrorBoundary onReset={() => navigate("Groups")}>
          <div key={currentPage} className={`page-${navDir}`}>
            {renderPage()}
          </div>
        </ErrorBoundary>
      </Layout>
    </>
  );
}

