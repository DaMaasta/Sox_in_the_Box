import React, { useState, useRef, useEffect } from "react";
import type { CSSProperties } from "react";
import { Camera, Plus, Minus, Trash2, ShoppingCart, Pencil } from "lucide-react";
import type { NavigateFn, PageParams } from "../App";
import type { Product, ProductUnit } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { useHeader } from "../contexts/HeaderContext";
import { updateProduct, deleteProduct } from "../services/products.service";
import { compressImageToBase64 } from "../utils/imageUtils";
import QuantityModal from "../components/QuantityModal";

interface ProductDetailProps {
  navigate: NavigateFn;
  params: PageParams<"ProductDetail">;
}

const UNITS: ProductUnit[] = ["Stück", "kg", "g", "L", "ml", "Packung", "Flasche", "Dose", "Paar", "Box"];
const PRODUCT_COLORS = ["#2C2926","#ef4444","#eab308","#22c55e","#14b8a6","#3b82f6","#8b5cf6","#ec4899"];

export default function ProductDetail({ navigate, params }: ProductDetailProps): React.ReactElement {
  const product = params.product;
  const box     = params.box;
  const place   = params.place;
  const from    = params.from ?? "BoxDetail";

  const { user } = useAuth();
  const { addToCart, items: cartItems } = useCart();
  const { setHeader } = useHeader();
  const isViewer = place?.members?.[user?.uid ?? ""]?.role === "viewer";

  useEffect(() => {
    setHeader({
      title: product.name,
      onBack: () => from === "SearchPage" ? navigate("SearchPage") : navigate("BoxDetail", { box, place: place ?? null }),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.name]);

  const [nameFocused, setNameFocused] = useState(false);
  const [name,        setName]        = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [quantity,    setQuantity]    = useState(product.quantity);
  const [qtyText,     setQtyText]     = useState(String(product.quantity));
  const [unit,        setUnit]        = useState<ProductUnit>(product.unit);
  const [color,       setColor]       = useState<string>(product.color ?? "");
  const [imageFile,   setImageFile]   = useState<File | null>(null);
  const [preview,     setPreview]     = useState<string | null>(product.imageUrl);
  const [saving,      setSaving]      = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [delConfirm,  setDelConfirm]  = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [modalOpen,   setModalOpen]   = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const inCart  = cartItems.some((ci) => ci.productId === product.id);
  const isDirty = name !== product.name
    || description !== product.description
    || quantity !== product.quantity
    || unit !== product.unit
    || imageFile !== null
    || color !== (product.color ?? "");

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!name.trim() || !user || saving) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      let imageUrl: string | null = product.imageUrl;
      if (imageFile) imageUrl = await compressImageToBase64(imageFile);
      await updateProduct(product.id, user.uid, user.email ?? "", {
        name: name.trim(), description: description.trim(), quantity, unit, imageUrl,
        ...(color ? { color } : {}),
      });
      setSaveSuccess(true);
      setTimeout(() => navigate("BoxDetail", { box, place: place ?? null }), 800);
    } catch {
      setSaveSuccess(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteProduct(product.id);
      goBack();
    } catch {
      setDeleteError("Löschen fehlgeschlagen. Bitte erneut versuchen.");
      setDelConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const goBack = () => {
    if (from === "SearchPage") navigate("SearchPage");
    else navigate("BoxDetail", { box, place: place ?? null });
  };

  const cartProduct: Product = { ...product, name, quantity, unit, imageUrl: preview };

  return (
    <div style={styles.container}>

      {/* Header: Bild */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageChange} />
      <button style={styles.imagePicker} onClick={() => !isViewer && fileInputRef.current?.click()}>
        {preview
          ? <img src={preview} alt={name} style={styles.imageEl} />
          : <div style={styles.imagePlaceholder}><span style={styles.imageInitial}>{name[0]?.toUpperCase() ?? "?"}</span></div>
        }
        {!isViewer && <div style={styles.cameraOverlay}><Camera size={18} color="#fff" /></div>}
      </button>

      {/* Name */}
      <div style={{ position: "relative" }}>
        <input
          style={{
            ...styles.nameInput,
            ...(isViewer ? { cursor: "default" } : {}),
            borderBottom: !isViewer ? `2px solid ${nameFocused ? "var(--c-text-1)" : "transparent"}` : "none",
            paddingBottom: !isViewer ? 2 : 0,
            paddingRight: !isViewer ? 28 : 0,
            transition: "border-color 0.15s",
          }}
          value={name}
          onChange={(e) => { if (!isViewer) { setName(e.target.value); setSaveSuccess(false); } }}
          onFocus={() => setNameFocused(true)}
          onBlur={() => setNameFocused(false)}
          placeholder="Name"
          readOnly={isViewer}
        />
        {!isViewer && !nameFocused && (
          <Pencil size={15} color="var(--c-text-3)"
            style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
        )}
      </div>

      {/* Beschreibung */}
      <div style={styles.card}>
        <textarea
          style={styles.textarea}
          value={description}
          onChange={(e) => { if (!isViewer) { setDescription(e.target.value); setSaveSuccess(false); } }}
          placeholder="Beschreibung…"
          rows={2}
          readOnly={isViewer}
        />
      </div>

      {/* Menge */}
      <div style={styles.card}>
        <div style={styles.qtyRow}>
          {!isViewer && (
            <button style={styles.qtyBtn} onClick={() => { const n = Math.max(0, quantity - 1); setQuantity(n); setQtyText(String(n)); setSaveSuccess(false); }}>
              <Minus size={14} />
            </button>
          )}
          <input
            type="text" inputMode={isViewer ? "none" : "numeric"} pattern="[0-9]*"
            style={styles.qtyInput} value={qtyText}
            onChange={(e) => {
              if (isViewer) return;
              const raw = e.target.value.replace(/[^0-9]/g, "");
              setQtyText(raw);
              const n = parseInt(raw);
              if (!isNaN(n)) { setQuantity(n); setSaveSuccess(false); }
            }}
            onBlur={() => setQtyText(String(quantity))}
            readOnly={isViewer}
          />
          {!isViewer && (
            <button style={styles.qtyBtn} onClick={() => { const n = quantity + 1; setQuantity(n); setQtyText(String(n)); setSaveSuccess(false); }}>
              <Plus size={14} />
            </button>
          )}
          {isViewer
            ? <span style={{ fontSize: 13, color: "var(--c-text-2)", fontWeight: 600 }}>{unit}</span>
            : (
              <select style={styles.select} value={unit} onChange={(e) => { setUnit(e.target.value as ProductUnit); setSaveSuccess(false); }}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            )
          }
        </div>
      </div>

      {/* Farbe */}
      {!isViewer && (
        <div style={styles.card}>
          <div style={styles.colorPickerRow}>
            {PRODUCT_COLORS.map((c) => (
              <button type="button" key={c}
                style={styles.colorSwatchBtn}
                onClick={() => { setColor(color === c ? "" : c); setSaveSuccess(false); }}>
                <div style={{ ...styles.colorSwatch, background: c,
                  boxShadow: color === c ? `0 0 0 3px var(--c-surface), 0 0 0 5px ${c}` : "none",
                  transform: color === c ? "scale(1.2)" : "scale(1)" }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {deleteError && (
        <div style={{ fontSize: 12, color: "#ef4444", background: "#fef2f2", borderRadius: 8, padding: "6px 10px", flexShrink: 0 }}>
          {deleteError}
        </div>
      )}

      {/* Aktionen + Löschen */}
      {!isViewer && (
        <div style={styles.bottomRow}>
          {!delConfirm ? (
            <>
              <button style={{ ...styles.deleteIconBtn }} onClick={() => setDelConfirm(true)}>
                <Trash2 size={16} color="#ef4444" />
              </button>
              <button
                style={{ ...styles.cartBtn, background: inCart ? "#c2410c" : "#2C2926", opacity: quantity === 0 ? 0.4 : 1 }}
                onClick={() => setModalOpen(true)} disabled={quantity === 0}
              >
                <ShoppingCart size={16} color="#fff" />
                {inCart ? "Im Warenkorb" : "In Warenkorb"}
              </button>
              {isDirty && (
                <button
                  style={{ ...styles.saveBtn, opacity: saving ? 0.7 : 1, background: saveSuccess ? "linear-gradient(135deg,#22c55e,#16a34a)" : "linear-gradient(135deg,#2C2926,#2C2926)" }}
                  onClick={handleSave} disabled={saving}
                >
                  {saving ? "…" : saveSuccess ? "✓" : "Speichern"}
                </button>
              )}
            </>
          ) : (
            <>
              <span style={styles.delConfirmText}>Löschen?</span>
              <button style={{ ...styles.confirmDeleteBtn, opacity: deleting ? 0.6 : 1 }} onClick={handleDelete} disabled={deleting}>
                {deleting ? "…" : "Ja"}
              </button>
              <button style={styles.cancelSmBtn} onClick={() => setDelConfirm(false)} disabled={deleting}>Nein</button>
            </>
          )}
        </div>
      )}

      {modalOpen && (
        <QuantityModal
          product={cartProduct}
          initialQty={cartItems.find((ci) => ci.productId === product.id)?.cartQuantity ?? 1}
          onConfirm={(qty) => {
            addToCart({
              productId: product.id,
              productName: name,
              imageUrl: preview,
              maxQuantity: quantity,
              unit,
              boxId: box.id,
              boxName: box.name,
              parentId: place?.id ?? null,
              parentName: place?.name ?? "",
            }, qty);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: { padding: "12px 16px 32px", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" },

  imagePicker: {
    position: "relative", width: "100%", aspectRatio: "1 / 1", maxHeight: 280,
    borderRadius: 20, flexShrink: 0, overflow: "hidden", border: "none", padding: 0,
    cursor: "pointer", background: "var(--c-surface-2)", display: "block",
  },
  imageEl:          { width: "100%", height: "100%", objectFit: "cover" },
  imagePlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" },
  imageInitial:     { fontSize: 72, fontWeight: 800, color: "var(--c-border)" },
  cameraOverlay: {
    position: "absolute", bottom: 10, right: 10,
    width: 34, height: 34, borderRadius: 10,
    background: "rgba(0,0,0,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },

  nameInput: {
    width: "100%", border: "none", outline: "none", background: "transparent",
    fontSize: 22, fontWeight: 800, color: "var(--c-text-1)",
    padding: 0, boxSizing: "border-box", flexShrink: 0,
  },

  card: { background: "var(--c-surface)", borderRadius: 12, overflow: "hidden", flexShrink: 0 },

  textarea: {
    width: "100%", border: "none", outline: "none", resize: "none",
    fontSize: 14, color: "var(--c-text-1)", background: "transparent",
    padding: "10px 12px", boxSizing: "border-box", lineHeight: 1.4,
    fontFamily: "inherit",
  },

  qtyRow:   { display: "flex", alignItems: "center", gap: 10, padding: "8px 12px" },
  qtyBtn:   { background: "var(--c-surface-2)", border: "none", borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 },
  qtyInput: { fontSize: 20, fontWeight: 800, color: "var(--c-text-1)", minWidth: 32, width: 56, textAlign: "center", border: "none", outline: "none", background: "transparent", padding: 0 },
  select:   { marginLeft: "auto", border: "1px solid var(--c-border)", borderRadius: 8, padding: "6px 8px", fontSize: 14, background: "var(--c-bg)", color: "var(--c-text-1)", outline: "none" },

  colorPickerRow:  { display: "flex", gap: 0, padding: "6px 8px", flexWrap: "wrap" as const },
  colorSwatchBtn:  { width: 44, height: 44, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", touchAction: "manipulation" as const },
  colorSwatch:     { width: 26, height: 26, borderRadius: "50%", flexShrink: 0, transition: "box-shadow 0.15s, transform 0.15s" },

  bottomRow: { display: "flex", gap: 8, alignItems: "center", marginTop: "auto", flexShrink: 0 },
  deleteIconBtn: { width: 42, height: 42, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 },
  cartBtn: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    border: "none", borderRadius: 12, padding: "12px 10px",
    fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer",
  },
  saveBtn: {
    flex: 1, background: "#2C2926",
    color: "#fff", border: "none", borderRadius: 12,
    padding: "12px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },

  delConfirmText: { fontSize: 13, fontWeight: 600, color: "#991b1b", flex: 1 },
  confirmDeleteBtn: { background: "#ef4444", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" },
  cancelSmBtn:      { background: "var(--c-surface-2)", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "var(--c-text-2)", cursor: "pointer" },
};
