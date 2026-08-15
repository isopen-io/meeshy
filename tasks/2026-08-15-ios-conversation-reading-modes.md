# Prototype — Modes de lecture de la conversation (iOS)

Branche : `claude/ios-conversation-view-prototype-9hsb5x`
Spécifications source (volumes 1 → 4, dans `docs/design/`) :

| Vol. | Document | Rôle |
|------|----------|------|
| 1 | `2026-08-14-conversation-views-brainstorm.html` | les dix propositions |
| 2 | `2026-08-15-conversation-modes-use-cases.html` | cas d'usage, Orchestrateur (seuils chiffrés), API Agent |
| 3 | `2026-08-15-conversation-modes-verdict.html` | **le verdict** — ce qui est retenu |
| 4 | `2026-08-15-focal-spec-integration.html` | **la spec d'implémentation** — cotes, algorithme, matrice de couverture |

## Ce que le verdict retient

- **Focal** — mode de lecture par défaut. Rangée **plate, sans bulle** ; la seule carte de
  l'écran est le message au point. Le défilement **est** la mise au point.
- **Résumé Vivant** — le second cran du zoom sémantique. L'état d'abord, la preuve à un tap.
  Absorbe les Perles (épisodes) et les Îlots (sujets), porte la Rampe de visages.
- **Scène** — couche live (appel) au-dessus de tout mode. Hors périmètre de cette spec (vol. 4 §5).
- **Rivière** — en sursis. Elle ne rejoint la Lentille que si elle gagne son procès.

Les six autres modes ne meurent pas : ils rétrogradent en **composants** au service des modes retenus.

## Périmètre du prototype

1. **Fidélité totale au défilement.** La perspective Focal (`f = min(1, d/380)`, échelle
   `1−0.40f`, opacité `1−0.82f`), transform + alpha uniquement, zéro relayout — adaptée à la
   géométrie réelle de la collection **inversée** de `MessageListViewController`.
2. **Couverture intégrale de la vue Chat et Conversation.** Chaque ligne de la matrice §5 du
   vol. 4 est un invariant de recette : temps réel, typing, présence, accusés, réactions,
   traductions tardives, audio + transcription, médias, citations, édition/suppression,
   éphémère/flou/vue unique, épinglés, recherche, envoi optimiste + retry, pagination,
   effets, mentions, notices d'appel.
3. **Deux publics, une vue.**
   - *anonyme* (`X-Session-Token`, sans compte) : Focal + Script, **sans résumé ni IA** ;
   - *authentifié* : Focal, Résumé Vivant, épisodes, Rampe de visages, Rivière si elle passe.
   La différence est portée par **une seule** source de vérité en code, pas par des `if` dispersés.
4. **Composeur avancé.** Sélection automatique de la langue du texte (comportement existant
   conservé au bit près), effets rendus accessibles, formatage du texte, stickers/emojis,
   localisation, vocaux, images. Si le coût de complexité dépasse le gain, on retombe sur
   l'`UniversalComposerBar` existant — décision documentée, jamais subie.
5. **Le plaisir.** Ce qui rend l'app plus amusante fait partie du livrable, pas d'un « plus tard ».

## Règles de conduite

- **TDD non négociable.** Toute logique part d'un type pur testable sans simulateur.
  RED → GREEN → REFACTOR, par incréments qui laissent l'arbre vert.
- **Zéro donnée fabriquée.** Une heuristique client déterministe est honnête ; un résumé
  codé en dur ne l'est pas. Les surfaces qui exigent la gateway restent derrière un protocole.
- **Réversibilité.** Drapeau `reading_modes` éteint ⇒ l'app est bit-à-bit identique à aujourd'hui.
- **Fichiers disjoints.** Deux chantiers ne touchent jamais le même fichier (règle worktree du
  CLAUDE.md, appliquée aux agents d'orchestration).
- **Accessibilité héritée, pas réinventée.** `MeeshyFont.relative` (Dynamic Type), VoiceOver par
  rangée, `reduce motion` désactive la perspective.

## État

- [x] Revue des quatre volumes de spécification
- [x] Reconnaissance exhaustive du code réel (8 lecteurs parallèles + synthèse)
- [ ] Contrat d'implémentation (`tasks/focal-implementation-contract.md`)
- [ ] Chantiers TDD
- [ ] Recette §7 du vol. 4
- [ ] Revue adversariale + CI verte

## Revue

_(à compléter en fin de chantier)_
