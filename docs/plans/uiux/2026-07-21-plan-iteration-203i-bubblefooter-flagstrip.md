# Plan Iteration-203i — BubbleFooter flag strip : VoiceOver selected-state

**Branche de travail** : `claude/laughing-thompson-e758cp`
**Base** : `main` HEAD `6e17000` (#2215 gateway auth mergé)
**Piste** : iOS (`i`)

## Objectif

Exposer à VoiceOver **quel drapeau de langue est actif** dans la bande de drapeaux
de traduction de la bulle (`BubbleFooter.footerFlagPill`, point d'entrée du Prisme
Linguistique). L'état actif n'est aujourd'hui véhiculé que par police + couleur
(soulignement) — invisible sans la vue (WCAG 1.4.1).

## Étapes

1. [x] Resync : branche déjà à `origin/main` HEAD `6e17000`.
2. [x] Contention essaim : PR ouvertes jusqu'à 202i (#2216) ; `list_pull_requests`
   (36 PR) → **aucune** ne touche `BubbleFooter`. Numéro **203i** > plus haut en vol.
3. [x] Vérifier fraîcheur : tracking doc 0 mention `footerFlagPill`/`flag strip` ;
   références anciennes sur `BubbleFooter` = translate icon (5i) + timestamp font (32i),
   pas l'état sélectionné du drapeau.
4. [x] Fix : `.accessibilityAddTraits(flag.isActive ? [.isSelected] : [])` après le
   `.accessibilityLabel` existant du `Button` de `footerFlagPill`.
5. [x] Test guard neuf `BubbleFooterAccessibilityTests` (miroir `CallsTabAccessibilityTests`).
6. [x] Analyse + plan + tracking.
7. [ ] Commit + push ; gate CI `iOS Tests`.

## Contraintes

- 0 changement visuel, 0 logique, 0 réseau, 0 layout, 0 clé i18n neuve, 0 SDK.
- 1 fichier prod (+1 ligne) + 1 fichier test neuf.
- APIs `.accessibilityAddTraits`/`.isSelected` sous plancher app iOS 16 → pas de garde.
- Auteur en conteneur Linux → build/VoiceOver validés en CI.
