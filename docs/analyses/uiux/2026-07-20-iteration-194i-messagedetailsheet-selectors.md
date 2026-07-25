# iOS UI/UX — Iteration 194i

**Date** : 2026-07-20
**Surface** : `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`
**Axe** : VoiceOver — état sélectionné des sélecteurs segmentés (HIG « jamais la couleur seule »)
**Base** : `main` HEAD `a690322`

## Contexte

Suite directe de la piste « Restant (187i+) » ouverte par l'**iteration 186i**, qui
avait explicitement listé `MessageDetailSheet` parmi les surfaces portant encore
des sélecteurs segmentés sans `.accessibilityAddTraits(.isSelected)`.

Numéro **194i** choisi strictement supérieur à tous les identifiants observés
dans l'essaim (PR ouvertes jusqu'à 192i, merges main jusqu'à 193i). La surface
`MessageDetailSheet.swift` **n'apparaît dans aucune PR ouverte** (vérifié via
`list_pull_requests` — 29 PR — puis énumération des fichiers modifiés par PR ;
les surfaces voisines traitées ailleurs sont des fichiers distincts :
`MessageReportDetailView.swift` (178i), `ReportMessageSheet.swift` (177i),
`MessageReactionsDetailView.swift`, `MessageLanguageDetailView.swift` (#2137)).

## Constat — 3 sélecteurs segmentés sans trait `.isSelected`

Trois fonctions de rendu de `MessageDetailSheet` produisent des segments
« pill/rangée » sélectionnables dont **l'état actif n'est signalé que par le
visuel** (teinte accent + remplissage de capsule + éventuellement un
`checkmark.circle.fill`), sans **aucun** `.accessibilityAddTraits(.isSelected)`.
VoiceOver annonçait donc chaque segment à l'identique, actif ou non.

### A. `viewsFilterCapsule(_:accent:)` (l.897)
Filtre de l'onglet **Vues** (`ViewsFilter` : Reçu / Lu / Non vu / Écouté / Vu).
Segment actif = capsule remplie accent + compteur teinté. Appelé l.864 dans un
`ForEach`. `isSelected` défini l.898 (`viewsFilter == filter`).

### B. `reactionFilterCapsule(label:count:isSelected:action:)` (l.1587)
Filtre de l'onglet **Réactions** (« Toutes » + une capsule par emoji). Segment
actif = capsule remplie `contactColor`. Appelé l.1535 et l.1542. `isSelected`
est déjà un paramètre.

### C. `reportTypeRow(_:)` (l.1781)
Rangée « radio » de l'onglet **Signaler** (`reportTabContent`, encore câblé
l.419). Raison choisie = glyphe/fond teintés accent + `checkmark.circle.fill`.
`isSelected` défini l.1782 (`selectedReportType == type`). C'est le pendant
**resté dans le sheet legacy** du `reportTypeRow` déjà traité dans le fichier
extrait `MessageReportDetailView` (178i) et dans `ReportMessageSheet` (177i) —
il était l'écart restant de la même classe.

Le frère canonique posant déjà ce trait dans ce même fichier :
`MessageReactionsDetailView.reactionFilterCapsule` (traité 178i). Les frères
prouvés hors fichier : `CallsTab.chip:60`, `GlobalSearchView.tabButton:218`,
`ConversationDashboardView.periodPicker` / `ConversationInfoSheet.tabSelector`
(186i).

## Correctifs (194i)

`.accessibilityAddTraits(isSelected ? [.isSelected] : [])` ajouté sur le
`Button` de chacune des trois fonctions — syntaxe strictement identique aux
frères prouvés (`CallsTab.chip:60`, `GlobalSearchView.tabButton:218`).

VoiceOver annonce désormais « Reçu, sélectionné » / « Toutes, 12, sélectionné »
/ « Spam, sélectionné » sur le segment/rangée actif. Le libellé et le compteur
visibles restent la source du label lu (aucun label neuf).

## Portée

- **1 fichier**, **+3 lignes** (un modifier par fonction).
- **0 logique** / 0 réseau / **0 clé i18n neuve** / 0 test neuf / **0 changement
  visuel**.
- `isSelected` déjà en portée aux trois sites (param ou `let` local existant) —
  aucune variable neuve.
- La branche `[]` (tableau vide) est un no-op sur les segments non sélectionnés.

## Vérification

- `isSelected` en portée aux trois points d'insertion (param B ; `let` local
  A/C).
- Placement du modifier sur le `Button` (View) — parité avec les frères.
- Plancher iOS 16 → `.isSelected` disponible, pas de garde `@available`.
- Build iOS non exécutable sous Linux (pas de toolchain Xcode/Swift) →
  **gate = CI `iOS Tests`**. Aucun test ne référence ces fonctions (recherche
  `viewsFilterCapsule` / `reactionFilterCapsule` / `reportTypeRow` dans
  `MeeshyTests` : miss).

## NE PLUS re-flagger

`MessageDetailSheet.viewsFilterCapsule`, `reactionFilterCapsule`,
`reportTypeRow` : état sélectionné VoiceOver soldé 194i. Les
libellés/compteurs visibles restent la source du label (fonts relatives déjà en
place).

## Restant (piste 195i+)

Même classe de défaut sur d'autres sélecteurs segmentés non traités — vérifier
collision essaim via `list_pull_requests` avant :
`NotificationSettingsView` (déjà posé l.254), `AudioPostComposerView` (déjà posé
l.259), `EffectsPickerView` (déjà posé l.39/148), `ContactsHubView`,
`ThemedConversationRow`, `MyStoriesView`, `UniversalComposerBar`,
`LanguagePickerSheet` (déjà posé l.88/129) — auditer surface par surface les
usages `isSelected ?` restants sans trait.
