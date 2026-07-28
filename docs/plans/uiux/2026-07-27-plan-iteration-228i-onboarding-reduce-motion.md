# Plan — Iteration 228i : Reduce Motion de l'onboarding

**Date** : 2026-07-27
**Branche** : `claude/quirky-curie-0u4lgr` (recréée depuis `origin/main` `913d8cc90`)
**Analyse** : `docs/analyses/uiux/2026-07-27-iteration-228i-onboarding-reduce-motion.md`

## Objectif

Faire honorer Reduce Motion par `AnimatedStepBackground` — l'ambiance animée de
tout le parcours d'inscription, donc **le premier écran de l'app**, et le plus
gros reliquat de l'inventaire 225i (23 occurrences `.repeatForever`).

## Étapes

- [x] Resync depuis `origin/main` `913d8cc90` (221i + 225i mergées)
- [x] Numéro **228i** : 226i prise (#2411), 227i réservée par #2411
- [x] Collision par **fichier** : `OnboardingAnimations` / `reduceMotion` → 0
- [x] Constat : 19 décorations + 4 pilotes = deux sources distinctes
- [x] **RED** : 3/9 contre `origin/main`
- [x] Entonnoir `ambient(_:)` + garde des 2 pilotes + `settleWithoutMotion()`
- [x] **GREEN** : 9/9 ; tokenizer 0/0/0 ; 19 suppressions relues une à une
- [x] Analyse + plan + `branch-tracking.md`
- [x] Commit, push, PR

## Décisions

1. **Un entonnoir plutôt que 19 gardes** — un oubli parmi dix-huit frères
   corrects serait invisible en revue.
2. **`nil`, pas « plus court »** — une animation répétée raccourcie bat plus vite.
3. **Repos à `animate = true`** — l'état composé contre lequel les décorations
   sont écrites ; `false` fige le décor au milieu du geste (plus petit, plus
   terne, décalé) = un autre décor, pas un décor calme.
4. **Le fondu d'étape (0,6 s) reste animé** — transition discrète et
   auto-terminée, hors cible du réglage ; épinglé pour que ce soit lisible comme
   une décision.

## ⚠️ À retenir pour la prochaine réécriture mécanique

La transformation regex a **raté deux fois** (sites multi-lignes amputés de leur
`ambient(` ; motif `DOTALL` franchissant une frontière de site et enveloppant le
fondu d'étape hors périmètre). Aucune des deux n'a été vue à la relecture — seul
le **compte de parenthèses** les a révélées. Sur un fichier non compilable
localement : tokenizer à 0/0/0 **et** relecture ligne à ligne des suppressions,
sinon la réécriture n'est pas acquise.

## Hors périmètre — 229i+

8 fichiers `.repeatForever` sans garde : `MessageEffectModifiers` (3),
`BubbleCallNoticeView` (2), `ComposerModels`, `BubbleMetaBadges`,
`ConversationMediaViews`, `LoginView`, `MessageListViewController`,
`StoryTrayView`.
