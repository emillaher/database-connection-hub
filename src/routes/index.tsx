import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import bodyHtml from "@/legacy/body.html?raw";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StudyTrack | Anwesenheits- & Fehlzeitenrechner für Studierende" },
      {
        name: "description",
        content:
          "Präziser Anwesenheits-, Fehlzeiten- und Prüfungszulassungsrechner für Studierende mit Ampelsystem und Kalender-Import.",
      },
      { property: "og:title", content: "StudyTrack – Anwesenheitsrechner" },
      {
        property: "og:description",
        content: "Behalte Anwesenheiten, Fehlzeiten und Prüfungszulassungen je Fach im Blick.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "stylesheet", href: "/legacy/styles.css" }],
  }),
  component: Index,
});

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

declare global {
  interface Window {
    __sb: typeof supabase;
    __studyTrackInit?: () => Promise<void>;
    tailwind?: { config: unknown };
  }
}

function Index() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    window.__sb = supabase;
    (async () => {
      await loadScript("https://cdn.tailwindcss.com");
      if (window.tailwind) {
        window.tailwind.config = {
          darkMode: "class",
          theme: {
            extend: {
              colors: {
                brand: { 50: "#eef2ff", 100: "#e0e7ff", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca" },
              },
            },
          },
        };
      }
      await loadScript("https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js");
      await loadScript("/legacy/app.js");
      await window.__studyTrackInit?.();
      setReady(true);
    })().catch((e) => console.error(e));
  }, []);

  return (
    <div
      className="bg-[#0b0f19] text-slate-100 min-h-screen flex flex-col antialiased"
      style={{ visibility: ready ? "visible" : "hidden" }}
      dangerouslySetInnerHTML={{ __html: bodyHtml }}
    />
  );
}
