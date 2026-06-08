# UI/UX Plan — Iteration 5 (2026-06-08)

## Goals

1. iOS : MeeshyColors migration pour 12 fichiers (ChangePasswordView, SettingsView, ConversationView+MessageRow, ProfileView, BubbleQuotedReply, BubbleStandardLayout, BubbleStandardLayout+Media, FeedView, FeedView+Attachments, ConversationListHelpers, AffiliateView, RequestsTab)
2. iOS : Dynamic Type dans le dossier Contacts (5 fichiers)
3. Web : `rel="noopener noreferrer"` sur liens `target="_blank"` (3 fichiers)
4. Web : i18n AudioControls aria-labels (audioEffects.json + AudioControls.tsx + AudioTranscriptionPanel.tsx)

---

## A · iOS — MeeshyColors Migration

### ChangePasswordView.swift
- L191, L195: `Color(hex: "4ADE80")` → `MeeshyColors.success`
- L208: `Color(hex: "EF4444")` → `MeeshyColors.error`
- L248: `Color(hex: "4ADE80")` → `MeeshyColors.success`
- L260: `Color(hex: "4ADE80").opacity(0.3)` → `MeeshyColors.success.opacity(0.3)`

### SettingsView.swift
- L622: `.foregroundColor(Color(hex: "EF4444"))` → `.foregroundColor(MeeshyColors.error)`
- L627: `Color(hex: "EF4444").opacity(0.1)` → `MeeshyColors.error.opacity(0.1)`
- L630: `Color(hex: "EF4444").opacity(0.3)` → `MeeshyColors.error.opacity(0.3)`

### ConversationView+MessageRow.swift
- L504, L509: `Color(hex: "FF6B6B")` → `MeeshyColors.error`

### ProfileView.swift
- L716 badge vérifié: `Color(hex: "4ADE80")` → `MeeshyColors.success`
- L716 badge non vérifié: `Color(hex: "F59E0B")` → `MeeshyColors.warning`

### BubbleQuotedReply.swift
- L80: `Color(hex: "818CF8")` → `MeeshyColors.indigo400`

### BubbleStandardLayout.swift
- L934: `Color(hex: "818CF8")` → `MeeshyColors.indigo400`

### BubbleStandardLayout+Media.swift
- L373: `Color(hex: "FF6B6B").opacity(0.85)` → `MeeshyColors.error.opacity(0.85)`

### FeedView.swift
- L1076: `Color(hex: "FF6B6B")` → `MeeshyColors.error`
- L1094: `Color(hex: "2ECC71")` → `MeeshyColors.success`

### FeedView+Attachments.swift
- L365: gradient `[Color(hex: "2ECC71"), Color(hex: "27AE60")]` → `[MeeshyColors.success, MeeshyColors.success.opacity(0.7)]`
- L668: `Color(hex: "FF6B6B")` → `MeeshyColors.error`
- L683: `Color(hex: "2ECC71")` → `MeeshyColors.success`

### ConversationListHelpers.swift
- L152 dark: `Color(hex: "818CF8").opacity(0.5)` → `MeeshyColors.indigo400.opacity(0.5)`
- L152 light: `Color(hex: "6366F1").opacity(0.4)` → `MeeshyColors.indigo500.opacity(0.4)`
- L167: `.fill(Color(hex: "2ECC71"))` → `.fill(MeeshyColors.success)`
- L171: `.foregroundColor(Color(hex: "2ECC71"))` → `.foregroundColor(MeeshyColors.success)`

### AffiliateView.swift
- L212, L241: `Color(hex: "2ECC71")` → `MeeshyColors.success`
- L249: `Color(hex: "EF4444")` → `MeeshyColors.error`

### RequestsTab.swift
- L164: gradient `[MeeshyColors.success, Color(hex: "2ECC71")]` → `[MeeshyColors.success, MeeshyColors.success.opacity(0.7)]`

---

## B · iOS — Dynamic Type : Dossier Contacts

Remplacer `.font(.system(size: X, weight: Y))` par des fonts sémantiques SwiftUI :

| Taille | Font sémantique |
|--------|----------------|
| 10–11pt | `.caption2` |
| 12pt | `.caption` |
| 13–14pt | `.subheadline` |
| 15–16pt | `.callout` |
| 17pt | `.body` |
| 18pt+ | `.headline` |
| 32–48pt (icône état vide) | `.system(size: X, weight: Y).scaledToFit()` avec `.minimumScaleFactor(0.5)` |

Fichiers : `ContactsListTab.swift`, `DiscoverTab.swift`, `BlockedTab.swift`, `RequestsTab.swift`, `ContactsHubView.swift`

Approche : remplacer `.font(.system(size: X))` → `.font(.sémantique)` tout en préservant les `.fontWeight()` quand nécessaire via `.font(.sémantique.weight(.medium))`.

---

## C · Web — Sécurité : rel="noopener noreferrer"

Pour chaque lien `target="_blank"` sans `rel` :
- Ajouter `rel="noopener noreferrer"`

Fichiers :
1. `components/landing/LandingContent.tsx`
2. `components/layout/Footer.tsx`
3. `components/chat/message-with-links.tsx`

---

## D · Web — i18n : AudioControls

### Step 1 — Ajouter clés à audioEffects.json (×4 langues : fr, en, es, pt)

Namespace `audioEffects.controls` :
- `speedSlider.ariaLabel`: "Ajuster la vitesse de lecture" / "Adjust playback speed" / "Ajustar velocidad de reproducción" / "Ajustar velocidade de reprodução"
- `transcription.inProgress.title`: "Transcription en cours..." / "Transcription in progress..." / "Transcripción en curso..." / "Transcrição em andamento..."
- `transcription.inProgress.ariaLabel`: "Transcription en cours" / "Transcription in progress" / "Transcripción en curso" / "Transcrição em andamento"
- `transcription.view.title`: "Voir la transcription" / "View transcription" / "Ver transcripción" / "Ver transcrição"
- `transcription.toggle.ariaLabel`: "Afficher/masquer la transcription" / "Show/hide transcription" / "Mostrar/ocultar transcripción" / "Mostrar/ocultar transcrição"
- `transcription.request.ariaLabel`: "Demander la transcription" / "Request transcription" / "Solicitar transcripción" / "Solicitar transcrição"
- `transcription.request.title`: "Transcrire l'audio (texte)" / "Transcribe audio (text)" / "Transcribir audio (texto)" / "Transcrever áudio (texto)"
- `transcription.expandMore`: "Voir plus de transcription" / "Show more transcription" / "Ver más transcripción" / "Ver mais transcrição"
- `transcription.expandLess`: "Voir moins de transcription" / "Show less transcription" / "Ver menos transcripción" / "Ver menos transcrição"

### Step 2 — Mettre à jour AudioControls.tsx

Ajouter `const t = useTranslations('audioEffects')` et remplacer les 6 strings hardcodées.

### Step 3 — Mettre à jour AudioTranscriptionPanel.tsx

Ajouter `const t = useTranslations('audioEffects')` et remplacer l'aria-label conditionnel.

---

## Commit & CI

Commit unique : `uiux(iter-5): MeeshyColors contacts+feed+bubble + Dynamic Type contacts + web security + audio i18n`
Push → CI → merge to main → démarrer itération 6.
