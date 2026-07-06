import React, { useState } from "react";
import type { CSSProperties } from "react";
import { ShoppingCart, MapPin, Tag, Hash } from "lucide-react";
import type { NavigateFn, PageParams } from "../App";
import { useCart } from "../contexts/CartContext";
import { useHeader } from "../contexts/HeaderContext";
import QuantityModal from "../components/QuantityModal";

interface ItemViewProps {
  navigate: NavigateFn;
  params: PageParams<"ItemView">;
}

const COLOR_LABELS: Record<string, string> = {
  "#2C2926": "Orange",
  "#ef4444": "Rot",
  "#eab308": "Gelb",
  "#22c55e": "Grün",
  "#14b8a6": "Türkis",
  "#3b82f6": "Blau",
  "#8b5cf6": "Lila",
  "#ec4899": "Pink",
};

export default function ItemView({ navigate, params }: ItemViewProps): React.ReactElement {
  const product = params.product;
  const box     = params.box;
  const parent  = params.parent;
  const from    = params.from ?? "SearchPage";

  const { addToCart, items: cartItems } = useCart();
  const { setHeader } = useHeader();
  const [modalOpen, setModalOpen] = useState(false);

  React.useEffect(() => {
    setHeader({
      title: product.name,
      onBack: () => navigate(from as Parameters<NavigateFn>[0]),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.name]);

  const inCart     = cartItems.some(ci => ci.productId === product.id);
  const initialQty = cartItems.find(ci => ci.productId === product.id)?.cartQuantity ?? 1;

  return (
    <div style={styles.container}>
      {/* Bild */}
      <div style={styles.imageWrap}>
        {product.imageUrl
          ? <img src={product.imageUrl} alt={product.name} style={styles.image} />
          : <div style={styles.imagePlaceholder}>
              <span style={styles.initial}>{product.name[0]?.toUpperCase() ?? "?"}</span>
            </div>
        }
      </div>

      {/* Name */}
      <div style={styles.header}>
        <h1 style={styles.name}>{product.name}</h1>
      </div>

      {/* Info-Karte */}
      <div style={styles.card}>
        <Row label="Verfügbar" value={`${product.quantity} ${product.unit}`} />
        {product.description ? <Row label="Beschreibung" value={product.description} /> : null}
        {product.minQuantity !== null ? <Row label="Mindestbestand" value={`${product.minQuantity} ${product.unit}`} /> : null}
        {product.category ? <Row label="Kategorie" icon={<Tag size={13} color="#94a3b8" />} value={product.category} /> : null}
        {product.barcode ? <Row label="Barcode" icon={<Hash size={13} color="#94a3b8" />} value={product.barcode} /> : null}
        {product.color ? (
          <div style={styles.row}>
            <span style={styles.rowLabel}>Farbe</span>
            <div style={styles.colorChip}>
              <span style={{ ...styles.colorDot, background: product.color }} />
              <span style={styles.rowValue}>{COLOR_LABELS[product.color] ?? product.color}</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Ort */}
      {(box || parent) && (
        <div style={styles.locationCard}>
          <MapPin size={14} color="#2C2926" />
          <span style={styles.locationText}>
            {parent ? `${parent.name} › ` : ""}{box?.name}
          </span>
        </div>
      )}

      {/* Warenkorb-Button */}
      <button
        style={{ ...styles.cartBtnFull, background: inCart ? "#c2410c" : "#2C2926", opacity: product.quantity === 0 ? 0.4 : 1 }}
        disabled={product.quantity === 0}
        onClick={() => setModalOpen(true)}
      >
        <ShoppingCart size={18} color="#fff" />
        {inCart ? "Im Warenkorb" : "In den Warenkorb"}
      </button>

      {modalOpen && (
        <QuantityModal
          product={product}
          initialQty={initialQty}
          onConfirm={(qty) => {
            addToCart({
              productId: product.id,
              productName: product.name,
              imageUrl: product.imageUrl,
              maxQuantity: product.quantity,
              unit: product.unit,
              boxId: box?.id ?? "",
              boxName: box?.name ?? "",
              parentId: parent?.id ?? null,
              parentName: parent?.name ?? "",
            }, qty);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{icon ? <>{icon} {label}</> : label}</span>
      <span style={styles.rowValue}>{value}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: { padding: "16px 16px 32px" },
  imageWrap: { width: "100%", aspectRatio: "1 / 1", maxHeight: 280, borderRadius: 20, overflow: "hidden", background: "var(--c-surface-2)", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%", objectFit: "cover" },
  imagePlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" },
  initial: { fontSize: 72, fontWeight: 800, color: "var(--c-border)" },
  header: { display: "flex", alignItems: "center", marginBottom: 16 },
  name: { fontSize: 22, fontWeight: 800, color: "var(--c-text-1)", margin: 0 },
  cartBtnFull: { width: "100%", border: "none", borderRadius: 16, padding: "14px 20px", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 10 },
  card: { background: "var(--c-surface)", borderRadius: 16, overflow: "hidden", marginBottom: 12 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderBottom: "1px solid var(--c-border-2)" },
  rowLabel: { fontSize: 13, color: "var(--c-text-3)", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 },
  rowValue: { fontSize: 14, color: "var(--c-text-1)", fontWeight: 600, textAlign: "right", maxWidth: "60%" },
  colorChip: { display: "flex", alignItems: "center", gap: 6 },
  colorDot: { width: 14, height: 14, borderRadius: "50%", flexShrink: 0 },
  locationCard: { display: "flex", alignItems: "center", gap: 8, background: "var(--c-surface)", borderRadius: 16, padding: "12px 16px" },
  locationText: { fontSize: 13, color: "#2C2926", fontWeight: 600 },
};
