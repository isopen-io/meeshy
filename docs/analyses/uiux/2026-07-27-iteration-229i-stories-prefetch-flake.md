# iOS UI/UX — Iteration 229i

**Date** : 2026-07-27
**Surface** : `apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift`
**Axe** : QA / CI — supprimer un flake qui coûte à **toutes** les PR iOS
**Base** : `main` HEAD `a6a1fc938`

## Contexte

Diagnostiqué pendant 223i (PR #2370), documenté dans `branch-tracking.md`, et
laissé délibérément non corrigé à ce moment-là parce que le corriger depuis une
PR de cibles tactiles aurait été un correctif au passage sur une surface sans
rapport. C'est ici son itération dédiée.

## Le défaut

`test_handleForegroundReturn_withinCacheValidWindow_skipsStoriesRefresh` échoue
par intermittence avec « (1) is not equal to (0) ».

**La preuve que c'est un flake et non une régression** — trois faits, pas une
intuition :

1. Le test **passait** au run précédent (`dd68ba2d`) et a échoué au suivant.
2. Le diff de la PR était **identique au octet près** entre les deux runs.
3. `git log 2450cdb82..f8ddff951 -- ConversationListViewModel.swift ConversationListViewModelTests.swift`
   est **vide** : ni le ViewModel ni son test n'ont bougé entre les deux bases.

Même code, deux résultats.

**Le mécanisme.** `loadConversations()` appelle `prefetchRecentStories()`, qui
lance un `Task.detached`. Ce task relit le cache stories et n'appelle
`storyService.list` **que** si le cache est `.expired`/`.empty`. Le test faisait :

```swift
await sut.loadConversations()
try await Task.sleep(nanoseconds: 150_000_000)   // ← le pari
await CacheCoordinator.shared.stories.invalidateAll()
storyService.reset()
sut.handleForegroundReturn()
try await Task.sleep(nanoseconds: 150_000_000)
XCTAssertEqual(storyService.listCallCount, 0)
```

Si le task détaché n'avait pas atteint sa lecture de cache dans les 150 ms
(charge CI), il la faisait **après** l'`invalidateAll()` — voyait donc `.empty`,
appelait `list`, et incrémentait le compteur **après** le `reset()`. Résultat :
1 au lieu de 0, **sans que `handleForegroundReturn` y soit pour quoi que ce
soit**. Le test s'appuie en plus sur le singleton partagé
`CacheCoordinator.shared` et sur `Date()` réel.

**Le jumeau était atteint aussi, dans l'autre sens.**
`test_handleForegroundReturn_afterLongBackground_refreshesStaleStories` attend
`listCallCount > 0` après un sleep fixe de 150 ms. `handleForegroundReturn()`
lance un `Task` qui **await** le cache avant d'atteindre
`prefetchRecentStories()` — deux sauts avant le premier appel réseau. Sous
charge, 150 ms ne suffisent pas et le test échoue en **faux rouge** lui aussi.

Les deux violent la règle écrite du dépôt (`apps/ios/CLAUDE.md`) :
« Fire-and-forget Tasks: use `XCTestExpectation` with callbacks, **not**
`Task.sleep` ».

## Correctif (229i)

**Attendre l'événement réel au lieu de parier sur une durée.** `storyPrefetchTask`
est déjà `internal` (l.124 du ViewModel) — **aucun changement de production
n'est nécessaire**, ce qui était l'inconnue qui avait fait reporter ce correctif.

| | Avant | Après |
|---|---|---|
| Test négatif, étape 1 | `Task.sleep(150 ms)` | `await sut.storyPrefetchTask?.value` |
| Test positif | `Task.sleep(150 ms)` | `await awaitStoryPrefetch(sut)` |

`prefetchRecentStories()` est appelé **synchroniquement** avant que
`loadConversations()` ne rende la main (l.1151) : le handle est donc déjà posé,
et l'attendre est **strictement déterministe** — c'est ce qui supprime le flake
observé.

Le test positif ne peut pas faire aussi simple : le handle n'apparaît qu'après le
saut de cache interne au `Task` de `handleForegroundReturn()`. D'où le helper
`awaitStoryPrefetch(_:timeout:)`, qui **sonde** l'apparition du handle (5 ms
d'intervalle, pas de spin sur le main actor) puis l'attend. Le deadline de 5 s
garantit qu'une vraie régression reste une **assertion échouée** et non une suite
qui pend.

### Le sleep qui reste, et pourquoi il est correct

Un seul subsiste, dans le test négatif après `handleForegroundReturn()`. Quand le
garde court-circuite **correctement**, rien n'est lancé : il n'existe aucun
handle à attendre, et prouver une négative demande une fenêtre. Mais ce sleep-là
est asymétrique — il ne peut produire qu'un **faux VERT**, jamais le faux rouge
qui rendait le test instable. Un `await sut.storyPrefetchTask?.value` le suit
pour couvrir le cas de régression (un task **a** été lancé et doit finir avant
qu'on lise le compteur).

## Vérification — et ses limites

**Cette itération n'a pas de RED/GREEN au sens habituel, et le prétendre serait
malhonnête.** On ne « prouve » pas un flake en le rejouant une fois : c'est
justement ce qui le définit. Les preuves apportées sont :

- **l'historique CI** (vert puis rouge à code identique, bases identiques sur les
  fichiers concernés) — établi par `git log` sur l'intervalle exact, pas supposé ;
- **le mécanisme**, lisible dans le test et confirmé dans le ViewModel
  (`Task.detached` + relecture de cache + appel conditionnel) ;
- l'**arithmétique** du symptôme : un appel de trop, exactement, après un `reset()`.

Contrôles déterministes effectués hors Xcode (pas de toolchain Swift sous Linux) :
équilibre accolades / parenthèses / crochets du fichier au tokenizer
(**0 / 0 / 0**), helper défini 1× et utilisé 1×, 3 `await …storyPrefetchTask?.value`
(1 dans le helper, 2 dans le test négatif), **1** sleep restant — celui documenté
ci-dessus. Gate réel = CI `iOS Tests`.

## Bilan

**1 fichier de test, 0 fichier de production.** 2 sleeps fixes remplacés par une
attente de l'événement réel, 1 helper ajouté, 1 sleep conservé et justifié.
0 clé i18n, 0 couleur, 0 layout, 0 changement de comportement applicatif.

## Suites (230i+)

1. Le fichier contient **51** `Task.sleep` au total. **Ne pas les balayer en
   masse** : seuls ceux qui attendent un `Task` dont le handle est atteignable se
   convertissent proprement, et chacun demande la même lecture que celle faite ici.
   À traiter quand un flake se manifeste, ou surface par surface.
2. `MessageOverlayMenu.videoControls` (cibles tactiles, hérité de 223i) — demande
   un simulateur et un arbitrage sur le compteur `%` redondant.
3. `StoryViewerView+Content.shareStory()` — code mort, 0 site d'appel ;
   suppression + élargissement du verrou `UIActivityViewController` repo-wide.
