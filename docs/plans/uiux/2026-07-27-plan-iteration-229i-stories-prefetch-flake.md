# Plan — Iteration 229i : supprimer le flake du prefetch stories

**Analyse** : `docs/analyses/uiux/2026-07-27-iteration-229i-stories-prefetch-flake.md`
**Base** : `main` HEAD `a6a1fc938`
**Branche** : `claude/quirky-curie-16693v` (recréée depuis `origin/main` après merge de 223i / PR #2370)

## Objectif

Rendre déterministes les **deux** tests `handleForegroundReturn` de
`ConversationListViewModelTests`, qui parient sur un `Task.sleep(150 ms)` pour
qu'un `Task.detached` se pose. Diagnostiqué en 223i, reporté à dessein, corrigé ici.

## Étapes

1. Helper `awaitStoryPrefetch(_:timeout:)` : sonde l'apparition de
   `sut.storyPrefetchTask` (5 ms, sans spin main-actor) puis l'attend ; deadline
   5 s pour qu'une régression reste une assertion échouée.
2. Test **négatif** : `Task.sleep` de l'étape 1 → `await sut.storyPrefetchTask?.value`
   (déterministe : le handle est posé synchroniquement par `loadConversations()`).
3. Test **positif** : `Task.sleep` → `await awaitStoryPrefetch(sut)`.
4. Conserver **un** sleep (fenêtre de l'assertion négative) + le faire suivre d'un
   `await …?.value` pour le cas de régression.
5. Mettre à jour `branch-tracking.md`.

## Invariants

- **0 fichier de production touché** — `storyPrefetchTask` est déjà `internal`.
- **0 changement de comportement applicatif** ; les assertions restent identiques.
- Le sleep conservé ne peut produire qu'un **faux vert**, jamais un faux rouge.
- Ne PAS balayer les 51 `Task.sleep` du fichier : conversion au cas par cas.

## Honnêteté de vérification

Pas de RED/GREEN classique : rejouer un flake une fois ne prouve rien. Les
preuves sont l'historique CI (vert→rouge à code identique), le mécanisme lu dans
le ViewModel, et l'arithmétique du symptôme. Contrôles hors Xcode : équilibre
accolades/parenthèses/crochets 0/0/0, comptes helper/awaits/sleep.
Gate réel = CI `iOS Tests`.
