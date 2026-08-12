# iOS UI/UX — Iteration 193i

**Date** : 2026-07-20
**Surface** : `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`
**Axe** : VoiceOver — état sélectionné de 3 sélecteurs signalé par la seule couleur (HIG / WCAG 1.4.1 « jamais la couleur seule »)
**Base** : `main` HEAD `546b420`

## Contexte

Essaim iOS très dense — PR ouvertes jusqu'à **192i** (#2167 `ConversationDashboard
period picker`). Numéro **193i** choisi strictement `> 192i`. `list_pull_requests`
(22 PR) vérifié : **aucune PR ne touche `MessageDetailSheet.swift`** — surface libre.

Piste explicitement recommandée par le pointeur 186i (« autres sélecteurs
segmentés couleur-seule … `MessageDetailSheet` — 17 usages `isSelected ?`,
auditer surface par surface »).

## Constat — 3 sélecteurs sans trait `.isSelected`

Le fichier contenait **zéro** `.accessibilityAddTraits(.isSelected)` (vérifié
grep sur 2506 lignes) alors que **trois** commandes de sélection signalaient leur
état actif **uniquement par le visuel** (fill accent + couleur du texte), sans
aucun trait VoiceOver. Un utilisateur VoiceOver ne pouvait pas savoir quel
filtre / quel motif était actif.

### A. `viewsFilterCapsule` (l.897) — filtre de l'onglet « Vues »
Sélecteur de statut de lecture (`Livré` / `Lu` / `Non vu` / `Écouté` / `Vu`,
`ViewsFilter`). Segment actif signalé par fill `accent.opacity(0.15)` + stroke +
`foregroundColor(accent)` — aucun trait.

### B. `reactionFilterCapsule` (l.1587) — filtre de l'onglet « Réactions »
Pilule de filtre par emoji (`Tous` / `😀 3` …). Segment actif signalé par fill
`contactColor.opacity(0.15)` + couleur — aucun trait.

### C. `reportTypeRow` (l.1781) — motif de signalement
Rangée de sélection du motif (`ReportType`). Motif actif signalé par couleur +
`checkmark.circle.fill` décoratif — aucun trait. **Jumeau exact** de
`MessageReportDetailView.reportTypeRow`, dont le même défaut a été soldé en 178i.

## Correctifs (193i)

1. **`viewsFilterCapsule`** — `.accessibilityAddTraits(isSelected ? [.isSelected] : [])`
   sur le `Button` ; glyphe de tête `filter.icon` (restaté par `filter.label`)
   → `.accessibilityHidden(true)`.

2. **`reactionFilterCapsule`** — même trait sur le `Button` (label + compteur
   restent la valeur lue, aucun glyphe décoratif).

3. **`reportTypeRow`** — même trait sur le `Button` + icône de motif et
   `checkmark.circle.fill` → `.accessibilityHidden(true)` (le sens de la coche
   passe désormais par le trait). **Miroir exact du sibling prouvé 178i**
   (`MessageReportDetailView`).

`isSelected` était déjà en portée dans chaque helper (`let isSelected = …`) —
aucune variable neuve.

## Portée

- **1 fichier**, +12 lignes (3 traits + 3 `accessibilityHidden` + commentaires
  d'intention).
- **0 logique** / 0 réseau / **0 clé i18n neuve** / 0 test neuf / **0 changement
  visuel**.

## Vérification

- `isSelected` en portée aux 3 sites (défini `let isSelected` dans chaque helper).
- Placement des traits sur le `Button` (View) — parité avec les siblings prouvés
  `CallsTab.chip:60`, `GlobalSearchView.tabButton:218`, `MessageReportDetailView`
  (178i).
- Build iOS non exécutable sous Linux (pas de toolchain Xcode/Swift) →
  **gate = CI `iOS Tests`**.

## NE PLUS re-flagger

`MessageDetailSheet.viewsFilterCapsule`, `.reactionFilterCapsule`,
`.reportTypeRow` : état sélectionné VoiceOver soldé 193i. Fonts déjà sémantiques.

## Restant (piste 194i+)

Même classe de défaut sur les sélecteurs segmentés couleur-seule restants —
vérifier collision essaim via `list_pull_requests` avant :
`ContactsHubView`, `NotificationSettingsView` (rangée DnD déjà traitée l.254),
`AudioPostComposerView` (déjà traité l.259), `EffectsPickerView`,
`LanguagePickerSheet`.
