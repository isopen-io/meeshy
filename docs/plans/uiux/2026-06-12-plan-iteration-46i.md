# UI/UX Plan — Iteration 46i (2026-06-12)

Base : `main` HEAD post-merge #608 (61d0122). Branche : `claude/wizardly-rubin-v9thim`.
Analyse source : `docs/analyses/uiux/2026-06-12-iteration-46i.md`.

## Étapes

### 1. SDK — token tonal manquant
- [x] `MeeshyColors.swift` : ajouter `warningDeep` (amber-500 `F59E0B`) dans la section
  Semantic Tonal Variants (pattern `successDeep`/`errorStrong`)

### 2. Épuration code mort
- [x] Supprimer `Meeshy/Features/Main/Components/MessageComposer.swift` + 4 entrées pbxproj
- [x] Supprimer `Meeshy/Features/Main/Models/SampleData.swift` + 4 entrées pbxproj
  + retirer la ligne du commentaire d'index `Models.swift:12`
- [x] `RootViewComponents.swift` : supprimer `ThemedFeedCard`, `FeedActionButton` et les
  10 wrappers Legacy Support (fin de fichier) + mettre à jour le commentaire RootView.swift:9

### 3. Reliquats ancienne palette (code vivant)
- [x] `RootViewComponents.swift` : orbe :421 → indigo400 ; avatars :456/:727 → drop args ;
  spinner :560 → brandPrimary ; focus :775 → brandPrimary@0.5 ; bouton (+) :803-810 →
  [indigo500, indigo700] / [warning, warningDeep] ; tints :852/:855 → brandPrimaryHex
- [x] `FeedView.swift` : tints :604/:607/:1176 → brandPrimaryHex ; avatar :1028 → drop args ;
  UploadProgressBar :1096 → brandPrimaryHex ; toolbar :1109-1139 → indigo400/warning/
  indigo600/brandPrimary ; LocationPicker :1200 → brandPrimaryHex
- [x] `FeedView+Attachments.swift` : prepare* → drop args couleur ; spinners → brandPrimary ;
  avatar → drop args + fallback "Moi" → `feed.composer.me` ; UploadProgressBar/LocationPicker
  → brandPrimaryHex ; toolbar → même mapping que FeedView
- [x] `AttachmentPreparationService.swift` : défauts → `AttachmentKind.{image,video}.hexTintColor`
- [x] `WidgetPreviewView.swift` : carte non-lus → error/errorStrong vs success/successDeep ;
  Nouveau → indigo500/700 ; Partager → shareAccent/indigo600 ; Réglages → neutral500/600 ;
  linkTypeCard Partage → shareAccentHex
- [x] `ConversationAnimatedBackground.swift` : défauts init → brandPrimaryHex/indigo400Hex
- [x] Divers ×1 : ConversationInfoSheet (share → shareAccentHex, leave → errorHex),
  MemberManagementSection (modérateur → success), BlockedUsersView (unblock → success),
  UserStatsView (conversations → brandPrimaryHex), MediaDownloadSettingsView (image/audio →
  AttachmentKind), MeeshyWidgets samples (4ECDC4 → 818CF8, F39C12 → FBBF24)
- [x] `AboutView.swift` : 5×`4ECDC4` section Liens → `shareAccentHex`

### 4. Dynamic Type + i18n — FriendRequestListView
- [x] 10 polices figées → sémantiques (héros 48pt conservé) ; mapping 16→callout,
  17/18→headline, 14-15→subheadline, 13→footnote, 12→caption, 11→caption2
- [x] `relativeTime` supprimé → `ShortRelativeTime.label(for:)` (locale fr_FR codée en dur éliminée)
- [x] `"Inconnu"` → `common.unknown` + ajout de la clé au catalogue (5 locales — corrige
  aussi RequestsTab/ThreadView qui référençaient la clé absente)

### 5. Livraison
- [x] Commit + push `claude/wizardly-rubin-v9thim`
- [x] PR vers `main`, CI vert (`ios-tests`), merge
- [x] Mettre à jour `branch-tracking.md` (base 47i, carry-over purgé : SampleData ✓,
  reliquats palette app ✓, FriendRequestListView polices ✓, PostDetailView retiré ✓,
  StoryViewerView+Content reclassé conforme ✓)

## Risques
- Édition pbxproj (2 fichiers supprimés, 8 entrées) — validée par le build CI ios-tests
- Drop des args avatar : la couleur du composer passe de coral/teal fixe à la couleur
  déterministe charte de l'utilisateur (changement visuel assumé, règle fallback charte)
- `warningDeep` : ajout SDK pur (aucun usage existant cassé)
