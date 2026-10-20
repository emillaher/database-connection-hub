import { createFileRoute } from "@tanstack/react-router";
import { memo, useEffect, useState } from "react";
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
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
      { rel: "stylesheet", href: "/legacy/styles.css" },
    ],
  }),
  component: Index,
});

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.setAttribute("data-src", src);
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
  useEffect(() => {
    document.documentElement.classList.add("dark");
    window.__sb = supabase;

    let isMounted = true;

    (async () => {
      // 1. Tailwind (optional runtime fallback for dynamic classes)
      try {
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
      } catch (err) {
        console.warn("Tailwind CDN optional warning:", err);
      }

      // 2. Lucide Icons
      try {
        await loadScript("https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js");
      } catch (err) {
        console.warn("Lucide CDN load warning:", err);
      }

      // 3. Legacy Application Script
      try {
        await loadScript("/legacy/app.js");
      } catch (err) {
        console.error("legacy app.js load error:", err);
      }

      // 4. Initialisierung starten (mit DOM-Ready Polling falls nötig)
      const tryInit = () => {
        if (!isMounted) return;
        if (typeof window.__studyTrackInit === "function") {
          const coursesGrid = document.getElementById("courses-grid");
          if (coursesGrid) {
            window.__studyTrackInit().catch((err) => console.error("studyTrackInit error:", err));
          } else {
            setTimeout(tryInit, 50);
          }
        } else {
          setTimeout(tryInit, 50);
        }
      };

      tryInit();
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="w-full min-h-screen">
      <LegacyBody />
    </div>
  );
}

const legacyMarkup = { __html: bodyHtml };

// Rendered once and memoized so React never re-applies the markup
// after the legacy script has populated it.
const LegacyBody = memo(function LegacyBody() {
  return (
    <div
      className="bg-[#0b0f19] text-slate-100 min-h-screen flex flex-col antialiased"
      dangerouslySetInnerHTML={legacyMarkup}
    />
  );
});
