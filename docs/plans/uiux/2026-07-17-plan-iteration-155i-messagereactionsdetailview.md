# Plan Itération 155i — VoiceOver `MessageReactionsDetailView` (iOS)

## Objectif

Combler les lacunes VoiceOver de l'onglet « Réactions » du détail d'un message
(`MessageReactionsDetailView`), jumeau structurel de `MessageViewsDetailView` (144i). Itération
purement accessibilité — la typographie est déjà 100 % sémantique (aucune migration Dynamic Type).

## Base

- Branche : `claude/laughing-thompson-uxgpnp`
- Base : `origin/main` HEAD (resync avant démarrage)
- Numéro **155i** = strictement > 154i, plus haut numéro en vol (PR #1996 `AudioPostComposerView`).

## Changements (1 fichier)

`apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReactionsDetailView.swift` :

1. `reactionFilterCapsule` → `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` sur le `Button`
   (état sélectionné auparavant signalé par la seule couleur — fix HIG).
2. `reactionUserRow` → `.accessibilityHidden(true)` sur `MeeshyAvatar` +
   `.accessibilityElement(children: .combine)` sur la rangée (1 arrêt VoiceOver au lieu de 4).
3. `emptyReactionsView` → `.accessibilityHidden(true)` sur le glyphe `face.smiling` +
   `.accessibilityElement(children: .combine)` sur la `VStack` d'état vide.

## Non-régression

- 0 logique, 0 réseau, 0 test neuf, 0 clé i18n neuve (le `combine` réutilise les `Text` localisés).
- Aucun test ne référence la vue.
- Gate = CI `iOS Tests`.

## Validation

- Revue de cohérence avec le jumeau `MessageViewsDetailView` (144i).
- CI `iOS Tests` (compile Xcode 26.1.1 / run simu 18.2) — pas de build iOS local (env Linux).
