# iOS UI/UX — Iteration 192i

**Date** : 2026-07-20
**Surface** : `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`
**Axe** : VoiceOver — état sélectionné des sélecteurs (HIG « jamais la couleur seule »)
**Base** : `main` HEAD `8340838`

## Contexte

L'essaim iOS est très dense (PR ouvertes jusqu'à **191i** #2168). Numéro
**192i** choisi strictement `> 191i`. Le fichier ciblé
`MessageDetailSheet.swift` **n'apparaît dans aucune PR ouverte** (vérifié via
`list_pull_requests`, 24 PR ; #2157 vise `MessageMoreSheet`, un fichier
distinct). Surface libre. Cible listée comme candidat « restant » par 186i.

## Constat — trois sélecteurs Button sans trait `.isSelected`

`MessageDetailSheet` héberge trois contrôles sélectionnables construits sur
`Button`, tous stylant leur état actif sans **aucun**
`.accessibilityAddTraits(.isSelected)`. VoiceOver annonçait chaque option à
l'identique, active ou non.

### A. `viewsFilterCapsule` (l.897) — sélection par **couleur seule**
Barre de sous-filtres de l'onglet « Vues » (`Envoyé` / `Livré` / `Lu` /
`Non vu` / `Écouté` / `Regardé`, `availableViewsFilters`). Segment actif signalé
uniquement par le remplissage `accent.opacity(0.15)` + stroke accent + couleur du
texte. Violation directe HIG « ne jamais transmettre un état par la seule
couleur » : un utilisateur VoiceOver ne pouvait pas savoir quel filtre de vues
était actif.

### B. `reactionFilterCapsule` (l.1587) — sélection par **couleur seule**
Filtres de réactions de l'onglet « Réactions » (`Tout` + une capsule par emoji).
Capsule active signalée par `Color(hex: contactColor).opacity(0.15)` + couleur du
texte. Même violation « couleur seule ».

### C. `reportTypeRow` (l.1781) — checkmark **sans label a11y**
Liste de sélection du type de signalement (onglet « Signaler »). La rangée active
affiche un `checkmark.circle.fill`, mais cette `Image` **n'a aucun
`.accessibilityLabel`** → VoiceOver ne l'annonce pas de manière signifiante et lit
la rangée à l'identique qu'elle soit choisie ou non. Le trait `.isSelected` est le
véhicule natif de l'état pour ce contrôle.

Les **frères déjà traités** (186i et antérieurs) posent tous ce trait :
`ConversationDashboardView.periodPicker`, `ConversationInfoSheet.tabSelector`,
`AudioFullscreenView` pickers, `GlobalSearchView.tabButton`, `CallsTab.chip`.
Ces trois sélecteurs étaient les écarts restants de la même classe.

## Correctifs (192i)

Sur chacun des trois `Button`, ajout de
`.accessibilityAddTraits(isSelected ? [.isSelected] : [])`. `isSelected` est déjà
en portée à chaque site (`let isSelected = …` pour A et C, paramètre `isSelected:
Bool` pour B). Le libellé lu reste le `Text` existant ; VoiceOver annonce
désormais « Livré, sélectionné » / « Tout, sélectionné » / « {type}, sélectionné »
sur l'option active.

Fix miroir exact du sibling prouvé `ConversationInfoSheet.tabSelector` /
`AudioFullscreenView` (186i).

## Portée

- **1 fichier**, **+6 lignes** (trait + commentaire d'intention × 3 sites).
- **0 logique** / 0 réseau / **0 clé i18n neuve** / 0 test neuf / **0 changement
  visuel**.
- `isSelected` déjà en portée aux trois sites (aucune variable neuve).

## Vérification

- `isSelected` en portée aux trois sites d'insertion (défini `let` / paramètre).
- Placement du modifier sur le `Button` (View) — parité avec les siblings.
- Build iOS non exécutable sous Linux (pas de toolchain Xcode/Swift) →
  **gate = CI `iOS Tests`**.

## NE PLUS re-flagger

`MessageDetailSheet.viewsFilterCapsule`, `reactionFilterCapsule`,
`reportTypeRow` : état sélectionné VoiceOver soldé 192i.

## Restant (piste 193i+)

Même classe de défaut sur d'autres sélecteurs segmentés — vérifier collision
essaim via `list_pull_requests` avant. Auditer `ContactsHubView` (déjà doté du
trait), `NotificationSettingsView`, `MessageMoreSheet` (#2157 en vol).
