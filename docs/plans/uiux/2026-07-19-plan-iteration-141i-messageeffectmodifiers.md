# Plan Itération 141i — `MessageEffectModifiers` (palette SSOT + VoiceOver décoratif)

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Branche** : `claude/laughing-thompson-wq7h98` (redémarrée depuis `origin/main` `efedb69e4`)

## Objectif
Passe **state-of-the-art palette** (annoncée par 140i au tarissement de la traîne Dynamic Type) : tokeniser les couleurs de marque codées en **hex inline** vers `MeeshyColors`, et masquer à VoiceOver les overlays d'effets décoratifs.

## Cible
`apps/ios/Meeshy/Features/Main/Components/MessageEffectModifiers.swift` — seul fichier iOS portant encore `Color(hex: "#…")` de marque (audit `grep 'Color(hex: "#'` = 3 sites, tous dans ce fichier).

## Étapes
1. ✅ Resync `main`, redémarrer la branche (140i déjà mergé).
2. ✅ Confirmer le tarissement Dynamic Type (candidats 140i tous soldés/figés-commentés).
3. ✅ Vérifier `MeeshyColors.indigo500/indigo400` = mêmes hex → tokenisation zéro-régression.
4. ✅ `import MeeshyUI` + 3 hex → tokens.
5. ✅ `.accessibilityHidden(true)` sur Confetti/Fireworks/Explode/Waoo (décoratifs).
6. ✅ Analyse + plan + tracking.
7. ⏳ Commit + push. Gate = CI `iOS Tests`.

## Contraintes respectées
- 1 fichier, 0 logique, 0 clé i18n, 0 test neuf (parité doctrine sweep).
- Tokens byte-identiques → 0 changement visuel.
- Couleurs décoratives (confetti/rainbow/star) laissées telles quelles.
