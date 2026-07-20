# iOS UI/UX — Iteration 194i

**Date** : 2026-07-20
**Surface** : `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`
- `viewsFilterCapsule(_:accent:)` (l.897-951)
- `reactionFilterCapsule(label:count:isSelected:action:)` (l.1587-1614)
- `reportTypeRow(_:)` (l.1781-1833)
**Axe** : VoiceOver — état sélectionné des contrôles segmentés / rangées de choix
(HIG « ne jamais transmettre un état par la seule couleur »)
**Base** : `main` HEAD `8340838`

## Contexte

L'essaim iOS est dense (PR ouvertes jusqu'à 192i). Numéro **194i** choisi
strictement `> 192i`. `MessageDetailSheet` **n'apparaît dans aucune des 24 PR
ouvertes** (vérifié via `list_pull_requests`) — surface libre. Cette surface est
exactement celle notée « restant » par l'analyse **186i** :
> `MessageDetailSheet` (17 usages `isSelected ?`, à auditer surface par surface).

## Constat — trois contrôles sélectionnables sans trait `.isSelected`

Trois contrôles de la feuille de détail message signalaient leur état actif
**uniquement par des attributs visuels** (remplissage accent, couleur du texte,
éventuellement un checkmark) sans **aucun** `.accessibilityAddTraits(.isSelected)`.
VoiceOver annonçait chaque segment/rangée à l'identique, actif ou non.

### A. `viewsFilterCapsule` (l.897-951)
Filtre de l'onglet « Vu » (`Envoyé` / `Reçu` / `Lu` / `Non vu` / `Écouté` /
`Regardé`, `ViewsFilter.allCases`). État actif = remplissage `accent` + couleur
du texte **seuls**. `isSelected` déjà en portée (`let isSelected = viewsFilter == filter`, l.898).

### B. `reactionFilterCapsule` (l.1587-1614)
Filtre d'émoji de l'onglet « Réactions » (`Tout` + une capsule par émoji). État
actif = remplissage `contactColor` + couleur du texte **seuls**. `isSelected`
reçu en paramètre.

### C. `reportTypeRow` (l.1781-1833)
Rangée de sélection du motif de signalement (onglet « Signaler »). État actif =
fond teinté + bordure accent + checkmark. Le checkmark est un indice non-couleur,
mais **aucun trait a11y** n'était posé — alors que son **sibling exact**
`ReportMessageSheet.reportReasonRow:129` porte
`.accessibilityAddTraits(isSelected ? [.isSelected] : [])`.

### Siblings déjà conformes (référence du fix)
`ReportMessageSheet.reportReasonRow:129`,
`MessageReactionsDetailView.reactionFilterCapsule:104`,
`EffectsPickerView:39`, `AudioFullscreenView` (186i #2144),
`MessageDetailSheet.dayLabel:254` (déjà posé). Ces trois contrôles étaient les
écarts restants de la même classe **dans ce fichier**.

## Correctifs (194i)

Ajout de `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` sur le
`Button` racine de chacun des trois contrôles (+ commentaire d'intention HIG).
Fix miroir exact du sibling prouvé `ReportMessageSheet.reportReasonRow:129`.

VoiceOver annonce désormais :
- « Lu, 3, sélectionné » sur le segment de filtre actif ;
- « 😀, 5, sélectionné » sur le filtre d'émoji actif ;
- « Spam, …, sélectionné » sur le motif de signalement choisi.

## Portée

- **1 fichier**, **+3 traits** (+ 6 lignes de commentaire d'intention).
- **0 logique** / 0 réseau / **0 clé i18n neuve** / 0 test neuf / **0 changement
  visuel**.
- `isSelected` déjà en portée aux trois sites (aucune variable neuve).

## Vérification

- `isSelected` en portée aux trois sites d'insertion (défini ou passé en param).
- Placement du modifier sur le `Button` (View) — parité avec les siblings.
- `grep accessibilityAddTraits(isSelected` → 3 occurrences (951, 1614, 1833),
  une par contrôle.
- Build iOS non exécutable sous Linux (pas de toolchain Xcode/Swift) →
  **gate = CI `iOS Tests`**.

## NE PLUS re-flagger

`viewsFilterCapsule`, `reactionFilterCapsule`, `reportTypeRow` de
`MessageDetailSheet` : état sélectionné VoiceOver soldé 194i.

## Restant (piste 195i+)

- `MessageDetailSheet` : les **rangées de langue** (l.~570-690) signalent la
  sélection par `checkmark.circle.fill` (indice non-couleur, conforme HIG
  minimum) mais gagneraient le trait `.isSelected` pour la cohérence — à évaluer
  surface par surface avant collision essaim.
- Auditer les autres sélecteurs segmentés non traités (vérifier
  `list_pull_requests` avant) : `ContactsHubView`, `NewConversationView`,
  `NotificationSettingsView` restent à confirmer.
