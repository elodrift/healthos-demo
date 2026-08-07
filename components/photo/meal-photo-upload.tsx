"use client";

import { useCallback, useRef, useState } from "react";

import type { RecognitionResult } from "@/lib/food/recognize";

import { MealConfirm } from "./meal-confirm";

/** Mirrors MAX_PHOTO_BYTES on the server so the UI can refuse early. */
const MAX_BYTES = 4_000_000;

/** Only formats the server-side stripper can guarantee clean. */
const ACCEPT = "image/jpeg,image/png,image/webp";

interface UploadedPhoto {
  pathname: string;
  removed: string[];
  bytesBefore: number;
  bytesAfter: number;
  recognition: RecognitionResult;
}

type State =
  | { kind: "idle" }
  | { kind: "uploading"; previewUrl: string }
  | { kind: "done"; photo: UploadedPhoto }
  | { kind: "error"; message: string };

export function MealPhotoUpload({ onLogged }: { onLogged?: () => void }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  const releasePreview = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      // Refuse locally first so an obviously-too-large photo doesn't spend the
      // user's data allowance only to be rejected by the server.
      if (file.size > MAX_BYTES) {
        setState({
          kind: "error",
          message: `That photo is ${(file.size / 1_000_000).toFixed(1)}MB. The limit is ${
            MAX_BYTES / 1_000_000
          }MB, because location data is removed on the server before the photo is stored.`,
        });
        return;
      }

      releasePreview();
      const previewUrl = URL.createObjectURL(file);
      previewRef.current = previewUrl;
      setState({ kind: "uploading", previewUrl });

      try {
        const body = new FormData();
        body.set("file", file);
        const res = await fetch("/api/meal-photo/upload", { method: "POST", body });
        const json = (await res.json().catch(() => null)) as
          | (UploadedPhoto & { error?: string })
          | { error: string }
          | null;

        if (!res.ok) {
          setState({
            kind: "error",
            message: json && "error" in json && json.error ? json.error : "That photo could not be uploaded.",
          });
          return;
        }

        setState({ kind: "done", photo: json as UploadedPhoto });
      } catch {
        setState({ kind: "error", message: "The upload failed. Check your connection and try again." });
      } finally {
        // The <input> keeps its value, so picking the same file twice would
        // otherwise fire no change event.
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [releasePreview],
  );

  return (
    <section className="rounded-2xl border border-base-700 bg-base-850 p-4 shadow-card">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink-hi">Meal photo</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-lo">
        Location data is removed on the server before the photo is stored. You&apos;ll see exactly what was
        taken out.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        id="meal-photo-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {state.kind === "uploading" ? (
        <div className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote asset */}
          <img
            src={state.previewUrl}
            alt=""
            className="h-40 w-full rounded-xl object-cover opacity-40"
          />
          <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-mid">
            <span className="inline-flex gap-1" aria-hidden="true">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-blink" />
              <span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-blink [animation-delay:0.2s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-blink [animation-delay:0.4s]" />
            </span>
            Removing location data, then estimating…
          </p>
        </div>
      ) : null}

      {state.kind === "done" ? (
        <div className="mt-4">
          {/*
            Served through the authenticated route, never a raw blob URL: the
            store is private, so blob.url would not load.
            eslint-disable-next-line @next/next/no-img-element
          */}
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated stream, not a static asset */}
          <img
            src={`/api/meal-photo?pathname=${encodeURIComponent(state.photo.pathname)}`}
            alt="The meal you just uploaded"
            className="h-40 w-full rounded-xl border border-base-700 object-cover"
          />

          {/*
            The receipt. The privacy policy claims metadata is stripped; this
            shows the specific segments that were removed from THIS photo, so
            the claim is visible rather than merely asserted. An empty list is
            reported as such rather than dressed up as a removal.
          */}
          <dl className="mt-3 rounded-xl border border-base-700 bg-base-900 p-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">Removed</dt>
            <dd className="mt-1.5">
              {state.photo.removed.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {state.photo.removed.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[13px] text-ink-mid">
                      <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-green" />
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-mid">
                  Nothing to remove — this photo carried no metadata.
                </p>
              )}
            </dd>
            {/*
              Rounding both sides to kB rendered as "2141kB -> 2141kB", which
              reads as though nothing happened and undercuts the whole receipt.
              The removed metadata is what matters here, so state it directly
              in bytes and give the stored size as context.
            */}
            <dd className="mt-2 font-mono text-[11px] text-ink-lo">
              {state.photo.bytesBefore > state.photo.bytesAfter
                ? `${(state.photo.bytesBefore - state.photo.bytesAfter).toLocaleString()} bytes removed · `
                : ""}
              {(state.photo.bytesAfter / 1_000_000).toFixed(1)}MB stored
            </dd>
          </dl>

          <MealConfirm
            recognition={state.photo.recognition}
            photoPathname={state.photo.pathname}
            onLogged={() => {
              releasePreview();
              setState({ kind: "idle" });
              onLogged?.();
            }}
          />

          <label
            htmlFor="meal-photo-input"
            className="mt-3 inline-flex min-h-[40px] w-full cursor-pointer items-center justify-center rounded-lg border border-base-600 px-3 text-[13px] font-medium text-ink-hi"
          >
            Replace photo
          </label>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="mt-4">
          <p
            role="alert"
            className="rounded-xl border border-base-600 bg-base-900 p-3 text-[13px] leading-relaxed text-ink-mid"
          >
            {state.message}
          </p>
          <label
            htmlFor="meal-photo-input"
            className="mt-3 inline-flex min-h-[40px] w-full cursor-pointer items-center justify-center rounded-lg border border-base-600 px-3 text-[13px] font-medium text-ink-hi"
          >
            Choose another photo
          </label>
        </div>
      ) : null}

      {state.kind === "idle" ? (
        <label
          htmlFor="meal-photo-input"
          className="mt-4 flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg bg-accent-green px-4 text-[14px] font-semibold text-base-950"
        >
          Choose a photo
        </label>
      ) : null}

      <p className="mt-3 text-[12px] leading-relaxed text-ink-lo">
        JPEG, PNG or WebP, up to {MAX_BYTES / 1_000_000}MB. iPhone photos are often HEIC — set Settings
        &rsaquo; Camera &rsaquo; Formats to &ldquo;Most Compatible&rdquo;, since location data cannot yet
        be removed from HEIC.
      </p>
    </section>
  );
}
