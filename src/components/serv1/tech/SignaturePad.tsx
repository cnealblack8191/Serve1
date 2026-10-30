import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

export interface SignaturePadHandle {
  clear(): void;
  toBlob(): Promise<Blob | null>;
}

/**
 * Plain canvas the customer signs with a finger, pen or mouse.
 * The pad is always white with dark ink so the saved PNG reads well in any theme.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { onInk: (hasInk: boolean) => void }>(
  function SignaturePad({ onInk }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);

    const paintBackground = useCallback(() => {
      const c = canvas.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      const ratio = window.devicePixelRatio || 1;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111827";
    }, []);

    // Size the drawing surface to the element (sharp lines on high-density phone screens).
    useEffect(() => {
      const c = canvas.current;
      if (!c) return;
      const ratio = window.devicePixelRatio || 1;
      c.width = Math.round(c.clientWidth * ratio);
      c.height = Math.round(c.clientHeight * ratio);
      paintBackground();
    }, [paintBackground]);

    useImperativeHandle(ref, () => ({
      clear() {
        paintBackground();
        onInk(false);
      },
      toBlob() {
        return new Promise((resolve) => canvas.current?.toBlob(resolve, "image/png"));
      },
    }));

    const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = point(e);
      const ctx = e.currentTarget.getContext("2d");
      if (ctx) {
        // A tap leaves a dot.
        ctx.beginPath();
        ctx.arc(last.current.x, last.current.y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = "#111827";
        ctx.fill();
      }
      onInk(true);
    };
    const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current || !last.current) return;
      const ctx = e.currentTarget.getContext("2d");
      const p = point(e);
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(last.current.x, last.current.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      last.current = p;
    };
    const onUp = () => {
      drawing.current = false;
      last.current = null;
    };

    return (
      <canvas
        ref={canvas}
        className="block h-56 w-full touch-none rounded-md bg-white ring-1 ring-border"
        aria-label="Signature pad: sign here with your finger"
        role="img"
        data-testid="signature-pad"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
      />
    );
  },
);
