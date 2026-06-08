# UI/UX Plan — Iteration 5 (2026-06-08)

## Goals

1. iOS: Dynamic Type migration for `ThreadView.swift` (13 fixed font sizes)
2. iOS: `PrivacySettingsView.swift` — replace hardcoded accentColor hex with `MeeshyColors.indigo300`
3. Web: Extend `viewers` i18n namespace with `common`, `audio`, `video`, `image` keys; update 9 media components
4. Web: Fix `SystemStatusBanner.tsx` dark mode dismiss button

---

## iOS: ThreadView Dynamic Type

### File: `apps/ios/Meeshy/Features/Main/Views/ThreadView.swift`

Semantic font mapping (replace `.system(size: X)` by role):

| Line(s) | From | To |
|---------|------|----|
| 48 | `.system(size: 14)` | `.subheadline` |
| 55 | `.system(size: 12)` | `.caption` |
| 61 | `.system(size: 11)` | `.caption2` |
| 95 | `.system(size: 13)` | `.callout` |
| 99 | `.system(size: 11)` | `.caption2` |
| 107 | `.system(size: 13)` | `.callout` |
| 128 | `.system(size: 12)` | `.caption` |
| 159 | `.system(size: 12)` | `.caption` |
| 163 | `.system(size: 10)` | `.caption2` |
| 168 | `.system(size: 12)` | `.caption` |
| 183 | `.system(size: 11)` | `.caption2` |
| 194 | `.system(size: 12)` | `.caption` |
| 216 | `.system(size: 14)` | `.subheadline` |

Add `.weight(.semibold/.medium)` modifier when original had a weight.

---

## iOS: PrivacySettingsView Accent Color

### File: `apps/ios/Meeshy/Features/Main/Views/PrivacySettingsView.swift`

Replace:
```swift
private let accentColor = "08D9D6"
```
With:
```swift
private var accentColor: Color { MeeshyColors.indigo300 }
```

Update all usages:
- `.tint(Color(hex: accentColor))` → `.tint(accentColor)`
- `Color(hex: accentColor)` → `accentColor`

---

## Web: Extend `viewers` Namespace

### Step 1 — Add keys to all 4 locale files

Under `viewers.common`:
- `download`: "Download" / "Télécharger" / "Descargar" / "Baixar"
- `downloadFile`: "Download file" / "Télécharger le fichier" / "Descargar archivo" / "Baixar arquivo"
- `copyContent`: "Copy content" / "Copier le contenu" / "Copiar contenido" / "Copiar conteúdo"

Under `viewers.audio`:
- `download`: "Download audio" / "Télécharger l'audio" / "Descargar audio" / "Baixar áudio"

Under `viewers.video`:
- `download`: "Download video" / "Télécharger la vidéo" / "Descargar vídeo" / "Baixar vídeo"

Under `viewers.image`:
- `download`: "Download image" / "Télécharger l'image" / "Descargar imagen" / "Baixar imagem"

Under `viewers.pptx` (extend existing):
- `downloadPptx`: "Download presentation" / "Télécharger la présentation" / "Descargar presentación" / "Baixar apresentação"

### Step 2 — Update 9 components

Each gets `const { t } = useI18n('viewers')` (or reuses existing) and replaces hardcoded strings:

1. `MarkdownViewer.tsx` line 244: `title="Télécharger"` → `title={t('common.download')}`
2. `TextViewer.tsx` lines 285, 313: copy + download strings
3. `TextLightbox.tsx` lines 247, 271: copy + download strings
4. `SimpleAudioPlayer.tsx` lines 260–261: `title` + `aria-label`
5. `VideoLightbox.tsx` line 458: download string
6. `VideoControls.tsx` line 153: download string
7. `PPTXLightbox.tsx` line 90: download presentation string
8. `PDFViewer.tsx` line 260: download string
9. `ImageLightbox.tsx` line 183: download image string

---

## Web: SystemStatusBanner Dark Mode

### File: `apps/web/components/layout/SystemStatusBanner.tsx`

Line ~73 dismiss button background:
```
bg-white text-blue-600 hover:bg-blue-50
→
bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700
```

---

## Commit & CI

Single commit: `uiux(iter-5): Dynamic Type (ThreadView), PrivacySettingsView colors, viewers i18n, dark mode`
Push → CI → merge to main → start iteration 6.

## Statut

- [x] Analyse créée
- [x] Plan créé
- [x] iOS: ThreadView Dynamic Type
- [x] iOS: PrivacySettingsView accentColor
- [x] Web: viewers locale extension (4 languages — common/audio/video/image/text/markdown.delete/pptx.downloadPresentation)
- [x] Web: 7 media components i18n (MarkdownViewer, TextViewer, TextLightbox, SimpleAudioPlayer, PPTXLightbox, VideoControls, PDFViewer)
- [x] Web: SystemStatusBanner dark mode
- [ ] Commit + push
- [ ] CI pass
- [ ] Merge dans main
