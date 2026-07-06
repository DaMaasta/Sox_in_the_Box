import React, { useState, useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import { Search, Package, ShoppingCart } from "lucide-react";
import type { NavigateFn } from "../App";
import type { Product, Space } from "../types";
import { subscribeToProductsInSpaces } from "../services/products.service";
import { subscribeToUserSpaces, subscribeToSpacesByParentIds } from "../services/spaces.service";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import QuantityModal from "../components/QuantityModal";

interface SearchPageProps {
  navigate: NavigateFn;
}

const COLOR_NAMES: Record<string, string> = {
  "#2C2926": "orange",
  "#ef4444": "rot",
  "#eab308": "gelb",
  "#22c55e": "grün",
  "#14b8a6": "türkis",
  "#3b82f6": "blau",
  "#8b5cf6": "lila",
  "#ec4899": "pink",
};

export default function SearchPage({ navigate }: SearchPageProps): React.ReactElement {
  const { user } = useAuth();
  const { addToCart, items: cartItems } = useCart();
  const [query, setQuery]     = useState("");
  const [userGroups, setUserGroups] = useState<Space[]>([]);
  const [boxes, setBoxes]     = useState<Space[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [modalProduct, setModalProduct] = useState<{ product: Product; box: Space; parent: Space | undefined } | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToUserSpaces(user.uid, (spaces) => {
      setUserGroups(spaces.filter((s) => s.isGroup));
    });
  }, [user]);

  const groupIds = useMemo(() => userGroups.map((g) => g.id), [userGroups]);
  const groupIdsKey = groupIds.join(",");
  useEffect(() => {
    if (groupIds.length === 0) { setBoxes([]); return; }
    return subscribeToSpacesByParentIds(groupIds, setBoxes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIdsKey]);

  const allSpaceIds = useMemo(() => [...groupIds, ...boxes.map((b) => b.id)], [groupIds, boxes]);
  const allSpaceIdsKey = allSpaceIds.join(",");
  useEffect(() => {
    if (allSpaceIds.length === 0) { setProducts([]); return; }
    return subscribeToProductsInSpaces(allSpaceIds, setProducts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSpaceIdsKey]);

  const spaceMap = useMemo(() => {
    const map = new Map<string, Space>();
    userGroups.forEach((g) => map.set(g.id, g));
    boxes.forEach((b) => map.set(b.id, b));
    return map;
  }, [userGroups, boxes]);

  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    const base = products.filter((p) => p.quantity > 0);
    if (q.length === 0) return base;
    return base.filter((p) => {
      const box = spaceMap.get(p.spaceId);
      const boxNumStr = box?.boxNumber != null ? `#${box.boxNumber}` : "";
      return p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (box?.name ?? "").toLowerCase().includes(q) ||
        boxNumStr.toLowerCase().includes(q) ||
        (p.color ? (COLOR_NAMES[p.color] ?? "").includes(q) : false);
    });
  }, [q, products, spaceMap]);

  return (
    <div style={styles.container}>
      <div style={styles.stickyHeader}>
        <div style={styles.searchBox}>
          <Search size={18} color="#94a3b8" />
          <input
            style={styles.input}
            className="search-input"
            placeholder="Name, Farbe oder Beschreibung..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="search"
            autoComplete="off"
          />
        </div>
      </div>

      {q.length === 0 && results.length === 0 ? (
        <div style={styles.hint}>
          <Package size={44} color="var(--c-border)" />
          <p style={styles.hintText}>Noch keine Gegenstände in Orten</p>
        </div>
      ) : q.length > 0 && results.length === 0 ? (
        <div style={styles.hint}>
          <Search size={44} color="var(--c-border)" />
          <p style={styles.hintText}>Keine Ergebnisse für „{query}"</p>
        </div>
      ) : (
        <div style={styles.list}>
          {results.map((p) => {
            const inCart = cartItems.some(ci => ci.productId === p.id);
            const box    = spaceMap.get(p.spaceId);
            const parent = box?.parentId ? spaceMap.get(box.parentId) : undefined;
            return (
              <div key={p.id} style={{ ...styles.card, cursor: "pointer" }} onClick={() => box && navigate("ItemView", { product: p, box, parent, from: "SearchPage" })}>
                <div style={styles.item}>
                  <div style={styles.itemImg}>
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt={p.name} style={styles.itemImgEl} />
                      : <span style={styles.itemInitial}>{p.name[0]?.toUpperCase() ?? "?"}</span>
                    }
                  </div>
                  <div style={styles.itemInfo}>
                    <div style={styles.itemName}>{p.name}</div>
                    {p.description ? (
                      <div style={styles.itemDesc}>{p.description}</div>
                    ) : null}
                    <div style={styles.itemAvail}>
                      <span style={styles.itemQtyNum}>{p.quantity}</span>
                      <span style={styles.itemUnit}> {p.unit}</span>
                    </div>
                    {(parent || box) && (
                      <div style={styles.itemLocation}>
                        {parent ? `${parent.name} › ${box?.name}` : box?.name}
                        {box?.boxNumber != null && <span style={styles.boxNumBadge}>#{box.boxNumber}</span>}
                      </div>
                    )}
                  </div>
                  <button
                    style={{ ...styles.cartBtn, background: inCart ? "#c2410c" : "#2C2926" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!box) return;
                      setModalProduct({ product: p, box, parent });
                    }}
                    title="Zum Warenkorb hinzufügen"
                  >
                    <ShoppingCart size={18} color="#fff" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalProduct && (
        <QuantityModal
          product={modalProduct.product}
          initialQty={cartItems.find(ci => ci.productId === modalProduct.product.id)?.cartQuantity ?? 1}
          onConfirm={(qty) => {
            const { product: p, box, parent } = modalProduct;
            addToCart({
              productId: p.id,
              productName: p.name,
              imageUrl: p.imageUrl,
              maxQuantity: p.quantity,
              unit: p.unit,
              boxId: box.id,
              boxName: box.name,
              parentId: parent?.id ?? null,
              parentName: parent?.name ?? "",
            }, qty);
            setModalProduct(null);
          }}
          onClose={() => setModalProduct(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: { padding: "0 0 0 0" },
  stickyHeader: {
    position: "sticky", top: "var(--header-height, 64px)", zIndex: 10,
    background: "linear-gradient(to bottom, var(--c-bg) 70%, transparent 100%)",
    padding: "12px 16px 18px",
  },
  searchBox: {
    display: "flex", alignItems: "center", gap: 10,
    background: "var(--c-surface)", border: "1.5px solid var(--c-border)", borderRadius: 14,
    padding: "0 16px",
  },
  input: { flex: 1, border: "none", outline: "none", fontSize: 16, color: "var(--c-text-1)", background: "transparent", padding: "13px 0" },
  hint: { textAlign: "center", padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
  hintText: { fontSize: 14, color: "var(--c-text-3)" },
  list: { display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 8px" },
  card: { background: "var(--c-surface)", borderRadius: 16, overflow: "hidden" },
  item: { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" },
  itemImg: { width: 64, height: 64, borderRadius: 12, background: "var(--c-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" },
  itemImgEl: { width: "100%", height: "100%", objectFit: "cover" },
  itemInitial: { fontSize: 18, fontWeight: 700, color: "var(--c-text-3)" },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, fontWeight: 700, color: "var(--c-text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  itemDesc: { fontSize: 12, color: "var(--c-text-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  itemAvail: { display: "flex", alignItems: "baseline", marginTop: 3 },
  itemQtyNum: { fontSize: 15, fontWeight: 800, color: "var(--c-text-1)" },
  itemUnit: { fontSize: 12, color: "var(--c-text-3)", marginLeft: 3 },
  itemLocation: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#2C2926", fontWeight: 600, marginTop: 2, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  boxNumBadge: { fontSize: 10, fontWeight: 700, color: "#2C2926", background: "var(--c-accent-bg)", borderRadius: 6, padding: "1px 5px", flexShrink: 0 },
  cartBtn: { border: "none", borderRadius: 11, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 },
};
