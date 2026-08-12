import React, { useState, useRef, useCallback } from "react";
import { QrCode, Camera, Upload, X } from "lucide-react";
import jsQR from "jsqr";
import BottomSheet from "../../components/BottomSheet";
import { useAuth } from "../../contexts/AuthContext";
import { joinGroup, getSpace } from "../../services/spaces.service";
import type { Space } from "../../types";

type JoinStep = "choose" | "camera" | "uploading" | "joining" | "error";

function extractGroupId(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.searchParams.get("invite");
  } catch {
    return null;
  }
}

interface JoinSheetProps {
  onClose: () => void;
  onJoined: (space: Space) => void;
}

export default function JoinSheet({ onClose, onJoined }: JoinSheetProps): React.ReactElement {
  const { user } = useAuth();
  const [joinStep, setJoinStep] = useState<JoinStep>("choose");
  const [joinError, setJoinError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const close = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  const handleGroupId = useCallback(async (groupId: string) => {
    if (!user) return;
    stopCamera();
    setJoinStep("joining");
    try {
      await joinGroup(groupId, user.uid, user.email ?? "", user.displayName ?? "");
      const space = await getSpace(groupId);
      if (!space) { setJoinError("Ort nicht gefunden."); setJoinStep("error"); return; }
      close();
      onJoined(space);
    } catch {
      setJoinError("Fehler beim Beitreten. Versuche es erneut.");
      setJoinStep("error");
    }
  }, [user, stopCamera, close, onJoined]);

  const startCamera = useCallback(async () => {
    setJoinStep("camera");
    setJoinError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      setJoinError("Kamera konnte nicht geöffnet werden.");
      setJoinStep("error");
      return;
    }

    const scan = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height);
      if (code) {
        const groupId = extractGroupId(code.data);
        if (groupId) { handleGroupId(groupId); return; }
      }
      rafRef.current = requestAnimationFrame(scan);
    };
    rafRef.current = requestAnimationFrame(scan);
  }, [handleGroupId]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJoinStep("uploading");
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height);
      URL.revokeObjectURL(img.src);
      if (!code) {
        setJoinError("Kein QR-Code im Bild gefunden.");
        setJoinStep("error");
        return;
      }
      const groupId = extractGroupId(code.data);
      if (!groupId) {
        setJoinError("QR-Code enthält keinen gültigen Einladungslink.");
        setJoinStep("error");
        return;
      }
      handleGroupId(groupId);
    };
    img.onerror = () => {
      setJoinError("Bild konnte nicht geladen werden.");
      setJoinStep("error");
    };
  }, [handleGroupId]);

  return (
    <BottomSheet onClose={close}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-c-accent rounded-lg flex items-center justify-center">
            <QrCode size={16} color="#2C2926" />
          </div>
          <span className="text-[17px] font-extrabold text-c-text-1">Ort beitreten</span>
        </div>
        <button className="bg-none border-none cursor-pointer flex p-0.5" onClick={close}><X size={18} color="#94a3b8" /></button>
      </div>

      {joinStep === "choose" && (
        <>
          <p className="text-[13px] text-c-text-3 m-0 leading-normal">Scanne den QR-Code des Ortes oder lade ein Bild hoch.</p>
          <div className="grid grid-cols-2 gap-3">
            <button className="flex flex-col items-center gap-2 bg-c-surface-2 border-[1.5px] border-c-border rounded-2xl py-5 px-3 cursor-pointer" onClick={startCamera}>
              <div className="w-[52px] h-[52px] bg-c-accent rounded-[14px] flex items-center justify-center">
                <Camera size={28} color="#2C2926" />
              </div>
              <span className="text-sm font-bold text-c-text-1">Kamera</span>
              <span className="text-[11px] text-c-text-3 text-center">QR-Code scannen</span>
            </button>
            <button className="flex flex-col items-center gap-2 bg-c-surface-2 border-[1.5px] border-c-border rounded-2xl py-5 px-3 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <div className="w-[52px] h-[52px] bg-c-accent rounded-[14px] flex items-center justify-center">
                <Upload size={28} color="#2C2926" />
              </div>
              <span className="text-sm font-bold text-c-text-1">Bild hochladen</span>
              <span className="text-[11px] text-c-text-3 text-center">Aus Fotos wählen</span>
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </>
      )}

      {joinStep === "camera" && (
        <>
          <p className="text-[13px] text-c-text-3 m-0 leading-normal">Halte die Kamera auf den QR-Code des Ortes.</p>
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-square w-full">
            <video ref={videoRef} className="w-full h-full object-cover block" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-[20%] border-[2.5px] border-[#2C2926] rounded-xl" />
          </div>
          <button className="bg-c-surface-2 border-none rounded-xl py-3 text-sm font-semibold text-c-text-2 cursor-pointer w-full" onClick={() => { stopCamera(); setJoinStep("choose"); }}>Abbrechen</button>
        </>
      )}

      {(joinStep === "uploading" || joinStep === "joining") && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-9 h-9 border-[3px] border-c-border border-t-[#2C2926] rounded-full animate-spin" />
          <p className="text-sm text-c-text-3 m-0">
            {joinStep === "uploading" ? "Bild wird gelesen…" : "Ort wird beigetreten…"}
          </p>
        </div>
      )}

      {joinStep === "error" && (
        <>
          <div className="bg-[#fef2f2] border border-[#fecaca] rounded-xl py-3 px-3.5 text-[13px] text-[#dc2626]">{joinError}</div>
          <div className="flex">
            <button className="bg-c-surface-2 border-none rounded-xl py-3 text-sm font-semibold text-c-text-2 cursor-pointer w-full" onClick={() => setJoinStep("choose")}>Erneut versuchen</button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
