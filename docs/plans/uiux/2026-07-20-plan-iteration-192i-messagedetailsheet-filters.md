# Plan — iOS UI/UX Iteration 192i

**Surface** : `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`
**Axe** : VoiceOver — trait `.isSelected` sur les filtres segmentés couleur-seule
**Base** : `main` HEAD · **Branche** : `claude/laughing-thompson-hycbxw`

## Objectif
Poser `.accessibilityAddTraits(.isSelected)` sur les deux filtres capsule de
`MessageDetailSheet` dont l'état actif n'était signalé que par la couleur
(`viewsFilterCapsule`, `reactionFilterCapsule`), conformément à la HIG
« jamais la couleur seule » (WCAG 1.4.1). Miroir de la doctrine 186i.

## Étapes
1. [x] Audit swarm : `MessageDetailSheet` absent des 18 PR ouvertes (jusqu'à 191i).
2. [x] Audit des 8 sites `isSelected` du fichier — isoler les 2 purement couleur-seule.
3. [x] Ajouter `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` sur chaque `Button`.
4. [x] Vérifier via `grep` (l.949, l.1610).
5. [x] Rédiger analyse + plan.
6. [ ] Commit + push branche.
7. [ ] Mettre à jour `branch-tracking.md`.

## Contraintes respectées
- 1 fichier, +2 lignes, 0 logique / 0 réseau / 0 visuel / 0 clé i18n / 0 test / 0 SDK.
- Contrôles déjà différenciés par un glyphe (coche) laissés intacts → pas de double-annonce.

## Gate
CI `iOS Tests` (compile Xcode 26.1.1 / run simu iOS 18.2).
