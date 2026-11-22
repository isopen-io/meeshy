# Cycle 213 — le web observe le curseur `_seq` et se resynchronise sur un trou (#18601)

*Routine « amélioration continue du temps réel », sur la tête de `dev` `753ec87e7`
(qui porte les cycles 209 à 212).*

## Ce que le web n'avait pas

La passerelle estampille d'un curseur monotone PAR COMPTE (`_seq`, `emitWithSeq`)
les émissions user-scoped. Le client avance son `lastSeq` ; un saut au-delà de
`lastSeq + 1` prouve qu'il a manqué des événements — une détection de trou
EXACTE, supérieure à un rattrapage temporel.

iOS l'observe (`SyncSeqTracker` → `NotificationGapResyncCoordinator`), Android
aussi (`syncSeqTracker` → `ChatResyncController`), **le web ne l'observait pas**.
Il était la seule plateforme sans aucun moyen de savoir qu'il avait manqué des
notifications pendant une coupure.

## La mesure qui AUTORISE le lot

Un `_seq` per-user GLOBAL observé PARTIELLEMENT est **pire que pas de curseur** :
il fabrique un trou à chaque événement estampillé non observé, et chaque faux
trou coûte une resynchronisation. La question n'est donc pas « le web peut-il
observer ? » mais « peut-il observer TOUT ce qui est estampillé ? ».

> Mesuré : `emitWithSeq` a **deux** sites d'appel dans toute la passerelle, et
> tous deux émettent `notification:new` (`NotificationService.ts`).

Observer ce seul événement est donc une observation COMPLÈTE. Et cet état ne se
relit pas dans un commentaire : le cliquet `socket-seq-lockstep-gate` dérive les
deux ensembles des sources et rougira le jour où un troisième site estampille.

## Ce que le lot écrit

- **`apps/web/src/lib/api/sync-seq.ts`** — l'état pur et le tracker, miroir exact
  de `SyncSeqState` (iOS) : le premier événement n'est jamais un trou, un doublon
  ou un réordonnancement n'en est pas un et ne fait pas reculer le curseur, seul
  un saut au-delà de `lastSeq + 1` en est un.
- **`resyncAfterSeqGap`** (`notifications-realtime.ts`) — la suite d'un trou. Le
  COMPTE de la cloche se relit (`refetchType: 'all'`) parce qu'il est lu partout,
  y compris là où aucune liste n'est montée, et qu'une pastille fausse est
  exactement ce que ce curseur existe pour corriger ; les LISTES gardent le
  régime de `applyNotificationNew` — périmées sans requête immédiate.
- **Le câblage** (`socket.ts`) : l'observation passe AVANT la livraison, donc le
  curseur avance même si le décodage échoue ensuite et même si aucun écran
  n'écoute.

## La preuve de ROUGE — trois mutations, et un témoin qui ne pouvait pas tomber

| mutation | ce qui tombe |
|---|---|
| le curseur n'est pas observé (l'état d'avant) | les 2 témoins de trou |
| le curseur RECULE sur un doublon | le témoin de réordonnancement |
| le curseur ne suit QUE ce que le consommateur sait lire | le témoin de charge malformée |

**La troisième mutation a d'abord rendu VERT**, et c'est la leçon de méthode du
lot : le témoin envoyait une charge malformée estampillée 5 en PREMIER, si bien
que le curseur restait à `null` — le 6 suivant était alors un « premier
événement », jamais un trou, sous le code juste comme sous la mutation. Le
vecteur commence désormais par un événement VALIDE (4), de sorte que le curseur
est déjà parti quand la charge malformée arrive.

> Un témoin qui exerce un cas limite doit d'abord amener le système dans l'état
> où ce cas SE DISTINGUE. Ici l'état neutre (`lastSeq = null`) absorbait la
> différence, et seule la mutation l'a montré.

## Le cliquet, dans les deux sens

`apps/web` sort de `PLATFORMS_WITHOUT_SEQ_CURSOR` (l'inventaire est désormais
VIDE : les trois plateformes observent). Mesuré dans les deux sens — vert avec
l'observation, et rouge (« web n'observe pas le `_seq` de notification:new ») dès
qu'on la retire.

**Le liage du cliquet a dicté la FORME du câblage**, et c'est à dire : il cherche
le dernier nom d'événement résoluble dans les 400 caractères qui PRÉCÈDENT
l'observation. Un tracker créé loin de sa liaison aurait été lié au mauvais
événement — ou à aucun. L'événement est donc nommé juste au-dessus du
gestionnaire (`const seqStampedEvent = SERVER_EVENTS.NOTIFICATION_NEW`), ce que
le cliquet documente comme son comportement voulu : « un client qui DÉPLACE son
observation hors de la portée du liage rend ce cliquet ROUGE, et c'est le bon
comportement ».

## Deux affirmations que ce lot rend fausses, corrigées dans le même commit

`emitWithSeq.ts` et le miroir Kotlin (`MessageSocketManager.kt`) écrivaient tous
deux « `apps/web` n'observe aucun curseur (#18601) » — vrai jusqu'à ce commit.
Les deux disent désormais ce qui est, avec leur date, et renvoient au cliquet
pour l'état. C'est la discipline du cycle 212 appliquée au lot qui périme la
phrase : **celui qui rend une affirmation fausse est celui qui la corrige.**

## Gates

| gate | résultat |
|---|---|
| `bun test src/lib/api/socket-sync-seq.test.ts` | **7 verts / 0 rouge** |
| `bun test src/lib/api/` | **4644 verts / 0 rouge** |
| `tsc --noEmit` (web) | **0** |
| `vitest socket-seq-lockstep-gate` | 6 verts, et rouge sur le retrait de l'observation |
