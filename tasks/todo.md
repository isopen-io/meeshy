<!-- Deux routines ont tourné en parallèle et écrivent chacune sa fiche dans ce fichier
     ÉPHÉMÈRE. Les deux sont conservées telles quelles : une fiche de cycle est le compte
     rendu d'un travail précis, elle ne se fusionne pas avec celle d'un autre. -->

# Cycle — Routine appels audio/vidéo : `CallNotification` distingue enfin 1:1 vs groupe

## Contexte

Routine programmée "audio/video calling continuous improvement" (Principal
Apple Platform Architect / WebRTC / Security scope). Le prompt demande un
audit complet 12 phases (iOS/WebRTC/CallKit/PushKit/sécurité/UX/tests/perf) et
un merge en fin de cycle. Plutôt que de tenter les 12 phases d'un coup — pas
réaliste ni sûr sur du code d'appel — cette exécution reprend le travail de la
routine précédente : `tasks/2026-08-13-group-calls-gap-analysis.md`, dont la
mise à jour du 2026-08-13(3) laissait W6/W7 (UI web groupe) et I1-I7 (mesh iOS
mono-PC) comme prochains candidats.

## Choix du cycle

**Un sous-item précis de W6** : `CallNotification` (bannière d'appel entrant
web) affichait le même texte pour un 1:1 et un appel de groupe — aucun moyen
pour l'appelé de savoir, avant de décrocher, s'il rejoint un appel à deux ou à
cinq. Corrigé en TDD (RED : 5 tests sur `isGroupCall`/`groupSize`, GREEN :
badge « {count} personnes » + sous-titre « Appel de groupe » quand
`participants.length > 2`, inchangé sinon). Détail complet dans le fichier
d'analyse (section « Mise à jour 2026-08-14 »).

## Fichiers touchés

- `apps/web/components/video-call/CallNotification.tsx`
- `apps/web/locales/{en,fr,es,pt}/calls.json` (+`incoming.groupSubtitle`,
  `+incoming.groupCallLabel`)
- `apps/web/__tests__/components/video-call/CallNotification.groupCall.test.tsx` (nouveau)
- `tasks/2026-08-13-group-calls-gap-analysis.md` (journal)

## Gates

- `apps/web` : suite `__tests__/components/video-call/` +
  `__tests__/components/video-calls/` — 36 suites / 182 tests verts.
- `tsc --noEmit` (`apps/web`) : mêmes erreurs pré-existantes qu'avant le
  changement (baseline inchangée), rien de nouveau dans les fichiers touchés.
- 4 locales validées JSON-valides.
- iOS : hors scope de ce correctif (aucun fichier Swift touché).

## Prochains candidats (W6/W7 restants, inchangés)

- Grille adaptative multi-participants (`VideoCallInterface.tsx`, aujourd'hui
  1 plein écran + vignettes flottantes).
- Roster avec états mute/vidéo par participant.
- `onRemove` (déclenché sur déconnexion, `VideoStream.tsx`) reste purement
  local — pas branché sur `DELETE /calls/:id/participants/:pid` pour une
  vraie éviction modérateur.
- Timeout global 45 s (`CallManager.tsx` `CALL_TIMEOUT_MS`) — déjà atténué par
  Vague 113/114 (2026-08-12, clear sur `status === 'active'`, qui se pose dès
  la 1re réponse en groupe) ; à vérifier explicitement par un test group-call
  dédié avant de le déclarer clos.
- i18n groupe pour le reste de l'UI d'appel (roster, toasts join/leave).
- Mesh iOS mono-PC (I1-I7, `tasks/2026-08-13-group-calls-gap-analysis.md`
  §iOS) — le chantier le plus large, non commencé.

---

# Cycle 123 — Le filtre de la cloche ne filtrait que le déjà-chargé, et ses pastilles ne comptaient que lui

## Le défaut

`GET /notifications` ne déclarait dans son querystring que `offset`, `limit`, `unreadOnly` et
`cursor`. Le web lui envoyait pourtant sept paramètres de plus :

```ts
params.set('sortBy', sortBy);
params.set('sortOrder', sortOrder);
if (type && type !== 'all') params.set('type', type);
if (priority) params.set('priority', priority);
if (conversationId) params.set('conversationId', conversationId);
if (startDate) params.set('startDate', startDate.toISOString());
if (endDate) params.set('endDate', endDate.toISOString());
```

Fastify retire de `request.query` toute clé absente du schéma de la route. Les sept partaient donc
sur le fil et ne filtraient rien — en silence, sans erreur, sans trace.

### Ce n'était pas du gaspillage, c'était un mensonge

Le filtrage réel se faisait côté client, `matchesFilter` appliqué aux notifications déjà chargées.
Sur une liste PAGINÉE, cela ne veut pas dire « filtrer » : **« aucune mention » ne signifiait que
« aucune mention parmi les vingt dernières notifications »**, et rien n'allait chercher les autres.
Un onglet vide n'était pas une réponse — c'était une fenêtre.

Le même défaut frappait deux autres chiffres du même écran, pour la même raison :

- **les pastilles de comptage** (`countByFilter(notifications, filter)`) — le nombre affiché sur
  chaque onglet changeait à chaque défilement ;
- **le sous-titre de la page** (`total: String(notifications.length)`) — « 20 notifications »
  annoncées à qui en a trois cents.

### La moitié du correctif était déjà écrite, et morte

`NotificationCounts.byType` était **déclaré** dans le type depuis toujours, sans qu'aucun producteur
ne l'écrive. `useNotificationCountsQuery` existait, exporté par la barrel, **sans consommateur**. Et
`getCounts()` rendait `total = unread = /notifications/unread-count` : deux questions différentes
servies par le même chiffre. Les deux moitiés d'une même fonctionnalité, mortes chacune de son côté
— le motif exact de la Leçon 241.

## Livré

- **Gateway** — `GET /notifications?types=` : CSV de types BRUTS, déclaré au querystring et appliqué
  en `type: { in: [...] }`, actif dans les DEUX modes de pagination (offset et curseur). Une liste
  vide rend `{}` et jamais `{ type: { in: [] } }` : le repli d'un paramètre illisible est l'absence
  de filtre — le même arbitrage que le curseur illisible, quinze lignes plus bas.
- **Gateway** — `GET /notifications/counts` → `{ total, unread, byType }`. Un `groupBy(['type'])`
  sous le MÊME `visibleNotificationsWhere` que la liste ; `total` se DÉDUIT du regroupement plutôt
  que d'un `count()` séparé (deux lectures = deux instants = deux chiffres qui peuvent se
  contredire). `byType` passe par `additionalProperties` dans le schéma de réponse : déclaré par
  `properties`, il aurait fallu réénumérer chaque type, et Fastify aurait retiré du fil en silence
  tout type oublié.
- **`@@index([userId, type, createdAt(sort: Desc), id(sort: Desc)])`** — égalité puis tri (ESR). Il
  **REMPLACE** `[userId, type]` : même préfixe, donc `markNotificationsByTypesAsRead` reste servi,
  sans second index à écrire. Sans les deux clés de tri dans l'index, MongoDB parcourt la plage
  `[userId, type]` puis TRIE tout ce qu'elle contient — l'historique entier de l'onglet à chaque
  page, pour vingt lignes à l'écran. **Prod : l'entrypoint ne joue aucune migration, index à créer
  à la main.**
- **Web — `FILTER_TYPES`**, source unique du groupement d'alias. Il remplace **deux `switch`
  recopiés dans le même fichier** (`countByFilter` et `matchesFilter`, identiques ligne pour ligne).
  L'onglet « tout » y rend une liste VIDE et non l'énumération de tous les types : une énumération
  devient fausse le jour où un type de plus est créé, et elle le devient en silence.
- **Web** — la page envoie l'onglet actif au serveur ; les pastilles et le sous-titre lisent
  `GET /notifications/counts`. Le sous-titre ne s'affiche PAS tant que le total n'est pas connu :
  un chiffre provisoire qui saute ensuite se lit comme une correction, pas comme un chargement.
- **Web** — les paramètres que la gateway ne déclare pas ne sont plus envoyés, **et la signature de
  `fetchNotifications` cesse de les admettre** (`NotificationQueryOptions` : `types`, `isRead`,
  pagination). Une signature qui accepte un filtre non honoré fait croire à un filtrage qui n'a pas
  lieu — c'est exactement ainsi que les sept ont voyagé sans lecteur. `sortBy`/`sortOrder` ne
  peuvent pas être ouverts : le curseur keyset est ancré sur l'ordre total `(createdAt desc,
  id desc)`, et servir un autre ordre lui ferait sauter des lignes sans rien signaler.
- **Temps réel — `listAcceptsType`.** Filtrer côté serveur crée un danger neuf : le socket insérait
  chaque `notification:new` dans TOUTES les listes (`setQueriesData`, préfixe `lists()`). Sur une
  liste qui n'a demandé que les mentions, cela ferait apparaître une demande d'ami que le serveur
  n'aurait jamais servie. L'insertion lit désormais les `types` dans la CLÉ de chaque query et écrit
  clé par clé. Les totaux d'onglets sont reportés en optimiste sur la même arrivée.
- **`NotificationCounts` monte dans `@meeshy/shared`** — ce n'est plus un type « frontend-specific »
  mais le corps d'une réponse, donc un contrat de fil, avec un seul lieu de déclaration.

### Ce que les doubles ont dû apprendre avant le code

`matchesNotificationWhere` savait filtrer par `userId`, `isRead`, `expiresAt`, `createdAt`, `id` —
pas par `type`, et sa doctrine est de **jeter** sur une clé inconnue. `groupByNotificationType` a été
ajouté à côté de `findManyNotifications`, appliquant le même `where` : un compteur qui verrait les
expirées ou l'inbox d'autrui recréerait la contradiction cloche/liste que le prédicat partagé existe
pour supprimer, et seul un double qui rejoue le prédicat peut le montrer.

### Un double de test qui figeait un contrat périmé

`use-notifications-query.test.tsx` doublait `@/lib/react-query/query-keys` par une copie manuelle.
La clé des compteurs n'y était pas — le hook jetait sur une fonction absente. Le double est retiré :
`queryKeys` est un module PUR, il n'y avait rien à isoler, seulement un contrat à figer par erreur.

## Gates

- Gateway : `tsc --noEmit` propre ; suite `notifications-routes` 47/47 ; suite complète jest.
- Web : `tsc --noEmit` sans erreur nouvelle (les deux restantes,
  `notification-socketio.singleton.test.ts` et `NotificationTest.tsx`, sont antérieures et dans des
  fichiers non touchés) ; 21 suites / 553 témoins verts sur `hooks/queries`, `services`,
  `components/NotificationItem`, `stores/notification-store`.
- RED vérifié des deux côtés : 6 rouges gateway avant implémentation ; le témoin d'insertion filtrée
  retombe rouge dès qu'on neutralise `listAcceptsType` (sabotage joué et annulé).
- iOS : **non exécuté** — runner Linux, aucun gate `meeshy.sh build`/XCTest. Aucun fichier Swift
  touché par ce cycle.

## Écarts assumés

- **La recherche TEXTE reste locale**, sur les pages chargées. Contrairement à l'onglet, elle ne
  prétend pas compter : le champ est vide par défaut, et l'utilisateur voit défiler ce qu'il a sous
  les yeux. Un `?q=` serveur est un chantier à part (index texte).
- **`priority`, `conversationId`, `startDate`, `endDate` ne sont pas honorés — ils sont retirés.**
  Aucune UI ne les commande ; les faire honorer par le serveur aurait été construire un filtre sans
  lecteur, l'exacte symétrie du défaut corrigé ici.
- **iOS n'envoie pas de `types` et ne lit pas `/notifications/counts`.** Les deux sont additifs : la
  cloche iOS se comporte exactement comme avant.

## Prochains candidats

- **`GET /notifications/counts` n'a pas d'ETag** alors que la gateway a un hook `onSend` généralisé
  (`utils/etag.ts`). Une pastille relue à chaque montage de page pour un chiffre qui bouge rarement
  est le cas d'école du 304. À vérifier d'abord : le hook s'applique-t-il déjà aux réponses
  `sendSuccess` ? Si oui, il n'y a rien à faire et c'est le constat qui est faux.
- **Auditer les PRESCRIPTIONS écrites dans `packages/shared/types/`** (leçon 238) — reporté du
  cycle 122. Les commentaires du type « à POSER, pas à incrémenter », « absent ⇒ `true` », « ne
  jamais soustraire » prescrivent un comportement CLIENT : chacun nomme un bug possible, et se
  vérifie par un grep du nom du champ chez chaque client.
- **`conversation:left` n'a pas de branche « c'est MOI qui suis parti »** (reporté du cycle 122) :
  `ConversationSyncEngine.startSocketRelay` n'y fait qu'un `cache.participants.invalidate(for:)`,
  alors que `conversation:closed` et `conversation:deleted` ont leur branche de retrait.
- **`updatedSince` (gwcontract-06, étape 1)** — toujours bloqué par l'absence de son consommateur
  iOS, et les tombstones (étape 4) toujours impossibles (hard delete, aucun `deletedAt`).
- **`GET /sync`** — reste sans client ; le brancher côté iOS est un chantier à part entière.
