# UI/UX Plan — Iteration 3 (2026-06-08)

## Goals

1. Migrate viewer component strings (PDF/PPTX/Markdown) to `viewers` i18n namespace
2. Continue iOS MeeshyColors migration for clear brand-identity hex literals

---

## Web: Viewer i18n

### Step 1 — Create `viewers` locale files (×4 languages)

`apps/web/locales/{en,fr,es,pt}/viewers.json` — keys:
- `pdf.{loadError, openInNewTab, download, downloadPdf, delete, fullscreen, close, nativeControls}`
- `pptx.{loadError, publicRequired, downloadFile, delete, fullscreen, download}`
- `markdown.{loadError, document, formattedView, rawView, download, close, escToClose}`

### Step 2 — Register namespace in all four `index.ts` files

Add `import viewers from './viewers.json'` and include in exports.

### Step 3 — Update components

Each component gets `const { t } = useI18n('viewers')` and replaces hardcoded strings.

- `PDFViewerWrapper.tsx`: remove `errorMessage` state, inline `t('pdf.loadError')` in JSX
- `PDFLightboxSimple.tsx`: replace all 7 French strings
- `PPTXViewer.tsx`: remove `errorMessage` state, inline `t('pptx.loadError')` in JSX; replace 5 more
- `MarkdownLightbox.tsx`: replace 6 strings

---

## iOS: MeeshyColors Migration

### Files to update

1. `LanguagePickerSheet.swift` — lines 52, 75, 83: `Color(hex: "6366F1")` → `MeeshyColors.indigo500`
2. `MiniAudioPlayerBar.swift` — line 124: gradient colors → `MeeshyColors.indigo500/indigo700`; line 142: `.tint` → `MeeshyColors.indigo500`
3. `ConversationView.swift` — lines 475, 477: `Color(hex: "4ECDC4")` → `MeeshyColors.indigo400`

---

## Commit & CI

Single commit: `uiux(iter-3): viewer i18n + iOS MeeshyColors brand colors`
Push → CI → merge to main → start iteration 4.
