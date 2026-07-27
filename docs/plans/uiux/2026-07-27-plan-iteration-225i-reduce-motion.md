# Plan — Iteration 225i : Reduce Motion

**Date** : 2026-07-27
**Branche** : `claude/quirky-curie-0u4lgr` (recréée depuis `origin/main` `68a1a33f9`)
**Analyse** : `docs/analyses/uiux/2026-07-27-iteration-225i-reduce-motion.md`

## Objectif

Faire honorer le réglage **Réduire les animations** par les deux animations
`.repeatForever` que l'utilisateur ne peut pas éviter : les points de saisie de
la liste des conversations et la pastille de synchronisation du chrome
persistant.

## Choix de l'axe (et ce qu'on n'a PAS fait)

- 221i (#2363, **mergée**) a ouvert le lot « cibles tactiles ».
- #2370 porte **223i** dessus et **réserve 224i** pour
  `MessageOverlayMenu.videoControls`, en expliquant pourquoi ce site demande une
  décision de design + un simulateur. **Non repris** : le forcer à l'aveugle
  serait exactement ce que ce raisonnement écarte.
- 219i ayant déjà été fermée en doublon, la règle est : **ne pas être le
  troisième agent d'un même couloir**. D'où le changement d'axe.
- `search_pull_requests` sur `ThemedConversationRow` / `SyncPill` / `reduceMotion`
  → **0 résultat**.

## Étapes

- [x] Resync depuis `origin/main` `68a1a33f9` (221i et #2353 mergées)
- [x] Inventaire : 22 fichiers `.repeatForever`, **11 sans garde**
- [x] Sélection des 2 surfaces non-dismissibles
- [x] **RED** : 0/6 contre `origin/main`
- [x] Correctif : garde `@Environment`, animation `nil`, repos en phase haute
- [x] **GREEN** : 6/6 ; accolades/parenthèses/crochets 0/0/0
- [x] Analyse + plan + `branch-tracking.md`
- [x] Commit, push, PR

## Décisions de conception

1. **`nil`, pas « plus court »** — réduire la durée d'une animation répétée ne
   l'arrête pas, elle bat plus vite.
2. **Repos en phase HAUTE** — la phase basse (0.4 opacité / 0.5 échelle) porte
   une partie du sens ; y geler l'indicateur le ferait lire comme désactivé. Le
   réglage ne doit pas coûter l'information.
3. **`@Environment` et non un singleton observé** — `TypingDotsView` est une vue
   feuille rendue une fois par rangée (règle « Zero Unnecessary Re-render »).

## Hors périmètre — piste 226i+

9 fichiers `.repeatForever` encore sans garde, `OnboardingAnimations.swift`
(**23 occurrences**) en tête et probablement une itération à lui seul. Même
précaution à chaque fois : vérifier **où repose** l'animation coupée.
