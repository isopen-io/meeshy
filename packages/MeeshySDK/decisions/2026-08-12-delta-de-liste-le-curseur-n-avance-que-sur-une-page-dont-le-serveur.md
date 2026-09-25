## 2026-08-12: Delta de liste — le curseur n'avance que sur une page dont le serveur atteste la complétude
**Statut**: Accepté

**Contexte**: `ConversationSyncEngine.deltaSyncCore` avançait `lastSyncTimestamp` (persisté dans
`UserDefaults`) au max des `updatedAt` reçus, quelle que soit la page. `GET /conversations`
plafonne à 100 lignes ; le tri par `updatedAt` croissant (cycle 77) rend la troncature rattrapable
dans le cas général, mais pas quand plus de 100 conversations partagent la même milliseconde — la
borne serveur est stricte (`gt`), donc le débordement était enjambé jusqu'à la réconciliation
complète, bornée à 1× par 24 h.

**Decision**: `deltaSyncCore` rend un `DeltaOutcome { succeeded, mayHaveMore }` au lieu d'un `Bool`.
`mayHaveMore` est lu sur `pagination.hasMore`, **autoritaire ici** : une page delta part toujours
d'`offset=0`, ce qui fait compter au serveur toutes les lignes de la même clause `updatedAt > since`
(`routes/conversations/core.ts`). Quand il vaut `true` : le curseur NE BOUGE PAS
(`SyncWatermark.advancedAfterDeltaPage`), puis `syncSinceLastCheckpoint` enchaîne `fullSync()`.
L'ordre est le contenu de la décision — c'est parce que le curseur est resté en arrière qu'une
escalade échouée laisse la fenêtre entière rejouable au lieu d'un trou permanent. La fusion de la
page reçue est conservée dans tous les cas. `limit` passe de `500` (jamais honoré) à
`deltaPageLimit = 100`, ce qui rend utilisable le repli `count >= limit` quand une réponse omet sa
pagination.

**Alternatives rejetées**: paginer le delta (`offset += 100` jusqu'à `hasMore == false`) — le
curseur est persisté, une boucle interrompue en son milieu laisserait un état intermédiaire à
persister ou à jeter, là où `fullSync` est déjà écrit, testé et idempotent ; détecter la troncature
par `count >= limit` comme le web le faisait — l'heuristique escalade sur une fenêtre de très
exactement 100 conversations, qui est pourtant complète (le web a été aligné sur `hasMore` dans le
même lot) ; avancer le curseur puis escalader — une escalade échouée (offline, panne) rendrait la
perte irréversible.

**Cons**: divergence ASSUMÉE avec le web sur le curseur, notée en tête de
`syncSinceLastCheckpoint` : le web le RECALCULE depuis son cache, donc fusionner la page l'avance
mécaniquement ; seul un curseur persisté peut « ne pas avancer ». Le résidu même-milliseconde n'est
pas fermé mais rendu convergent — le fermer demanderait un curseur composite `(updatedAt, id)` côté
route. `deltaPageLimit` reste une constante jumelle tenue à la main, comme `fullReconcileInterval`.
