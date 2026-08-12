# UI/UX Analysis — Iteration 79ib (2026-07-01)

## Scope
**iOS exclusivement** (suffixe `i` — Web et Android couverts par d'autres agents).
Thème : **Dynamic Type — parité des glyphes inline de l'écran d'appel**
(`CallView.swift` + `IncomingCallView.swift`).

Contrairement aux grandes surfaces de composeur (feed, 2FA…), l'écran d'appel a **déjà**
migré tout son **texte** vers des styles sémantiques scalables (`.title`, `.callout`,
`.footnote`, `.caption2`, `.body`). Les seules tailles figées `.font(.system(size:))` qui
restent sont des **icônes**. L'audit distingue trois familles d'icônes et n'en corrige
qu'**une** — celle qui casse l'alignement en grand Dynamic Type.

Itération volontairement **épurée** (4 sites, 2 fichiers), zéro changement de layout, aucun
test neuf : swap purement mécanique `.font(.system(size:))` → `MeeshyFont.relative(...)` (le
helper SDK — `packages/MeeshySDK/Sources/MeeshyUI/Theme/Accessibility.swift` — qui mappe une
taille fixe legacy vers le `Font.TextStyle` scalable le plus proche en préservant le poids).
SwiftUI ne compile pas sous Linux ; la CI `iOS Tests` (compile Xcode 26.1.x + tests simu 18.2)
sert de build de validation.

## Contexte / point de départ
`CallView.swift` (1470 l.) et `IncomingCallView.swift` étaient listés comme différé prioritaire
Dynamic Type dès 77i/78i (« Dynamic Type grandes surfaces restantes — `CallView`… »), et la
PR feed #1182 (78i) les cite explicitement dans ses propres différés. **Aucune PR ouverte** ne
touche un fichier `*Call*View*` (vérifié via `list_pull_requests`, voir Anti-repetition).

## iOS Findings

### Corrigé — icônes inline couplées à un `Text` scalable → `MeeshyFont.relative(...)`
Une icône SF Symbol posée **dans un `HStack` aux côtés d'un `Text`** dont la police scale doit
scaler avec lui, sinon l'alignement vertical et l'équilibre visuel cassent aux grandes tailles
(l'icône reste naine à côté d'un label géant). Sites migrés :

| Fichier | Ligne | Contexte | Texte voisin | Avant | Après |
|---|---|---|---|---|---|
| `CallView` | 595 | bandeau « Réseau faible chez votre contact » (`remoteQualityDegradedBanner`) `wifi.exclamationmark` | `.footnote` | `.system(size: 12, weight: .semibold)` | `MeeshyFont.relative(12, weight: .semibold)` |
| `CallView` | 771 | placeholder « Caméra désactivée » (`remoteCameraOffPlaceholder`) `video.slash.fill` | `.footnote` | `.system(size: 13, weight: .semibold)` | `MeeshyFont.relative(13, weight: .semibold)` |
| `CallView` | 1265 | badge type d'appel (`callTypeBadge`) `video.fill`/`phone.fill` | `.caption2` | `.system(size: 12, weight: .semibold)` | `MeeshyFont.relative(12, weight: .semibold)` |
| `IncomingCallView` | 164 | badge type d'appel (`callTypeBadge`) `video.fill`/`phone.fill` | `.caption2` | `.system(size: 12, weight: .semibold)` | `MeeshyFont.relative(12, weight: .semibold)` |

Poids `.semibold` préservé. `relative(12)`→`.caption`, `relative(13)`→`.footnote` (cf. table
`MeeshyFont.textStyle(for:)`). L'icône reste 1 cran au-dessus de son label caption2 comme
avant, mais scale désormais en tandem.

### Délibérément laissé FIXE (conforme HIG — ne PAS re-flagger)
Deux familles d'icônes NE doivent PAS scaler ; les migrer serait une **régression** :

1. **Glyphes de contrôle dans un cercle de verre à diamètre fixe.** La barre de contrôle
   (`callControlButton` glyphe 22pt dans `callControlGlass(diameter: 56)`, `endCallButton`
   24pt, `effectsToggleButton` 24pt, `cameraPickerMenu` 22pt, chevron « réduire » 16pt dans
   cercle 40pt) — CallView l.160/1189/1292/1318/1337 ; boutons répondre/décliner 28pt dans
   cercle de verre — IncomingCallView l.198/218. Le cercle a un diamètre **fixe** : un glyphe
   scalé déborderait/clipperait. C'est exactement le comportement des barres d'appel système
   (FaceTime/Téléphone ne scalent pas leurs glyphes de contrôle). La rangée gère déjà les
   grandes tailles via `ViewThatFits` → `ScrollView` horizontal (`fittingControlRow`).
2. **Initiales d'avatar liées à un cercle de taille fixe.** `avatarCircle` (`size * 0.4`,
   CallView l.1256), tuile vidéo suspendue (24pt CallView l.910), `IncomingCallView` initiale
   44pt (l.152). L'initiale est dimensionnée au cercle, pas au texte — scaler déborderait le
   cercle. Icône « vidéo en pause » 18pt dans la tuile PiP fixe 100×140 (CallView l.917) : même
   raison (conteneur fixe).

### Icônes décoratives dans cercle fixe — hors sujet (sibling call views)
`BubbleCallNoticeView` : `leadingGlyph` 14pt et `callBackBadge` 13pt sont **dans un cercle
fixe 30×30** et `.accessibilityHidden(true)` → laissés fixes (même doctrine que §« FIXE »).
`CallWaitingBannerView` / `FloatingCallPillView` : **0** taille figée (déjà sémantiques).

## Conforme (vérifié — ne pas re-flagger)
- **Couleurs** : `MeeshyColors.*` (indigo, success, warning, error, info) déjà tokenisées ;
  le fond fixe `#09090B`/`#0F0D19`/`#13111C` du `callBackground` est **intentionnel** (écran
  d'appel blanc-sur-sombre épinglé `.dark` — cf. commentaire l.176-181).
- **i18n** : toutes les chaînes visibles sont `String(localized:)`. Aucun littéral FR figé.
- **a11y** : labels/hints VoiceOver riches et annonces d'état (`.announcement`) déjà en place ;
  Reduce Motion respecté (l.16, l.1377). Les icônes migrées sont `.accessibilityHidden` (le
  sens est porté par le `Text` voisin) → aucun impact VoiceOver.

## Anti-repetition check
Vérifié via `list_pull_requests` (état 2026-07-01). PRs iOS ouvertes : active-sessions #1189,
audio-fullscreen #1188, ConversationLockSheet #1185, feed-composer #1182, CountryPicker #1178,
PrivacySettings #1176, story-viewer i18n #1174, MessageOverlayMenu i18n #1172, Router #1171,
link-preview #1168, palette #1166, dashboard #1165/#1145, invite #1160, quick-action #1157,
2FA #1155/#1137, emoji-picker #1154, voice-profile #1150, Support #1149, VoiceOver FR #1148,
feed-comments #1139. **Aucune** ne touche un fichier `*Call*View*`. Surface disjointe confirmée.

## Différés (pour itérations suivantes — iOS)
- Dynamic Type restantes grandes surfaces figées (texte) : `StoryViewerView+Content` (attendre
  merge story-viewer i18n #1174), `AudioFullscreenView` (attendre #1188), `ConversationView+Composer`.
- Glass adoption (reste) : `MessageOverlayMenu` (lot dédié `AdaptiveGlassContainer`).
- Palette : audit un-par-un des hex proches-mais-non-exacts (`#4ADE80`→success ? `#3B82F6`→info ?)
  avec vérif visuelle.

## Status : ⏳ développement terminé — push + CI ; merge dans main après CI verte —
voir plan `2026-07-01-plan-iteration-79ib.md`.
