import React, { useState } from "react";
import type { CSSProperties } from "react";
import Lottie from "lottie-react";
import emptyCartAnim from "../../public/empty-cart.json";
import { Trash2, Minus, Plus, CircleCheck, AlertTriangle, Package } from "lucide-react";
import type { NavigateFn } from "../App";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { createBooking } from "../services/bookings.service";

interface CartProps {
  navigate: NavigateFn;
}

export default function Cart({ navigate: _navigate }: CartProps): React.ReactElement {
  const { user } = useAuth();
  const { items, removeFromCart, updateCartQuantity, clearCart } = useCart();
  const [booking, setBooking]     = useState(false);
  const [armed, setArmed]         = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<{ positions: number; total: number } | null>(null);
  const armTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef    = React.useRef(items);
  itemsRef.current  = items;

  // Reset submitted guard when new items are added after a booking
  React.useEffect(() => {
    if (submitted && items.length > 0) setSubmitted(false);
  }, [items.length]);

  const handleButtonClick = () => {
    if (booking || submitted) return;
    if (!armed) {
      setArmed(true);
      armTimerRef.current = setTimeout(() => setArmed(false), 3000);
    } else {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
      setArmed(false);
      handleAbbuchen();
    }
  };

  const handleAbbuchen = async () => {
    if (!user || itemsRef.current.length === 0 || booking || submitted) return;
    setSubmitted(true);
    setBooking(true);
    setError(null);
    try {
      const snapshot = [...itemsRef.current];
      await createBooking(
        user.uid,
        user.displayName ?? user.email ?? "Unbekannt",
        user.email ?? "",
        snapshot
      );
      const totalQty = snapshot.reduce((s, i) => s + i.cartQuantity, 0);
      clearCart();
      setSuccess({ positions: snapshot.length, total: totalQty });
    } catch {
      setSubmitted(false);
      setError("Abbuchung fehlgeschlagen. Bitte versuche es erneut.");
    } finally {
      setBooking(false);
    }
  };

  return (
    <div style={styles.container}>


      {success && (
        <div style={styles.successCard}>
          <CircleCheck size={28} color="#16a34a" />
          <div>
            <div style={styles.successTitle}>Erfolgreich abgebucht!</div>
            <div style={styles.successText}>
              {success.positions} Position{success.positions !== 1 ? "en" : ""} · {success.total} Stück wurden abgebucht.
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div style={styles.empty}>
          <Lottie animationData={emptyCartAnim} loop style={{ width: 140, height: 140 }} />
          <p style={styles.emptyText}>Dein Warenkorb ist leer</p>
        </div>
      ) : (
        <>
          <div style={styles.list}>
            {items.map((item, i) => (
              <div key={item.productId} style={{ ...styles.item, borderBottom: i < items.length - 1 ? "1px solid var(--c-border-2)" : "none" }}>
                <div style={styles.itemImg}>
                  {item.imageUrl
                    ? <img src={item.imageUrl} alt={item.productName} style={styles.itemImgEl} />
                    : <Package size={22} color="var(--c-border)" />}
                </div>
                <div style={styles.itemContent}>
                  <div style={styles.itemName}>{item.productName}</div>
                  <div style={styles.itemMeta}>
                    {item.parentName ? `${item.parentName} › ${item.boxName}` : item.boxName}
                    {item.boxNumber != null && <span style={styles.boxNumBadge}>#{item.boxNumber}</span>}
                  </div>
                  <div style={styles.qtyRow}>
                    <button style={styles.qtyBtn} onClick={() => updateCartQuantity(item.productId, -1)}><Minus size={12} /></button>
                    <span style={styles.qtyLabel}>{item.cartQuantity} {item.unit}</span>
                    <button style={styles.qtyBtn} onClick={() => updateCartQuantity(item.productId, 1)} disabled={item.cartQuantity >= item.maxQuantity}><Plus size={12} /></button>
                  </div>
                </div>
                <button style={styles.removeBtn} onClick={() => removeFromCart(item.productId)}>
                  <Trash2 size={15} color="#ef4444" />
                </button>
              </div>
            ))}
          </div>

          {error && (
            <div style={styles.errorBox}>
              <AlertTriangle size={14} color="#991b1b" />
              {error}
            </div>
          )}
          <button
            style={{
              ...styles.abbuchenBtn,
              opacity: booking ? 0.7 : 1,
              background: submitted
                ? "linear-gradient(135deg, #16a34a 0%, #15803d 100%)"
                : armed
                ? "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)"
                : "#2C2926",
              transition: "background 0.25s",
            }}
            onClick={handleButtonClick}
            disabled={booking || submitted}
          >
            <CircleCheck size={18} color="#fff" />
            {booking ? "Wird abgebucht…" : submitted ? "✓ Abgebucht" : armed ? "Nochmal tippen zum Bestätigen" : "Abbuchen"}
          </button>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: { padding: "20px 16px" },
  title:    { fontSize: 28, fontWeight: 800, color: "var(--c-text-1)", margin: 0 },
  subtitle: { fontSize: 14, color: "var(--c-text-3)", marginTop: 4, marginBottom: 20 },
  empty: { textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, minHeight: "70dvh" },
  emptyText: { fontSize: 15, fontWeight: 600, color: "var(--c-text-2)" },
  list: { background: "var(--c-surface)", borderRadius: 16, overflow: "hidden", marginBottom: 16 },
  item: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" },
  itemImg: { width: 48, height: 48, borderRadius: 10, background: "var(--c-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" },
  itemImgEl: { width: "100%", height: "100%", objectFit: "cover" },
  itemContent: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, fontWeight: 600, color: "var(--c-text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  itemMeta: { fontSize: 12, color: "var(--c-text-3)", marginTop: 2, display: "flex", alignItems: "center", gap: 5 },
  boxNumBadge: { fontSize: 10, fontWeight: 700, color: "#2C2926", background: "var(--c-accent-bg)", borderRadius: 6, padding: "1px 5px", flexShrink: 0 },
  qtyRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 6 },
  qtyBtn: { background: "var(--c-surface-2)", border: "none", borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  qtyLabel: { fontSize: 13, fontWeight: 600, color: "var(--c-text-1)", minWidth: 40, textAlign: "center" },
  removeBtn: { background: "var(--c-surface-2)", border: "none", borderRadius: 8, padding: 10, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0, minWidth: 44, minHeight: 44, justifyContent: "center" },
  successCard: {
    display: "flex", alignItems: "flex-start", gap: 14,
    background: "#f0fdf4", border: "1px solid #86efac",
    borderRadius: 14, padding: "16px", marginBottom: 20,
  },
  successTitle: { fontSize: 15, fontWeight: 700, color: "#15803d", marginBottom: 2 },
  successText:  { fontSize: 13, color: "#166534" },
  errorBox: { display: "flex", alignItems: "center", gap: 8, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#991b1b", marginBottom: 10 },
  abbuchenBtn: {
    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    background: "#2C2926",
    color: "#fff", border: "none", borderRadius: 14,
    padding: "15px", fontSize: 16, fontWeight: 700,
    cursor: "pointer",
  },
};
