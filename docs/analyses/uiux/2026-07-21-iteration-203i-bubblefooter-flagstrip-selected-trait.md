# Iteration-203i — BubbleFooter : VoiceOver selected-state du flag strip du Prisme

## Contexte

`BubbleFooter.footerFlagPill` (`apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift:231`)
construit chaque drapeau de la **bande de drapeaux de traduction** de la bulle de
message — le point d'entrée visible du **Prisme Linguistique** (original + langue
système + régionale/custom + locale appareil, max 4 ; tap = révèle le contenu
secondaire inline). Le drapeau **actif** (langue actuellement affichée sur la bulle)
est signalé exclusivement par deux signaux **visuels** :

- police plus grande (`.font(flag.isActive ? .caption : .caption2)`, l. 245)
- soulignement coloré (`RoundedRectangle`, l. 246-250) rendu seulement si `flag.isActive`

## Problème (a11y — WCAG 1.4.1 « Use of Color »)

Le `Button` du drapeau portait un `.accessibilityLabel` (nom de langue) mais **aucun
trait `.isSelected`**. Un utilisateur VoiceOver entendait donc « Français, bouton » /
« Anglais, bouton » sans jamais savoir **quel drapeau est actif** — l'état sélectionné
n'était véhiculé que par la taille de police et la couleur, invisibles sans la vue.
Violation directe de la doctrine a11y du swarm (« jamais la couleur seule », miroir des
correctifs 149i/155i/163i/176i/177i/178i/185i/186i/195i sur sélecteurs segmentés,
pilules et rangées de liste).

Précédent probant dans le même codebase : `PostDetailView.swift:1048` expose déjà l'état
du **même motif de flag strip** via `.accessibilityValue(isActive ? "Affichée" : "")`.
Cela prouve que l'état actif est **destiné** à être lu par VoiceOver — mais ce précédent
utilise un littéral FR dur (`"Affichée"`, défaut i18n) ; on préfère donc le trait natif
`.isSelected`, que VoiceOver annonce automatiquement dans la langue de l'utilisateur
(0 clé i18n, cohérent avec le reste du swarm).

## Correctif

Ajout d'un `.accessibilityAddTraits(flag.isActive ? [.isSelected] : [])` après le
`.accessibilityLabel` existant du `Button`. VoiceOver annonce désormais « Français,
sélectionné, bouton » sur le drapeau actif, et « Anglais, bouton » sur les inactifs.

```swift
.buttonStyle(.plain)
.accessibilityLabel(display?.name ?? flag.code)
.accessibilityAddTraits(flag.isActive ? [.isSelected] : [])
```

Le soulignement décoratif (`RoundedRectangle`) est à l'intérieur du label du `Button`
déjà porteur d'un `.accessibilityLabel` explicite → il n'est jamais lu séparément
(pas besoin de `.accessibilityHidden`).

## Portée & sûreté

- **1 fichier prod**, +1 ligne (le modifier), 0 logique / 0 réseau / 0 layout /
  0 clé i18n neuve / 0 changement visuel.
- `flag.isActive` était déjà en portée (`FooterFlag` value model) et déjà lu par le
  corps de la vue → **aucune régression du pattern « Zero Unnecessary Re-render »** :
  les inputs Equatable de `BubbleFooter` sont inchangés.
- `.accessibilityAddTraits` est chaînable (SwiftUI accumule les traits) — le label
  existant est préservé.
- Fichier **absent de toute PR ouverte** (vérifié `list_pull_requests`, 36 PR) → 0
  collision avec l'essaim `laughing-thompson`.
- **Test guard source-level neuf** `BubbleFooterAccessibilityTests` (miroir
  `CallsTabAccessibilityTests` / `MessageMoreSheetAccessibilityTests`, non-`@MainActor`,
  auto-inclus par CI `xcodegen generate`) → verrouille le trait contre toute régression.

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2).
- Auteur en conteneur Linux → build/VoiceOver validés en CI (`meeshy.sh` indisponible ici).

## Statut

✅ Résolu. Ne plus re-flagger `BubbleFooter.footerFlagPill` pour l'état sélectionné
VoiceOver (soldé 203i). Le label du drapeau + la hit-area 22pt + le pattern Button
étaient déjà corrects.

## Pistes 204i+

- **Même motif de flag strip** (drapeau actif couleur+police-seule, `.isSelected`
  manquant) restant sur : `ReelsPlayerView.ReelAudioView` (l. ~994-1008, `isActive`) et
  `StoryViewerView+Content.languageSwitcher/languageFlag` (l. ~1955-1997 ; celui-ci en
  `.onTapGesture` sans label → nécessite d'abord un wrap `Button` + label, donc
  plus-que-1-ligne). Auditer surface par surface, vérifier collision essaim avant.
- `PostDetailView.swift:1048` — remplacer le littéral FR `"Affichée"` de
  `.accessibilityValue` par le trait natif `.isSelected` (dédup + i18n), quand le fichier
  est libre de PR.
