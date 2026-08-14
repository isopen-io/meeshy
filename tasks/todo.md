# Cycle 122 — La cloche dupliquait ses lignes dès qu'une notification arrivait pendant le défilement

## Le défaut

Deux gestes corrects, incompatibles ensemble, dans le même cache React Query.

`useInfiniteNotificationsQuery` demandait sa page suivante par RANG :

```ts
getNextPageParam: (lastPage) => {
  if (!lastPage?.pagination?.hasMore) return undefined;
  return lastPage.pagination.offset + lastPage.pagination.limit;
}
```

`useNotificationsManagerRQ`, lui, insère chaque `notification:new` **en tête de la page 0** du
même cache (`pages.map((page, index) => index === 0 ? { ...page, notifications: [notification,
...page.notifications] } : page)`).

Une notification reçue entre la page 1 et la page 2 décale toute l'inbox d'un cran **côté serveur**.
La page 2 demandée à `offset=20` re-sert donc la ligne déjà affichée en fin de page 1 — doublon
visible, clés React en conflit — et **saute la première ligne jamais vue**. Celle-là ne revient
pas : rien ne redemande un rang déjà consommé. Une suppression produit le décalage inverse.

### Pourquoi le garde existant ne pouvait pas l'attraper

Le manager porte bien un `notificationExists`. Il compare l'événement SOCKET aux pages en cache —
jamais une PAGE RÉCUPÉRÉE aux pages déjà tenues. C'est l'autre sens du problème, et il n'y avait
rien pour lui.

### Un second décalage, sous le premier

L'`orderBy` de la route était `{ createdAt: 'desc' }` seul. Deux notifications nées dans la même
milliseconde — un fan-out en écrit couramment plusieurs — n'ont alors aucun ordre stable : elles
s'échangent leur place d'une lecture à l'autre, et une pagination par rang en saute une. Ce défaut-là
ne dépend d'aucun trafic concurrent, et un curseur posé sur un ordre partiel l'aurait hérité.

## Livré

- **Gateway** — `GET /notifications?cursor=` : keyset `(createdAt, id)`, prioritaire sur `offset`,
  qui reste intact pour les appelants historiques (iOS). `orderBy` devient l'ordre TOTAL
  `[{createdAt:desc},{id:desc}]` dans les DEUX modes. Ligne sonde `take: limit+1` ⇒ `hasMore` sans
  `count()` : la requête de comptage **disparaît du chemin** sous curseur.
- **`nextCursor` rendu AUSSI en mode offset** — c'est ce qui permet la bascule sans redemander une
  page : la page 1 se prend comme avant (pour son `total`), la suite au curseur. Le champ est
  DÉCLARÉ dans le schéma de réponse Fastify ; un champ non déclaré est retiré du fil en silence
  (piège documenté `api-schemas.ts:1520`), et un témoin l'ancre.
- **`services/gateway/src/utils/keyset-cursor.ts`** — `encodeCursor`/`decodeCursor` déplacés hors de
  `routes/posts/types.ts` : trois services les importaient déjà depuis un module de ROUTES, et
  l'inbox est le quatrième lecteur, hors domaine posts. Nouveau `keysetBeforeClause(cursor)` qui
  énonce UNE fois la clause de reprise. `routes/posts/types.ts` ré-exporte — aucun import existant
  ne bouge, une seule implémentation.
- **Web** — `pageParam: { cursor } | { offset }`. Repli EXPLICITE : `nextCursor` **absent** =
  gateway antérieure (le web se déploie en premier) ⇒ on continue par offset ; `null` = fin de
  liste. Couper le défilement à la page 1 pendant la fenêtre de déploiement aurait été une
  régression livrée par le client.
- **SDK iOS** — `NotificationPagination.total`/`.offset` optionnels, `nextCursor` ajouté. iOS
  n'envoie pas de curseur aujourd'hui ; déclarés non-optionnels, le premier appel `?cursor=` aurait
  fait échouer le décodage de la RÉPONSE ENTIÈRE (`decodeIfPresent` jette sur une valeur présente et
  malformée) — cloche vide, sans erreur lisible.

### Le double Prisma a été changé avant le code

`matchesNotificationWhere` savait filtrer, pas TRIER. Or offset et curseur rendent exactement la
même chose tant que la source ne bouge pas : leur différence n'apparaît qu'en INSÉRANT une ligne
entre deux pages, sur une source qui reclasse à chaque lecture. `findManyNotifications` (filtre →
tri → fenêtre) est ce qui rend le RED discriminant possible ; il **jette** sur un `orderBy` autre
que `(createdAt desc, id desc)`, parce qu'une page servie dans un ordre que le curseur ne sait pas
reprendre saute des lignes en silence.

## Écarts assumés vs la fiche gwcontract-06

- **(a) `updatedSince` (étape 1) non livré, ni l'index `[userId, readAt]` (étape 5).** Son
  consommateur est le client delta iOS (`NotificationGapResyncCoordinator`, étape 6), non livrable
  depuis un runner Linux. Livré seul, ce serait un paramètre sans lecteur — et l'index qui va avec
  se poserait sur une hypothèse de charge que rien n'exercerait.
- **(b) Tombstones (étape 4) : toujours impossibles.** Hard delete, aucun `deletedAt` sur
  `Notification`. Le constat de la fiche tient tel quel.
- **(c) `nextCursor` en mode offset** — non demandé par la fiche. Sans lui, un client devrait
  redemander sa page 1 pour obtenir sa première ancre.

## Gates

- Gateway : `npx tsc --noEmit` propre ; suite complète jest verte.
- Web : suites `__tests__/hooks/queries` + `__tests__/services/notification.service.test.ts` vertes ;
  `tsc --noEmit` sans erreur nouvelle (baseline identique, comparée par `git stash`).
- iOS : **non exécuté** — runner Linux, aucun gate `meeshy.sh build`/XCTest disponible. Les deux
  témoins Swift sont écrits mais n'ont pas tourné.

## Prochains candidats

- **`GET /notifications` ignore en silence la moitié de ce que le web lui envoie** — `type`,
  `priority`, `conversationId`, `startDate`, `endDate`, `sortBy`, `sortOrder` ne sont pas déclarés
  dans le querystring, Fastify les laisse donc tomber ; le filtrage réel se fait côté client
  (`matchesFilter`) sur les seules pages chargées. Un filtre qui ne filtre que le déjà-chargé ment
  sur une liste paginée : « aucune mention » peut vouloir dire « aucune mention dans les 20
  dernières notifications ». Fiche à instruire (gateway + web).
- **`gwcontract-08`** (delta feed principal + statuses) n'est plus bloqué : `gwcontract-11` est
  livré depuis le cycle 80, sa case du plan était restée ouverte — corrigée ici après vérification
  dans le code.
- **Auditer les PRESCRIPTIONS écrites dans `packages/shared/types/`** (leçon 238). Les commentaires
  du type « à POSER, pas à incrémenter », « absent ⇒ `true` », « ne jamais soustraire » prescrivent
  un comportement CLIENT : chacun nomme un bug possible, et se vérifie par un grep du nom du champ
  chez chaque client.
- **`conversation:left` n'a pas de branche « c'est MOI qui suis parti »** :
  `ConversationSyncEngine.startSocketRelay` n'y fait qu'un `cache.participants.invalidate(for:)`.
  `conversation:closed` et `conversation:deleted` ont bien leur branche de retrait — l'asymétrie est
  l'écart. À vérifier avant de coder : le device qui vient de quitter est-il encore dans la room au
  moment de l'émission (`routes/conversations/leave.ts:91`) ? Si non, le canal correct est
  `broadcastToUser`, et le correctif est côté gateway.
- **`GET /sync`** — reste sans client ; le brancher côté iOS est un chantier à part entière.
