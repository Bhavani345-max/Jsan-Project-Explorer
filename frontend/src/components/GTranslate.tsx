"use client";

// ------------------------------------------------------------------
// GTranslate language switcher (gtranslate.io) for the sticky topbar.
//
// This is the OPPOSITE direction to lib/ingest/translate.ts, and the two are
// complementary rather than redundant:
//
//   · translate.ts  — foreign notice data → English, server-side and stored, so
//                     search, facets, exports and the assistant all work in
//                     English. A widget cannot do this: it rewrites what is
//                     painted on screen, so "cadastral survey" would still never
//                     match "kadastrinių matavimų" in a server-side query.
//   · this widget   — the finished English page → the visitor's own language,
//                     client-side and transient. This is exactly what a
//                     localization widget is for.
//
// Loaded lazily on the client. The settings object MUST exist before the widget
// script runs, so both are done in one effect rather than as two <Script> tags,
// whose relative execution order Next does not guarantee.
// ------------------------------------------------------------------
import { useEffect } from "react";

const SCRIPT_ID = "gtranslate-widget";
const SCRIPT_SRC = "https://cdn.gtranslate.net/widgets/latest/dropdown.js";

// Every language the collected notices actually originate in, plus the majors a
// BD team is likely to present in. `default_language` is the language the page
// is authored in — English — which is what the widget translates *from*.
const SETTINGS = {
  default_language: "en",
  detect_browser_language: false, // never surprise a user by auto-switching
  wrapper_selector: ".gtranslate_wrapper",
  languages: [
    "en", "fr", "de", "es", "it", "pt", "nl", "pl", "cs", "sk", "sl", "hr",
    "ro", "bg", "hu", "lt", "lv", "et", "sv", "da", "fi", "no", "el", "id",
    "ar", "hi", "zh-CN",
  ],
};

declare global {
  interface Window {
    gtranslateSettings?: typeof SETTINGS;
  }
}

export function GTranslate() {
  useEffect(() => {
    // Guard against double-injection across client-side navigations.
    if (document.getElementById(SCRIPT_ID)) return;

    window.gtranslateSettings = SETTINGS;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  // `notranslate` on the wrapper keeps the switcher's own language names in
  // their native form — a French speaker looking for "Français" should not find
  // it relabelled.
  return (
    <div
      className="gtranslate_wrapper notranslate hidden sm:block"
      aria-label="Translate this page"
    />
  );
}
