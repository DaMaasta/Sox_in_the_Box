import React, { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { Plus, Minus, Camera, ShoppingCart, Package, X } from "lucide-react";
import BottomSheet from "../components/BottomSheet";
import type { NavigateFn, PageParams } from "../App";
import type { Space, Product, ProductUnit } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { useHeader } from "../contexts/HeaderContext";
import { compressImageToBase64 } from "../utils/imageUtils";
import QuantityModal from "../components/QuantityModal";
import { subscribeToSpaceProducts, createProduct } from "../services/products.service";
import { subscribeToSpace } from "../services/spaces.service";

interface BoxDetailProps {
  navigate: NavigateFn;
  params: PageParams<"BoxDetail">;
}

const UNITS: ProductUnit[] = ["Stück", "kg", "g", "L", "ml", "Packung", "Flasche", "Dose", "Paar", "Box"];
const emptyForm = { name: "", description: "", quantity: 1, unit: "Stück" as ProductUnit };

export default function BoxDetail({ navigate, params }: BoxDetailProps): React.ReactElement {
  const box          = params.box;
  const passedPlace  = params.place;
  const { user } = useAuth();
  const { addToCart, items: cartItems } = useCart();
  const { setHeader } = useHeader();

  const [products,    setProducts]    = useState<Product[]>([]);
  const [parentSpace, setParentSpace] = useState<Space | null>(passedPlace ?? null);
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState(emptyForm);
  const [qtyText,     setQtyText]     = useState("1");
  const [imageFile,   setImageFile]   = useState<File | null>(null);
  const [preview,     setPreview]     = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  const place    = parentSpace;
  const isViewer = place?.members?.[user?.uid ?? ""]?.role === "viewer";

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHeader({
      title: box?.name ?? "Box",
      onBack: () => place ? navigate("GroupDetail", { group: place }) : navigate("Groups"),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box?.name]);

  useEffect(() => {
    if (!box?.id) return;
    return subscribeToSpaceProducts(box.id, setProducts);
  }, [box?.id]);

  // Fetch parent space if not passed (e.g. navigating from SearchPage)
  useEffect(() => {
    if (passedPlace) { setParentSpace(passedPlace); return; }
    if (!box?.parentId) return;
    return subscribeToSpace(box.parentId, (s) => { if (s) setParentSpace(s); });
  }, [passedPlace, box?.parentId]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setQtyText("1");
    setImageFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !user || saving) return;
    setSaving(true);
    try {
      let imageUrl: string | null = null;
      if (imageFile) imageUrl = await compressImageToBase64(imageFile);
      await createProduct(box.id, user.uid, user.email ?? "", {
        name: form.name.trim(), description: form.description.trim(),
        quantity: form.quantity, unit: form.unit,
        minQuantity: null, category: "", barcode: null, imageUrl,
      });
      resetForm();
    } finally { setSaving(false); }
  };

  return (
    <div style={styles.container}>
      {isViewer && (
        <div style={styles.viewerBanner}>
          Nur Ansicht — du kannst keine Artikel abbuchen
        </div>
      )}

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{box?.name ?? "Box"}</h1>
          <p style={styles.subtitle}>{products.length} Gegenstand{products.length !== 1 ? "e" : ""}</p>
        </div>
        {!isViewer && (
          <button style={styles.newBtn} onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus size={16} color="#fff" /> Hinzufügen
          </button>
        )}
      </div>

      {!isViewer && showForm && (
        <BottomSheet onClose={resetForm}>
          <div style={styles.formHeader}>
            <span style={styles.formTitle}>Neuer Gegenstand</span>
            <button style={styles.closeBtn} onClick={resetForm}><X size={18} color="var(--c-text-3)" /></button>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageChange} />
          <button style={styles.imagePicker} onClick={() => fileInputRef.current?.click()}>
            {preview
              ? <img src={preview} alt="Vorschau" style={styles.imagePreview} />
              : <><Camera size={22} color="var(--c-text-3)" /><span style={styles.imagePickerText}>Foto hinzufügen</span></>
            }
          </button>

          <div style={styles.field}>
            <label style={styles.label}>Name *</label>
            <input style={styles.input} placeholder="z.B. Schraubenzieher" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Beschreibung</label>
            <input style={styles.input} placeholder="Optional" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div style={styles.row}>
            <div style={{ ...styles.field, flex: 1 }}>
              <label style={styles.label}>Anzahl</label>
              <div style={styles.qtyRow}>
                <button style={styles.qtyBtn} onClick={() => { const n = Math.max(1, form.quantity - 1); setForm({ ...form, quantity: n }); setQtyText(String(n)); }}><Minus size={14} /></button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  style={styles.qtyVal}
                  value={qtyText}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    setQtyText(raw);
                    const n = parseInt(raw);
                    if (!isNaN(n) && n >= 1) setForm({ ...form, quantity: n });
                  }}
                  onBlur={() => setQtyText(String(form.quantity))}
                />
                <button style={styles.qtyBtn} onClick={() => { const n = form.quantity + 1; setForm({ ...form, quantity: n }); setQtyText(String(n)); }}><Plus size={14} /></button>
              </div>
            </div>
            <div style={{ ...styles.field, flex: 1 }}>
              <label style={styles.label}>Einheit</label>
              <select style={styles.select} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as ProductUnit })}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <button style={{ ...styles.saveBtn, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Wird gespeichert…" : "Speichern"}
          </button>
        </BottomSheet>
      )}

      {/* Produktliste */}
      {products.length === 0 && !showForm ? (
        <div style={styles.emptyState}>
          <Package size={48} color="var(--c-border)" />
          <p style={styles.emptyText}>Die Box ist leer</p>
          {!isViewer && (
            <button style={styles.emptyBtn} onClick={() => setShowForm(true)}>
              <Plus size={14} color="#2C2926" /> Ersten Gegenstand hinzufügen
            </button>
          )}
        </div>
      ) : (
        <div style={styles.list}>
          {products.map((p) => {
            const inCart = cartItems.some((ci) => ci.productId === p.id);
            return (
              <div
                key={p.id}
                style={styles.card}
                onClick={() => navigate("ProductDetail", { product: p, box, place })}
              >
                <div style={styles.item}>
                  <div style={styles.itemImg}>
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt={p.name} style={styles.itemImgEl} />
                      : <span style={styles.itemInitial}>{p.name[0]?.toUpperCase() ?? "?"}</span>
                    }
                  </div>
                  <div style={styles.itemInfo}>
                    <div style={styles.itemName}>{p.name}</div>
                    <div style={styles.itemAvail}>
                      <span style={styles.itemQtyNum}>{p.quantity}</span>
                      <span style={styles.itemUnit}> {p.unit}</span>
                    </div>
                  </div>
                  {!isViewer && (
                    <button
                      style={{ ...styles.cartBtn, opacity: p.quantity === 0 ? 0.35 : 1, background: inCart ? "#c2410c" : "#2C2926" }}
                      onClick={(e) => { e.stopPropagation(); setModalProduct(p); }}
                      disabled={p.quantity === 0}
                      title="Zum Warenkorb hinzufügen"
                    >
                      <ShoppingCart size={18} color="#fff" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isViewer && modalProduct && (
        <QuantityModal
          product={modalProduct}
          initialQty={cartItems.find((ci) => ci.productId === modalProduct.id)?.cartQuantity ?? 1}
          onConfirm={(qty) => {
            addToCart({
              productId: modalProduct.id,
              productName: modalProduct.name,
              imageUrl: modalProduct.imageUrl,
              maxQuantity: modalProduct.quantity,
              unit: modalProduct.unit,
              boxId: box.id,
              boxName: box.name,
              boxNumber: box.boxNumber ?? null,
              parentId: place?.id ?? null,
              parentName: place?.name ?? "",
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
  container: { padding: "16px" },
  back:     { display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", marginBottom: 16 },
  viewerBanner: { background: "var(--c-surface-2)", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "var(--c-text-3)", marginBottom: 12, textAlign: "center" as const },
  backText: { color: "#2C2926", fontSize: 14, fontWeight: 600 },
  header:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title:    { fontSize: 26, fontWeight: 800, color: "var(--c-text-1)", margin: 0 },
  subtitle: { fontSize: 14, color: "var(--c-text-3)", marginTop: 4 },
  newBtn:   { display: "flex", alignItems: "center", gap: 6, background: "var(--c-dark-btn)", color: "var(--c-dark-btn-text)", border: "none", borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  formHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  formTitle:  { fontSize: 16, fontWeight: 700, color: "var(--c-text-1)" },
  closeBtn:   { background: "none", border: "none", cursor: "pointer", padding: 8, display: "flex", minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
  imagePicker: { width: "100%", height: 120, borderRadius: 14, border: "2px dashed var(--c-border)", background: "var(--c-surface-2)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", overflow: "hidden", padding: 0 },
  imagePreview:    { width: "100%", height: "100%", objectFit: "cover" },
  imagePickerText: { fontSize: 13, color: "var(--c-text-3)", fontWeight: 500 },
  field:  { display: "flex", flexDirection: "column", gap: 6 },
  label:  { fontSize: 12, fontWeight: 600, color: "var(--c-text-2)", textTransform: "uppercase", letterSpacing: "0.04em" },
  input:  { border: "1px solid var(--c-border)", borderRadius: 10, padding: "10px 12px", fontSize: 16, outline: "none", color: "var(--c-text-1)", background: "var(--c-bg)" },
  row:    { display: "flex", gap: 12 },
  qtyRow: { display: "flex", alignItems: "center", gap: 10, background: "var(--c-surface-2)", borderRadius: 10, padding: "8px 12px" },
  qtyBtn: { background: "var(--c-border)", border: "none", borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  qtyVal: { fontSize: 16, fontWeight: 700, color: "var(--c-text-1)", minWidth: 24, width: 40, textAlign: "center", border: "none", outline: "none", background: "transparent", padding: 0, fontFamily: "inherit" },
  select: { border: "1px solid var(--c-border)", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", background: "var(--c-bg)", color: "var(--c-text-1)" },
  saveBtn: { background: "#2C2926", color: "#fff", border: "none", borderRadius: 12, padding: "14px 0", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  emptyState: { textAlign: "center", padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
  emptyText:  { fontSize: 14, color: "var(--c-text-3)" },
  emptyBtn:   { display: "flex", alignItems: "center", gap: 6, background: "var(--c-accent-bg)", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#2C2926", cursor: "pointer" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  card: { background: "var(--c-surface)", borderRadius: 16, overflow: "hidden", cursor: "pointer" },
  item: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" },
  itemImg:    { width: 64, height: 64, borderRadius: 12, background: "var(--c-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" },
  itemImgEl:  { width: "100%", height: "100%", objectFit: "cover" },
  itemInitial:{ fontSize: 17, fontWeight: 700, color: "var(--c-text-3)" },
  itemInfo:   { flex: 1, minWidth: 0 },
  itemName:   { fontSize: 14, fontWeight: 700, color: "var(--c-text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  itemAvail:  { display: "flex", alignItems: "baseline", gap: 2, marginTop: 2 },
  itemQtyNum: { fontSize: 16, fontWeight: 800, color: "var(--c-text-1)" },
  itemUnit:   { fontSize: 12, color: "var(--c-text-3)", fontWeight: 500 },
  cartBtn:    { border: "none", borderRadius: 11, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "opacity 0.15s" },
};
