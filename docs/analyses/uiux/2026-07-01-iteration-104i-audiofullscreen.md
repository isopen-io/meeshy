# Itération 104i — Analyse UI/UX iOS : `AudioFullscreenView`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`) — indépendante des pistes web/Android.
**Surface** : `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift`
**Base** : `main` HEAD (`ed04f121`)
**Branche** : `claude/upbeat-euler-s5qysh` (repurposée — voir note contention)
**Gate** : CI `iOS Tests` (`ios-tests.yml`)

## Note de contention (essaim d'agents iOS massif)

Cette branche visait initialement `CommunityLinkDetailView` (95i). Au moment du merge,
**un autre agent avait déjà mergé exactement le même travail** sur ce fichier dans `main`
(8 `MeeshyFont.relative`, glyphes figés, `.textSelection`, VoiceOver — version main
légèrement supérieure avec `.accessibilityLabel(label)` sur les boutons d'action). Le
numéro 95i était saturé (TwoFactorSetupView, SupportView, CommunityLinkDetailView, etc.).
Branche **repurposée** sur `AudioFullscreenView` — surface **non réclamée** (vérif PR
ouvertes : aucune ne touche ce fichier ; les PR en vol couvrent LicensesView #1270,
ForwardPickerSheet ×3, EditPostSheet #1289, LoginView #1287, TrackingLinksView #1285,
ConversationListView+Overlays #1280, MessageOverlayMenu #1275, ConversationMediaGalleryView
#1271, UserStatsView #1269, AboutView #1268, etc.). Numéro **104i** = au-dessus de tous les
numéros essaim observés (≤102i) pour éviter la collision.

## Contexte

`AudioFullscreenView` = lecteur audio plein écran (pager horizontal multi-audios +
dismiss vertical). Chaque page : top bar (fermer / pagination / durée / codec / download),
waveform scrollable, contrôles de transport (−10s / play-pause / +10s), seek bar, vitesse,
auteur, caption, transcription (Prisme Linguistique multi-langues), strip de langues.

## État constaté (avant 104i)

La **typographie Dynamic Type était déjà largement migrée** : la quasi-totalité des textes
(pagination, durée, codec, auteur, temps, vitesse, pills de langue, picker) utilisent déjà
`MeeshyFont.relative(...)`. Le vrai défaut n'était **pas** la typo mais l'**accessibilité
VoiceOver** :

1. **Boutons icône-seule sans `.accessibilityLabel`** (défaut a11y majeur — WCAG / HIG) :
   - `xmark` (fermer), `arrow.down.to.line`/états (download), `gobackward.10` (−10s),
     `play.fill`/`pause.fill` (lecture/pause), `goforward.10` (+10s), `translate`
     (choisir une langue). VoiceOver lisait le **nom brut du SF Symbol** (« gobackward.10 »)
     ou rien d'exploitable → contrôles média inutilisables au lecteur d'écran.
2. **Glyphe décoratif d'état vide** (`text.word.spacing` 28pt) annoncé par VoiceOver alors
   que le texte adjacent « Aucune transcription » porte le sens ; taille absolue non
   Dynamic-Type (seul glyphe non-contrôle restant en `.system(size:)`).
3. Les 6 autres `.system(size:)` sont des glyphes de **contrôle/chrome dans des cadres de
   dimension fixe** (fermer/download 36×36, lecture ancré dans cercle 64×64, add-langue
   26×26) ou des contrôles de **transport média** — à garder figés par doctrine (déborderaient
   / romperaient l'alignement du rang de transport s'ils scalaient).

## Corrections appliquées (voir plan 104i)

- **6 `.accessibilityLabel` VoiceOver** sur les boutons icône-seule, réutilisant les clés
  SSOT existantes (`common.close`, `media.playAudio`/`media.pauseAudio`, `media.download`)
  et 4 nouvelles clés inline `defaultValue` (`media.skipBack10s`, `media.skipForward10s`,
  `audio.fullscreen.language.choose`, + états `audio.fullscreen.save.*`). Le download est
  **state-aware** (idle/saving/saved/failed → libellé distinct via `downloadAccessibilityLabel`).
- **1 migration Dynamic Type** : glyphe d'état vide `text.word.spacing` 28 →
  `MeeshyFont.relative(28, weight: .light)` + `.accessibilityHidden(true)` (décoratif).
- **6 glyphes figés à dessein** + commentaires doctrine : chrome fermer/download (cadre 36×36,
  doctrine 82i), transport −10/play/+10 (cohérence du rang, lecture en cercle fixe 64×64),
  add-langue (cercle fixe 26×26, doctrine 86i).

Palette : déjà conforme (accent contact déterministe `Color(hex: contactColor)`, sémantiques
`MeeshyColors.success`/`indigo400`, langues via `LanguageDisplay.colorHex`) → **intacte**.
Liquid Glass : `.ultraThinMaterial` déjà utilisé (capsule pagination) → intact.

## Différé (hors périmètre de cette itération, à faible risque non pris)

- **`seekBar`** : slider custom (DragGesture) sans `.accessibilityValue`/`.accessibilityAdjustableAction`
  → non ajustable au VoiceOver. Amélioration réelle mais nécessite un adaptateur adjustable
  (risque layout) → différé 104i+.
- **`authorInfoRow`** : double bouton (avatar + nom) ouvrant le même profil → pourrait être
  fusionné en un seul élément a11y. Non bloquant (les Text sont lus) → différé.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique métier modifiée, 0 test neuf. 4 clés i18n ajoutées via
  `defaultValue` inline (labels a11y — aligné avec l'objectif accessibilité), pas d'édition
  manuelle du catalogue nécessaire (fallback `defaultValue`).

## Statut

**TERMINÉE** — `AudioFullscreenView` a11y VoiceOver soldé (labels contrôles + glyphe état vide).
Ne plus re-flagger les 6 glyphes de contrôle figés à dessein.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `AudioFullscreenView` — 6 `.accessibilityLabel` sur boutons icône-seule (close/download
  state-aware/−10/play-pause/+10/langue), glyphe état vide → `relative` + hidden, 6 glyphes
  contrôle/chrome figés commentés. **SOLDÉ 104i.** Reste différé : seekBar adjustable, authorInfoRow combine.
- `CommunityLinkDetailView` — **déjà soldé sur `main` par un autre agent** (Dynamic Type +
  VoiceOver + `.textSelection`) ; ne pas reprendre (l'itération 95i de cette session était redondante).
