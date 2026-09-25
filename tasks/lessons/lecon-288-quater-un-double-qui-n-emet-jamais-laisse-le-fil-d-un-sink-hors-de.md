## Leçon 288 quater — un double qui n'émet JAMAIS laisse le FIL d'un sink hors de toute mesure ; et un invariant logé derrière la porte du premier boot ne s'applique jamais à une base peuplée (2026-08-26, crash « Find nearby »)

**Le crash.** Sur l'iPhone comme au simulateur, l'écran « À proximité » mourait
quelques secondes après le tap : `SIGTRAP` dans `_dispatch_assert_queue_fail`,
file `com.apple.root.utility-qos`, trame `closure #1 in
NearbyDiscoveryViewModel.observeNetwork`. `NetworkMonitor.isOfflinePublisher`
débounce sur `DispatchQueue.global(qos: .utility)` et LIVRE sur cette file ; la
fermeture du `sink` appartient à une classe `@MainActor`, et le runtime vérifie
l'exécuteur à son entrée. `SyncPillViewModel`, l'autre abonné, posait
`.receive(on: DispatchQueue.main)` ; celui-ci non.

**Pourquoi 37 tests étaient verts.** `FakeNetworkMonitor` héritait du publisher
par défaut du protocole — `Empty(completeImmediately: false)`. Il n'émettait
JAMAIS : aucun test ne pouvait exercer la fermeture, ni le fil sur lequel elle
est appelée. La suite était verte **par omission**, exactement la forme de la
leçon « ce qui ne s'exécute pas ne se signale pas », portée à un PUBLISHER.

> **Un double de publisher doit savoir ÉMETTRE, et émettre depuis l'ordonnanceur
> du vrai.** Sans quoi tout `sink` reste un code jamais exécuté par la suite.
> Et la question à poser à chaque `.sink` d'un type isolé à un acteur : « sur
> quelle file ce publisher LIVRE-t-il ? » — la réponse est dans sa déclaration
> (`debounce(scheduler:)`, `receive(on:)`), jamais dans son nom.

**Le diagnostic, sans rapport de crash.** L'appareil n'avait aucun `.ips` du
crash (sous débogueur, rien n'est écrit). Chemin qui a marché : reproduire au
simulateur ; le process disparaît sans `.ips` non plus → demander à
RunningBoard la raison (`log show --predicate 'process == "SpringBoard"'` →
`Process exited: … code:SIGTRAP(5)`) ; relancer l'app, `lldb --batch -p PID -o
continue -k "bt 70"` — les `-k` s'exécutent au trap et rendent la pile exacte.

**Le second défaut, derrière le premier.** Une fois l'app vivante, les deux
routes rendaient 500 : `$geoNear requires a 2d or 2dsphere index`.
`InitService.ensurePostGeoIndex()` — dont le commentaire disait « inconditionnel,
à chaque boot » — n'était appelé que dans `initializeDatabase()`, que `server.ts`
ne lance que si `shouldInitialize()` est vrai, c'est-à-dire sur une base VIDE.
Une base peuplée ne recevait jamais l'index. **C'est l'APPELANT qui décide de
la fréquence d'un invariant, pas le commentaire de la méthode** (forme de la
mémoire « un commentaire qui affirme plus que son correctif »). Un invariant de
schéma se pose AVANT la porte du premier boot, jamais derrière.
