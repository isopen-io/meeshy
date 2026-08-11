---
"@meeshy/web": patch
---

La liste de conversations web se rattrape enfin après une coupure socket

Le QueryClient web tourne en `staleTime: Infinity` — Socket.IO EST la source de
vérité temps réel. `refetchOnReconnect: 'always'` semblait couvrir la reprise,
mais il écoute l'`onlineManager` de React Query, c'est-à-dire la transition
réseau du NAVIGATEUR : un redémarrage gateway, un drop de load balancer ou un
échec d'upgrade de transport ne bougent pas `navigator.onLine`. La sidebar
gardait donc ses compteurs de non-lus, ses aperçus de dernier message et son
effectif d'avant la coupure jusqu'au prochain focus de fenêtre ou remontage.

Le rattrapage se lit en DELTA — `GET /conversations?updatedSince=`, filtre déjà
indexé côté gateway et déjà consommé par iOS — jamais en refetch : sur une
infinite query, un refetch relit toutes les pages et REMPLACE le cache, donc
perd ce que les handlers socket y ont écrit.

Trois arbitrages portent le correctif :

- **Le curseur se calcule depuis le cache, il ne se persiste pas.** Il décrit
  exactement ce que le client détient et n'a donc aucune purge d'identité à
  orchestrer au changement de compte. Il est borné par `now`, ce qui ne peut
  qu'élargir la fenêtre — au pire on relit une ligne déjà détenue.
- **Le delta peut toujours BAISSER une pastille de non-lus, il ne peut la
  MONTER que s'il apporte aussi un message plus récent.** Sans cette borne, un
  instantané serveur antérieur à un `mark-as-read` encore en vol rallume la
  pastille que l'utilisateur vient d'éteindre.
- **Seul un RE-connect déclenche.** La première connexion ne prouve aucune
  fenêtre aveugle, et le montage relit déjà le serveur
  (`refetchOnMount: 'always'`).

Les règles de fusion, de tri et de curseur sont des valeurs pures, miroir nommé
de `ConversationSyncEngine.deltaSyncCore` et `SyncWatermark` côté SDK iOS — les
deux fichiers se nomment mutuellement.
