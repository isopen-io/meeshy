# Iteration-195i — ThemedConversationRow: VoiceOver selected-state trait

## Contexte

`ThemedConversationRow` (`apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift`)
est la rangée de conversation de la liste principale. Sur iPad / macOS en split-view,
la rangée correspondant à la conversation ouverte est **mise en évidence** par trois
signaux exclusivement **visuels** :

- teinte de fond accent (`accent.opacity(isDark ? 0.28 : 0.18)`, l. 202-204)
- barre latérale gauche 3pt accent (`overlay(alignment: .leading)`, l. 211-216)
- bordure accent renforcée (`strokeBorder`, l. 223-231, `lineWidth` 1.0 vs 0.5)

## Problème (a11y — WCAG 1.4.1 « Use of Color »)

Le bloc d'accessibilité (l. 236-242) exposait `label` + `value` + `hint` + trait
`.isButton`, mais **aucun trait `.isSelected`**. Un utilisateur VoiceOver ne pouvait
donc pas savoir quelle rangée était active : l'état sélectionné n'était véhiculé que
par la couleur/teinte, invisible sans la vue. Violation directe de la doctrine du
prisme a11y du swarm (« jamais la couleur seule », mirroir des correctifs
149i/155i/163i/176i/177i/178i/185i/186i sur les sélecteurs segmentés et pilules).

## Correctif

Ajout d'un `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` après le trait
`.isButton` existant. VoiceOver annonce désormais « …, sélectionné, bouton » sur la
rangée active, et rien de spécial sur les rangées inactives.

```swift
.accessibilityAddTraits(.isButton)
.accessibilityAddTraits(isSelected ? [.isSelected] : [])
```

## Portée & sûreté

- **1 fichier**, +4 lignes (dont 3 de commentaire), 0 logique / 0 réseau / 0 layout /
  0 clé i18n neuve / 0 changement visuel / 0 test neuf.
- `isSelected` était déjà en portée (prop `var isSelected: Bool = false`, l. 29) et
  déjà inclus dans le `==` de l'`Equatable` (l. 600) → **aucune régression du pattern
  « Zero Unnecessary Re-render »** : les inputs Equatable sont inchangés.
- `isSelected` par défaut `false` (iPhone via NavigationStack) → aucun trait ajouté sur
  iPhone, comportement identique. Seul iPad/macOS split-view bénéficie du trait.
- Fichier **absent de toute PR ouverte** (vérifié `list_pull_requests`, 23 PR) → 0 collision
  avec l'essaim `laughing-thompson`.

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2).
- `.accessibilityAddTraits` est chaînable (SwiftUI accumule les traits) — le trait
  `.isButton` existant est préservé.

## Statut

✅ Résolu. Ne plus re-flagger `ThemedConversationRow` pour l'état sélectionné VoiceOver
(soldé 195i). Le reste du bloc a11y (label combiné riche, value unread, hint) était déjà
complet.

## Pistes 196i+

- Autres rangées de liste à sélection visuelle split-view (auditer `ConversationListView`,
  cellules de recherche) pour le même trait `.isSelected` manquant.
- Vérifier collision essaim via `list_pull_requests` avant chaque itération.
