## Leçon 295 — Une écriture de cache « fire-and-forget » n'est pas testable, et elle n'est pas correcte non plus (2026-08-26, rouge CI iOS `FeedViewModelTests`)

**Contexte.** Après le merge groupé, le workflow iOS de `main` rougit sur
`test_loadMoreIfNeeded_afterFreshCacheOnlySession_stillFetchesDespiteNilCursor`
(« 0 post au lieu de 10 » juste après avoir semé 10 posts dans le cache). Vert
3/3 en isolation locale. Le fichier de test DOCUMENTAIT déjà la cause dans son
`setUp` : `fetchFeedFromNetwork` persistait « main-feed » dans un
`Task.detached(.utility)` jamais attendu ; la sauvegarde tardive d'un test
précédent repeuplait le cache APRÈS le `invalidate` du suivant.

> **Un `Task.detached` qui écrit un état partagé sans être attendu est un
> défaut de PRODUIT avant d'être un flake de test** : rien n'ordonne cette
> écriture par rapport à la suivante — une réponse lente peut écraser une plus
> récente dans le cache. Le test qui « flake » est le seul témoin qui ait rougi.
> Relancer la CI (ce que j'ai d'abord fait) constate le hasard, ne le retire pas.

Ce qu'un rouge DÉTERMINISTE a exigé, dans l'ordre :

1. **Un premier test « après `loadFeed`, le cache contient la page » est passé
   du premier coup** — la course se perd rarement sur une machine rapide. Un
   test qui passe sans le correctif ne prouve rien (TDD : *watch it fail*).
2. **Contrôler le magasin** : un protocole app-side réduit aux quatre
   opérations que le ViewModel utilise (`FeedCacheStoring`), injecté par l'init
   avec un relais vers `CacheCoordinator.shared.feed` par défaut — le relais
   parce qu'une valeur par défaut d'init `@MainActor` ne peut pas lire la
   propriété d'un acteur d'un autre module sans `await`.
3. **Un double à BARRIÈRE** dont `save` se suspend jusqu'à `releaseSave()` :
   « `loadFeed` ne doit pas avoir fini tant que sa sauvegarde est retenue »
   rougit à coup sûr avec le `Task.detached`, et verdit dès que la sauvegarde
   est attendue en ligne (après la publication de `posts` — l'UI ne perd rien).

Corollaires : le double vit dans le fichier de test (un fichier de mock NEUF
exige un passage XcodeGen — cf. « fichier de test neuf ») ; et le test flaky
d'origine passe de `try?` à `try` sur sa graine — un `save` qui échoue doit le
DIRE, pas se lire « 0 au lieu de 10 » deux assertions plus loin.

**Le piège du témoin lui-même — `withTaskGroup` attend TOUS ses enfants.** La
première version du helper « la tâche finit-elle dans les 2 s ? » faisait la
course dans un groupe : un enfant `await task.value`, un enfant `sleep`, puis
`cancelAll()`. `cancelAll()` n'interrompt pas un `await task.value`, et la
sortie de `withTaskGroup` ATTEND tous les enfants : dès que le correctif a
rendu `loadFeed` vraiment suspendu derrière la barrière — que le test ne lève
qu'APRÈS le retour du helper — le témoin s'est interbloqué. Verdict :
« Test crashed with signal kill », attribué à ce test, 173/174 verts. En RED
le défaut du helper était invisible : `loadFeed` rendait la main en quelques
ms, l'enfant finissait, le groupe sortait. **Un témoin qui n'a été vu rougir
que sur un chemin rapide n'a pas encore été vu VERT sur le chemin lent** — la
passe GREEN valide aussi le témoin. Guetteur non structuré + drapeau scruté.

Et la passe GREEN se lit dans le bundle de résultats, jamais dans le verdict :
la première « verte » avait exécuté 0 test (classes inexistantes dans
`-only-testing`, que xcodebuild accepte sans un mot) ; la seconde disait
`TEST EXECUTE FAILED` alors que chaque ligne `Executed N tests, with 0
failures` était verte — le processus avait été tué et relancé, et seule la
passe de relance imprimait son résumé. `xcresulttool get test-results
summary` donne le compte qui fait foi (`totalTestCount`, `failedTests`).

Sites : `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift`
(`FeedCacheStoring`, `SharedFeedCache`, `fetchFeedFromNetwork`),
`apps/ios/MeeshyTests/Unit/ViewModels/FeedViewModelTests.swift`
(`GatedFeedCacheStore`).
