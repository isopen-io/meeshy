# iOS UI/UX — Iteration 193i

**Date** : 2026-07-20
**Surface** : `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`
- `viewsFilterCapsule(_:accent:)` (filtre du panneau « Vu par »)
- `reactionFilterCapsule(label:count:isSelected:action:)` (filtre du panneau « Réactions »)
- `reportTypeRow(_:)` (choix du motif de signalement)
**Axe** : VoiceOver — état sélectionné des sélecteurs segmentés (HIG « jamais la couleur seule »)
**Base** : `origin/main` HEAD `1b28372`

## Contexte

Suite directe de la « Restant (piste 187i+) » de l'itération **186i**, qui
listait explicitement `MessageDetailSheet` parmi les sélecteurs segmentés non
traités. Numéro **193i** choisi strictement `> 192i` (le plus haut des PR
ouvertes, PR #2167). Le fichier `MessageDetailSheet.swift` **n'apparaît dans
aucune PR ouverte** (vérifié via `list_pull_requests`, 25 PR — aucun titre ne
le référence ; itérations 187i→192i ciblent TopLevelCommentCell,
ConversationDashboard, CharacterCountLabel, Keypad, VideoFilter,
CreateTrackingLink, StatusBubbleOverlay, GlobalSearch) — surface libre.

Confirmation base fraîche : `git show origin/main:…/MessageDetailSheet.swift |
grep accessibilityAddTraits` → **0 occurrence**. Aucun des sélecteurs du fichier
ne portait de trait a11y.

## Constat — trois sélecteurs sans trait `.isSelected`

Chacun signalait son segment/ligne actif **uniquement par le visuel**
(remplissage accent + couleur de texte), sans `.accessibilityAddTraits(.isSelected)`.
VoiceOver annonçait donc chaque option à l'identique, active ou non.

### A. `viewsFilterCapsule` (l.897-949)
Filtre du panneau « Vu par » (`Reçu` / `Vu` / `Pas vu` / `Écouté` / `Regardé`,
`ViewsFilter`). Segment actif = capsule remplie `accent` + texte accent + pastille
compteur teintée. Aucun trait a11y.

### B. `reactionFilterCapsule` (l.1587-1609)
Filtre du panneau « Réactions » (émoji + compteur par réaction). Capsule active
= remplissage `contactColor` + texte coloré. Aucun trait a11y.

### C. `reportTypeRow` (l.1781-1825)
Choix du motif de signalement (Spam, Harcèlement…). Ligne active = fond accent +
bordure + `checkmark.circle.fill` **sans label**. La coche décorative n'étant pas
exposée, un utilisateur VoiceOver n'avait aucune indication du motif sélectionné.

Les **frères déjà traités** posent tous ce trait : `periodPicker` /
`tabSelector` (186i), `GlobalSearchView.tabButton`, `CallsTab.chip`,
`ContactsHubView` tab (l.102). Ces trois sélecteurs étaient les écarts restants
du même fichier.

## Correctifs (193i)

Sur chacun des trois `Button`, ajout de
`.accessibilityAddTraits(isSelected ? [.isSelected] : [])`. `isSelected` déjà en
portée à chaque site (`let isSelected = viewsFilter == filter` / paramètre
`isSelected: Bool` / `let isSelected = selectedReportType == type`). Le libellé +
compteur visibles restent la source du label lu — fix miroir exact de la doctrine
186i.

## Portée

- **1 fichier**, +10 lignes (3 traits + commentaires d'intention).
- **0 logique** / 0 réseau / **0 clé i18n neuve** / 0 test neuf / **0 changement
  visuel**.
- Aucune variable neuve (`isSelected` déjà défini aux trois sites).

## Vérification

- `isSelected` en portée aux trois sites d'insertion (vérifié).
- Modifier posé sur le `Button` (View) — parité avec `periodPicker`/`tabSelector`.
- Build iOS non exécutable sous Linux (pas de toolchain Xcode/Swift) →
  **gate = CI `iOS Tests`**.

## NE PLUS re-flagger

`MessageDetailSheet.viewsFilterCapsule`, `reactionFilterCapsule`,
`reportTypeRow` : état sélectionné VoiceOver soldé 193i.

## Restant (piste 194i+)

Même classe de défaut sur d'autres sélecteurs segmentés non traités — auditer
surface par surface, vérifier collision essaim via `list_pull_requests` avant :
`NewConversationView`, `EffectsPickerView`, `MyStoriesView`,
`LanguagePickerSheet` (usages `isSelected ?` restants à confirmer).
