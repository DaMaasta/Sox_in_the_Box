import React, { useState, useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import { Clock, ChevronDown, Plus, Minus, Undo2, X, MapPin } from "lucide-react";
import BottomSheet from "../../components/BottomSheet";
import type { Booking, BookingItem } from "../../types";
import { useAuth } from "../../contexts/AuthContext";
import { subscribeToGroupBookings, createReturnBooking } from "../../services/bookings.service";
import { getInitials, formatLocation } from "../../utils/stringUtils";

interface HistoryTabProps {
  groupId: string;
  isViewer: boolean;
}

export default function HistoryTab({ groupId, isViewer }: HistoryTabProps): React.ReactElement {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [historyFilter, setHistoryFilter] = useState("");
  const [returnBooking, setReturnBooking] = useState<Booking | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnConfirm, setReturnConfirm] = useState(false);
  const [returnSuccess, setReturnSuccess] = useState(false);
  const submittedReturns = useRef<Set<string>>(new Set());
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!groupId) return;
    return subscribeToGroupBookings(groupId, setBookings);
  }, [groupId]);

  const groupedByDate = useMemo(() => {
    const allSource = isViewer ? bookings.filter((b) => b.userId === user?.uid) : bookings;
    const returnMap = new Map<string, Booking>();
    allSource.forEach((b) => {
      if (b.type === "return" && b.originalBookingId) returnMap.set(b.originalBookingId, b);
    });
    const source = allSource.filter((b) => b.type !== "return");
    const dateMap = new Map<string, {
      key: string; label: string; totalCount: number;
      persons: Map<string, { userId: string; name: string; initials: string; entries: Array<{ booking: Booking; number: number; returnBooking?: Booking }> }>;
    }>();
    source.forEach((b, index) => {
      const d = b.createdAt;
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dateLabel = d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      if (!dateMap.has(dateKey)) dateMap.set(dateKey, { key: dateKey, label: dateLabel, totalCount: 0, persons: new Map() });
      const dateEntry = dateMap.get(dateKey)!;
      dateEntry.totalCount++;
      const personName = b.userDisplayName || b.userEmail;
      const personInitials = getInitials(personName) || personName[0]?.toUpperCase() || "?";
      if (!dateEntry.persons.has(b.userId)) {
        dateEntry.persons.set(b.userId, { userId: b.userId, name: personName, initials: personInitials, entries: [] });
      }
      dateEntry.persons.get(b.userId)!.entries.push({ booking: b, number: source.length - index, returnBooking: returnMap.get(b.id) });
    });
    return Array.from(dateMap.values())
      .sort((a, b) => b.key.localeCompare(a.key))
      .map((d) => ({ ...d, persons: Array.from(d.persons.values()) }));
  }, [bookings, isViewer, user?.uid]);

  useEffect(() => {
    if (groupedByDate.length > 0) {
      setExpandedDates((prev) => {
        if (prev.size > 0) return prev;
        return new Set([groupedByDate[0].key]);
      });
    }
  }, [groupedByDate]);

  const toggleDate = (key: string) =>
    setExpandedDates((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const openReturn = (b: Booking) => {
    if (submittedReturns.current.has(b.id)) return;
    const qtys: Record<string, number> = {};
    b.items.forEach((item) => { qtys[item.productId] = item.quantity; });
    setReturnBooking(b);
    setReturnQtys(qtys);
    setReturnError(null);
    setReturnConfirm(false);
  };

  const closeReturn = () => {
    if (returnTimerRef.current) { clearTimeout(returnTimerRef.current); returnTimerRef.current = null; }
    setReturnBooking(null); setReturnConfirm(false); setReturnError(null); setReturnSuccess(false);
  };

  const handleReturn = async () => {
    if (!returnBooking || returning || !user) return;
    if (submittedReturns.current.has(returnBooking.id)) return;
    submittedReturns.current.add(returnBooking.id);
    setReturning(true);
    try {
      const filteredItems = returnBooking.items.filter((item) => (returnQtys[item.productId] ?? 0) > 0);
      const bookingItems: BookingItem[] = filteredItems.map((item) => ({ ...item, quantity: returnQtys[item.productId] }));
      await createReturnBooking(returnBooking.id, bookingItems);
      setReturnSuccess(true);
      returnTimerRef.current = setTimeout(closeReturn, 1200);
    } catch (e) {
      submittedReturns.current.delete(returnBooking.id);
      setReturnError(e instanceof Error ? e.message : "Fehler beim Zurückbuchen.");
      setReturnConfirm(false);
    } finally {
      setReturning(false);
    }
  };

  const filtered = historyFilter.trim()
    ? groupedByDate
      .map((dg) => ({ ...dg, persons: dg.persons.filter((p) => p.name.toLowerCase().includes(historyFilter.toLowerCase())) }))
      .filter((dg) => dg.persons.length > 0)
    : groupedByDate;

  return (
    <>
      {returnBooking && (
        <BottomSheet onClose={closeReturn}>
          {!returnConfirm ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Undo2 size={18} color="#2C2926" /><span className="text-[17px] font-extrabold text-[#0f172a]">Zurückbuchen</span></div>
                <button className="bg-transparent border-none cursor-pointer flex p-0.5" onClick={closeReturn}><X size={18} color="#94a3b8" /></button>
              </div>
              <p className="text-[13px] text-[#64748b] leading-normal m-0">Passe die Mengen an und bestätige die Rückbuchung.</p>
              <div className="flex flex-col gap-2.5">
                {returnBooking.items.map((item) => (
                  <div key={item.productId} className="flex items-center justify-between gap-3 bg-[#f8fafc] rounded-xl px-3.5 py-2.5">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[13px] font-semibold text-[#0f172a]">{item.productName}</span>
                      <span className="text-[11px] text-[#94a3b8]">max. {item.quantity} {item.unit}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button className="w-11 h-11 rounded-lg bg-[#e2e8f0] border-none cursor-pointer flex items-center justify-center" onClick={() => setReturnQtys((q) => ({ ...q, [item.productId]: Math.max(0, (q[item.productId] ?? item.quantity) - 1) }))}><Minus size={13} /></button>
                      <span className="text-[16px] font-bold text-[#0f172a] min-w-[24px] text-center">{returnQtys[item.productId] ?? item.quantity}</span>
                      <button className="w-11 h-11 rounded-lg bg-[#e2e8f0] border-none cursor-pointer flex items-center justify-center" onClick={() => setReturnQtys((q) => ({ ...q, [item.productId]: Math.min(item.quantity, (q[item.productId] ?? item.quantity) + 1) }))}><Plus size={13} /></button>
                      <span className="text-xs text-[#64748b] min-w-[28px]">{item.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2.5">
                <button className="flex-1 bg-[#f1f5f9] border-none rounded-xl py-[13px] text-sm font-semibold text-[#0f172a] cursor-pointer" onClick={closeReturn}>Abbrechen</button>
                <button className="flex-1 bg-[#2C2926] border-none rounded-xl py-[13px] text-sm font-bold text-white cursor-pointer" onClick={() => setReturnConfirm(true)}
                  disabled={returnBooking.items.every((i) => (returnQtys[i.productId] ?? i.quantity) === 0)}>Weiter</button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Undo2 size={18} color="#2C2926" /><span className="text-[17px] font-extrabold text-[#0f172a]">Bestätigen</span></div>
                <button className="bg-transparent border-none cursor-pointer flex p-0.5" onClick={closeReturn}><X size={18} color="#94a3b8" /></button>
              </div>
              <p className="text-[13px] text-[#64748b] leading-normal m-0">Folgende Gegenstände werden zurückgebucht und der Lagerbestand wiederhergestellt:</p>
              <div className="flex flex-col gap-2.5">
                {returnBooking.items
                  .filter((i) => (returnQtys[i.productId] ?? i.quantity) > 0)
                  .map((item) => (
                    <div key={item.productId} className="flex items-center justify-between gap-3 bg-[#f8fafc] rounded-xl px-3.5 py-2.5">
                      <span className="text-[13px] font-semibold text-[#0f172a]">{item.productName}</span>
                      <span className="text-sm font-bold text-[#2C2926]">{returnQtys[item.productId] ?? item.quantity} {item.unit}</span>
                    </div>
                  ))}
              </div>
              {returnError && <div className="bg-[#fef2f2] border border-[#fecaca] rounded-[10px] px-3 py-2 text-[13px] text-[#dc2626]">{returnError}</div>}
              <div className="flex gap-2.5">
                <button className="flex-1 bg-[#f1f5f9] border-none rounded-xl py-[13px] text-sm font-semibold text-[#0f172a] cursor-pointer" onClick={() => { setReturnConfirm(false); setReturnError(null); }} disabled={returning || returnSuccess}>Zurück</button>
                <button
                  className={clsx("flex-1 border-none rounded-xl py-[13px] text-sm font-bold text-white cursor-pointer transition-[background] duration-[400ms] ease-in-out", returning && "opacity-70")}
                  style={{
                    background: returnSuccess ? "linear-gradient(135deg,#16a34a,#15803d)" : "linear-gradient(135deg,#2C2926,#2C2926)",
                  }}
                  onClick={handleReturn} disabled={returning || returnSuccess}>
                  {returnSuccess ? "✓ Zurückgebucht" : returning ? "Wird gebucht…" : "Jetzt zurückbuchen"}
                </button>
              </div>
            </>
          )}
        </BottomSheet>
      )}

      <div className="flex flex-col gap-2.5">
        {groupedByDate.length > 0 && (
          <input className="border-[1.5px] border-c-border rounded-xl px-3.5 py-2.5 text-sm outline-none bg-c-surface text-c-text-1 w-full box-border" placeholder="Nach Person filtern…"
            value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} />
        )}
        {filtered.length === 0 ? (
          <div className="text-center px-5 py-12 flex flex-col items-center gap-3">
            <Clock size={40} color="var(--c-border)" />
            <p className="text-sm text-c-text-3">Noch keine Abbuchungen</p>
          </div>
        ) : (
          filtered.map((dateGroup) => {
            const isDateOpen = expandedDates.has(dateGroup.key);
            return (
              <div key={dateGroup.key} className="bg-c-surface rounded-[14px] overflow-hidden mb-2">
                <button className="w-full flex items-center justify-between gap-2.5 px-3.5 py-3 bg-transparent border-none cursor-pointer text-left" onClick={() => toggleDate(dateGroup.key)}>
                  <span className="text-sm font-bold text-c-text-1">{dateGroup.label}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-semibold text-c-text-3">{dateGroup.totalCount} Buchung{dateGroup.totalCount !== 1 ? "en" : ""}</span>
                    <ChevronDown size={16} color="var(--c-text-3)" style={{ transform: isDateOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                  </div>
                </button>
                {isDateOpen && (
                  <div className="border-t border-c-border-2 px-2.5 pt-2 pb-2.5 flex flex-col gap-2.5">
                    {dateGroup.persons.map((person) => (
                      <div key={person.userId} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 px-0.5 py-1">
                          <div className="w-6 h-6 rounded-full bg-[#2C2926] text-white flex items-center justify-center text-[10px] font-bold shrink-0">{person.initials}</div>
                          <span className="text-xs font-bold text-c-text-2">{person.name}</span>
                        </div>
                        {person.entries.map(({ booking: b, number, returnBooking: rb }) => {
                          const isOpen = expandedId === b.id;
                          const timeStr = b.createdAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
                          return (
                            <div key={b.id} className="bg-c-surface-2 rounded-[10px]">
                              <div className="flex items-center">
                                <button className="flex-1 flex items-center justify-between gap-3 px-3 py-2.5 bg-transparent border-none cursor-pointer text-left" onClick={() => setExpandedId(isOpen ? null : b.id)}>
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="text-sm font-bold text-c-text-1">{timeStr} Uhr</span>
                                    <span className="text-[11px] text-c-text-3 font-medium">#{number}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[11px] font-semibold text-[#2C2926] bg-c-accent rounded-[6px] px-[7px] py-0.5">{b.items.length} Artikel</span>
                                    <ChevronDown size={16} color="var(--c-text-3)" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                                  </div>
                                </button>
                                {(rb || submittedReturns.current.has(b.id))
                                  ? <span className="text-[13px] font-semibold text-[#16a34a] bg-[#dcfce7] rounded-[11px] px-2.5 h-11 shrink-0 mx-2 whitespace-nowrap flex items-center gap-1.5"><Undo2 size={18} color="#16a34a" /> zurück</span>
                                  : <button className="bg-[#2C2926] border-none rounded-[11px] cursor-pointer w-11 h-11 flex items-center justify-center shrink-0 mx-2" onClick={() => openReturn(b)}><Undo2 size={18} color="#fff" /></button>
                                }
                              </div>
                              {isOpen && (
                                <div className="border-t border-c-border-2 px-3 pt-2 pb-2.5 flex flex-col">
                                  {b.items.map((item, idx) => (
                                    <div key={item.productId} className="flex justify-between items-center gap-2 py-2" style={{ borderBottom: idx < b.items.length - 1 ? "1px solid var(--c-border-2)" : "none" }}>
                                      <div className="flex flex-col gap-0.5 min-w-0">
                                        <span className="text-[13px] text-c-text-1 font-medium">{item.productName}</span>
                                        <span className="flex items-center gap-[3px] text-[11px] text-[#2C2926] font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
                                          <MapPin size={11} color="#2C2926" className="shrink-0" />
                                          {formatLocation(item.parentName, item.boxName)}
                                          {item.boxNumber != null && (
                                            <span className="shrink-0 text-[10px] font-bold text-[#2C2926] bg-c-accent rounded-[6px] px-1.5 py-0.5">#{item.boxNumber}</span>
                                          )}
                                        </span>
                                      </div>
                                      <span className="text-[13px] font-bold text-[#2C2926] shrink-0">{item.quantity} {item.unit}</span>
                                    </div>
                                  ))}
                                  {rb && (
                                    <div className="mt-2 border-t border-[#86efac] pt-2 flex flex-col gap-1">
                                      <div className="text-[11px] font-bold text-[#16a34a] mb-0.5">
                                        <Undo2 size={11} className="inline align-middle mr-1" /> Zurückgebucht um {rb.createdAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
                                      </div>
                                      {rb.items.map((item) => (
                                        <div key={item.productId} className="flex justify-between items-center py-0.5">
                                          <span className="text-xs text-[#15803d]">{item.productName}</span>
                                          <span className="text-xs font-bold text-[#16a34a]">+{item.quantity} {item.unit}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
