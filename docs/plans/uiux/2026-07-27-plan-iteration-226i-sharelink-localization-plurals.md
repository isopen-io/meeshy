# Plan — Iteration 226i : lien de partage + pluralisation du cliquet

**Date** : 2026-07-27 · **Base** : `main` HEAD `68a1a33f` · **Branche** : `claude/intelligent-noether-3qwt2j`
**Analyse** : `docs/analyses/uiux/2026-07-27-iteration-226i-sharelink-localization-plurals.md`

## Contexte

225i (PR #2377) mergée. Branche **recréée depuis le nouveau `main`**, conformément
à la règle « une PR mergée est terminée, le suivi repart de la branche par défaut ».
Numéro **226i** : 225i est le plus haut mergé, 224i le plus haut en vol (#2369).

Vérifié avant de commencer : `main` est **vert** sur le cliquet livré en 225i
(backlog exactement 1606 = plafond, 2 écrans épinglés verts) malgré le travail iOS
mergé entre-temps.

## Étapes

- [x] Resync, recréer la branche depuis `main`, marquer 225i mergée dans le suivi
- [x] Vérifier que le plafond serré de 225i ne rend pas `main` rouge
- [x] Re-mesurer le classement des trous (inchangé : `CreateShareLinkView` 55)
- [x] Vérifier l'absence de recouvrement avec les 4 PR iOS ouvertes
- [x] Table de traduction 54 clés plates × 7 locales, registre **vouvoiement** (celui de l'écran)
- [x] Valider : couverture, locales, et `fr` ≡ `defaultValue` du code (0 écart → 0 changement de prod)
- [x] Modéliser `share.link.create.max_uses` en variations plurielles CLDR (6 catégories en `ar`)
- [x] Corriger l'aveuglement du cliquet aux entrées plurielles + test dédié
- [x] Splice additif du catalogue, contrôle par parse (55 ajoutées / 0 modifiée)
- [x] Épingler l'écran, abaisser le plafond 1606 → 1545 avec décomposition vérifiée
- [x] RED/GREEN prouvé hors Xcode sur les 4 tests + CLI vert
- [x] Quantifier le reliquat « appels multi-lignes » pour la suite
- [ ] Pousser, ouvrir la PR, mettre à jour `branch-tracking.md`

## Décisions

**Le registre suit la surface.** 225i traduisait un écran au tutoiement, celui-ci
vouvoie (« Créez un groupe… », « Contrôlez l'audience… »). Les traductions
adoptent le vouvoiement ici. Uniformiser les deux serait une décision de copie
produit, pas de localisation — même raisonnement qu'en 225i pour le carrousel.

**Corriger le cliquet avant de s'en servir.** La pluralisation de `max_uses` ne
pouvait pas être « soldée » : le lecteur ne voyait aucune traduction sous
`variations.plural`, donc la clé restait rouge quoi qu'on écrive. Épingler l'écran
sans corriger l'outil aurait été impossible ; abaisser le plafond en laissant
9 faux positifs aurait été malhonnête. L'ordre est donc : outil, puis données.

**`allSatisfy`, pas `contains`.** Une locale ne compte comme traduite que si
**toutes** ses catégories plurielles le sont. Une seule catégorie périmée laisse la
clé non traduite pour les comptes qui la sélectionnent — un `contains` masquerait
précisément ce cas.

**`extractionState: "manual"` sur l'entrée plurielle.** Sans lui, l'extracteur
Xcode voit le `defaultValue` interpolé du code et réécrit l'entrée en chaîne plate,
détruisant les variations. Les 9 précédents du catalogue le portent tous.

**Le code de production n'est pas touché.** Les 55 défauts français étaient déjà
corrects, et le site de `max_uses` garde son repli interpolé comme
`feed.post.stat.comments` — c'est le catalogue qui rend. Zéro risque de régression
visuelle ou comportementale.

**Deux reliquats signalés, pas devinés** : les 92 appels multi-lignes invisibles au
scanner (les corriger ferait *monter* le plafond → itération dédiée) et le
« 1 utilisations » de `uses_label` (le correctif propre demande un construit
`.xcstrings` non vérifiable sans toolchain). Une CI iOS rouge bloque toutes les PR
iOS — précédent 221i.

## Vérification

| test | base | après |
|---|---|---|
| `test_fullyLocalizedScreensStayTranslatedInEveryShippedLocale` | RED 55 | GREEN |
| `test_fullyLocalizedScreenDefaultValuesMatchTheCatalogSourceLanguage` | RED 54 | GREEN |
| `test_pluralizedKeysAreRecognizedAsTranslated` (neuf) | RED 9 | GREEN |
| `test_untranslatedKeyBacklogDoesNotGrow` | RED 1606 > 1545 | GREEN 1545 |

Décomposition du plafond **mesurée** et non déduite : 1606 → 1552 par le splice
(−54), → 1545 par le correctif pluriel (−7). L'écart avec la déduction naïve
(−55 −9 = 1542) est entièrement expliqué : `max_uses` n'est libérée que par le
correctif, et 3 des 9 entrées plurielles ne sont pas vues du tout par le scanner.

## Portée du risque

0 code de production · 0 logique · 0 réseau · 0 rendu. Catalogue `+2639/−0`
(histogram), 55 entrées ajoutées / 0 modifiée vérifié par parse. Cliquet : lecteur
élargi aux variations plurielles + 1 test neuf + 1 écran épinglé + plafond abaissé.
