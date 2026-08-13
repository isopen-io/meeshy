# Cycle 114 — routine messaging (2026-08-13)

## Audit

Point de départ : cycle 113 (`fix(sync)`, borne de poids sur `/sync`) mergé, arbre propre,
branche == `main`. Les cycles 111–113 avaient tous mordu côté **gateway** sur les canaux de
rattrapage. Ce cycle a donc audité les **récepteurs** de ces canaux, plateforme par plateforme.

Constats du balayage (les trois sont réels ; un seul a été livré) :

1. **`GET /sync` n'a AUCUN consommateur client.** Ni iOS, ni web n'appellent la route — c'est un
   pilote serveur (collection `messages`, spec A3). Les cycles 111–113 l'ont durci sans que
   personne le lise encore. Pas un défaut : un chantier en avance sur ses clients.
2. **Le masquage personnel au niveau MESSAGE n'a aucune surface produit.**
   `DELETE /api/messages/:id/delete-for-me`, sa jumelle bulk et `restore-for-me` existent, sont
   testées, diffusent (`message:hidden-for-me` / `message:restored-for-me`), et le web ÉCOUTE ces
   events — mais **aucun client n'appelle les routes**. iOS n'écoute même pas les events. Capacité
   serveur complète, sans déclencheur. À trancher (exposer ou retirer) — **non traité ce cycle**,
   c'est une décision produit, pas un correctif.
3. **[LIVRÉ] iOS jetait `meta.deletedConversationIds` du delta des conversations.** → PR #2966.

## Livré — PR #2966

`fix(ios/sync): les SORTIES de conversation annoncées par le delta n'atteignaient pas iOS`

- `APIResponseMeta` : + `deletedConversationIds`, + `deletedConversationIdsTruncated`.
- `OffsetPaginatedAPIResponse` : + `meta` (défaut `nil`).
- `mergeDeltaConversations(existing:deltas:tombstoneIds:)` : tombstones APRÈS les upserts,
  `removedIds` dédupliqué.
- Troncature des tombstones repliée dans `mayHaveMore` (escalade `fullSync` + curseur retenu).
- Index FTS local purgé au retrait ; ré-index du même lot filtré par `removedSet`.

TDD : 5 tests d'unité (fusion), 4 bout-en-bout (moteur), 3 de décodage d'enveloppe.

**Contrainte d'exécution** : aucun toolchain Swift dans l'environnement de la routine — les gates
Swift sont la CI (`sdk-tests` macOS + `ios-tests`), pas une exécution locale.

## Reste ouvert (candidats des prochains cycles)

- **Constat 2 ci-dessus** — masquage personnel au niveau message : décision produit à prendre.
- **`GET /sync`** — reste sans client ; le brancher côté iOS est un chantier à part entière
  (le SDK a son propre `ConversationSyncEngine` sur `/conversations?updatedSince=`).
- **Android** — aucun delta `updatedSince` ; pas d'écart symétrique à combler aujourd'hui.
- **`conversation:left` n'a pas de branche « c'est MOI qui suis parti »** (candidat cycle 115) :
  `ConversationSyncEngine.startSocketRelay` n'y fait qu'un
  `cache.participants.invalidate(for:)` — le pendant TEMPS RÉEL du correctif de ce cycle manque
  donc. Un départ déclenché depuis un autre appareil ne retire la conversation de la liste qu'au
  prochain delta (ce que la PR #2966 rend enfin possible), pas immédiatement. `conversation:closed`
  et `conversation:deleted`, eux, ont bien leur branche de retrait — l'asymétrie est l'écart.
  À vérifier avant de coder : le device qui vient de quitter est-il encore dans la room au moment
  de l'émission (`emitToConversationParticipants`, `routes/conversations/leave.ts:91`) ? Si non,
  le canal correct est `broadcastToUser`, et le correctif est côté gateway.

## Review

Voir `tasks/lessons.md` → **Leçon 238** (un contrat livré et testé des deux côtés peut n'avoir
aucun récepteur sur une plateforme ; le type d'enveloppe comme point de coupure invisible ; le
retrait qui doit s'énumérer par magasin ; curseur persisté vs recalculé).

---

# Cycle 115 — le canal de rattrapage servait le trou qu'il devait boucher

*Le cycle 115 a repris le backlog d'audit (`docs/reviews/2026-08-01-ios-local-first-realtime/10-plan-d-application.md`),
où `gwcontract-03` (cycle 112) et son budget de poids (cycle 113) venaient de débloquer la seule
fiche gateway du Lot 7. Elle est livrée. Le lot du cycle 110 (badge APNs, `Mention`/`TrackingLink`)
reste intact et reconduit. Le cycle 114 (ci-dessus, volet iOS de `gwcontract-04`) a tourné en
PARALLÈLE de celui-ci sur une autre branche : son candidat `conversation:left` reste donc ouvert.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch.**

> ## La leçon que le cycle 115 ajoute — la variable qui porte deux colonnes
>
> **`authContext.userId` porte un `User.id` pour un compte et un `Participant.id` pour une session
> anonyme.** La RLS de `/sync` filtrait `Participant.userId`, NULL pour tout anonyme : retirer le
> seul `allowAnonymous: false` aurait rendu une route qui répond **200 avec des streams vides**, sur
> le canal dont le métier est de dire ce qu'on a manqué. Pas d'erreur, pas de log — indiscernable
> d'un « rien n'a changé ».
>
> **Le symptôme à reconnaître** : une variable dont le NOM désigne une entité mais dont la VALEUR
> dépend de l'appelant. Remède : une union discriminée, pas un commentaire — elle oblige chaque
> lecteur à dire quelle colonne il interroge.
>
> **Corollaire — une fiche d'audit peut se tromper de mécanisme, et sa garde devient du code mort
> RASSURANT.** Deux des trois étapes prescrites par `gwcontract-09` étaient fausses (détail plus
> bas). Exécuter mentalement le chemin décrit sur le code réel AVANT d'écrire la garde qu'on vous
> dicte. Leçon 239, quatre corollaires.

## Livré au cycle 115 — `GET /sync` pour les sessions anonymes, et le plancher d'historique qu'il n'appliquait à personne

**Le défaut.** `/sync` rejetait les sessions anonymes (`allowAnonymous: false`) : un invité entré
par lien de partage n'avait AUCUN canal de rattrapage éditions/suppressions. Combiné à `net-02`
(sockets jamais relancés au resume, toujours ouvert, iOS-only), un invité voyait indéfiniment des
messages supprimés. Fiche `gwcontract-09`, P2, débloquée par `gwcontract-03` (cycle 112).

**Livré (gateway).** `services/shareLinkHistoryFloor.ts` (nouveau module) + `routes/sync.ts` :
- `SyncIdentity`, union discriminée `{kind:'user', userId} | {kind:'anonymous', participantId}` —
  la RLS interroge `Participant.id` pour un anonyme, `Participant.userId` pour un compte, et le
  `scope` reste une INTERSECTION dans les deux cas.
- Plancher d'historique des liens de partage (`allowViewHistory:false` ⇒ `createdAt >= joinedAt`)
  appliqué aux DEUX streams, `changed` et `deleted`.
- Tables personnelles (`UserMessageDeletion`, `UserConversationPreferences`, toutes deux attachées à
  `User`) court-circuitées pour un anonyme — idiome `userId: null` repris tel quel de `messages.ts`.
- `UserEventSeq` non interrogée pour un anonyme (`checkpointSeq = 0`).

**Les TROIS écarts vérifiés vs la fiche** (les deux premiers sont des erreurs de la fiche, corrigées
dans `06-reseau-et-contrat-gateway.md` au même commit) :
1. *Le crash annoncé n'existe pas.* `currentSeq` devait planter en « malformed ObjectID » sur le
   sessionToken. L'anonyme porte un `Participant.id` — ObjectId valide. La garde-pattern prescrite
   aurait été du code mort avec un test vert éternel. Le court-circuit reste pour la vraie raison :
   `UserEventSeq` est indexée par `User.id`.
2. *Le clamp prescrit ne fermait pas la fuite.* `sinceDate = max(sinceDate, joinedAt)` borne
   `updatedAt` ; un message d'avant la jointure **réédité** depuis le franchit avec tout son contenu.
   La borne est sur `createdAt`, la colonne exacte de `messages.ts`.
3. *La règle appartient à la LIGNE PARTICIPANT, pas au type d'identité.* Un utilisateur INSCRIT
   entré par un lien sans historique avait le même trou dans `/sync` — fermé par le même mécanisme.
   Le ranger sous « fiche sessions anonymes » l'aurait laissé ouvert.

**TDD.** 11 tests rouges d'abord (`sync.test.ts`, deux nouveaux `describe`) + 10 sur le module
(`shareLinkHistoryFloor.test.ts`). Mutation-proof : les 5 gardes cassées une à une, chacune fait
tomber EXACTEMENT son témoin (`allowAnonymous`, RLS par `id`, court-circuit `currentSeq`, plancher
sur le stream `deleted`, court-circuit du masquage) — aucune n'est portée par une autre.

**Gates.** `tsc --noEmit` propre ; suite gateway complète **710/710 suites, 17 344 tests** verts.

### Reste ouvert après ce cycle
- **`gwcontract-14` (nouveau, P3/S — renuméroté au cycle 116, collision avec la fiche `gwcontract-12-message-consumed-literal` préexistante)** : `messages.ts` garde sa copie inline de la règle de plancher
  (il y ajoute les 403 `SHARE_LINK_EXPIRED`/`SHARE_LINK_MAX_USES`). Deux lecteurs d'une même règle —
  la famille de défauts des cycles 105-111. La convergence demande de séparer le FILTRE de la
  DÉCISION DE RÉPONSE, pas de les empiler.
- **`/sync` n'applique pas les 403 expiry/maxUses** qu'applique `GET messages` : un lien expiré
  garde son canal delta tant que la session reste `isActive`. Non traité ici (la fiche ne le demande
  pas, et c'est une décision de réponse, pas un filtre) — c'est l'objet de `gwcontract-14`.
- **`net-02` (P1, iOS)** : le volet client du même Lot 7. Non livrable depuis un runner Linux.
- **`sync-01`** : aucun client n'appelle encore `/sync` — l'impact de tout ce lot reste prospectif
  tant que le backfill iOS n'est pas câblé.
- Hérités : scope communauté de `user:preferences-updated` non routé côté iOS ; arbitrage
  `delete-for-me` du cycle 12 en attente de validation humaine.

## Livré au cycle 116 — `notification:read-bulk` : les marquages EN MASSE ne disaient rien aux autres appareils

**Le défaut.** Fiche `gwcontract-05`, P2/S. Les étapes 1-2 (émission unitaire `notification:read` /
`notification:deleted`) étaient déjà livrées (`3152326c`). Restait l'étape 3 : les **quatre chemins
de marquage groupé** — `markAllAsRead`, les trois clés de `markContextNotificationsAsRead` (ouvrir
une conversation, consommer un post, répondre à une demande d'ami), `markNotificationsByTypesAsRead`
— n'émettaient que `notification:counts`. Le badge de l'iPad tombait à zéro pendant que sa cloche
gardait les lignes en NON LUES, jusqu'au refetch complet. Discret précisément parce que le geste
unitaire, lui, se propageait : l'appareil se corrigeait ligne à ligne, jamais par lot.

**Livré (gateway + shared + web).**
- `NotificationReadBulkScope` (`packages/shared/types/notification.ts`) : union discriminée
  `{kind:'all'} | {kind:'context', contextKey, contextValue} | {kind:'types', types}`.
- `notificationMatchesReadBulkScope` (`packages/shared/utils/notification-read-bulk.ts`) — énoncé
  UNIQUE du prédicat, importé par le web, miroir Swift à venir.
- Gateway : `NotificationService.announceReadBulk()`, appelé par les 4 chemins quand `count > 0`,
  en PLAIN `io.to(...)` (jamais `emitWithSeq` — lockstep gwcontract-01).
- Web : `notificationSocketIO.onNotificationReadBulk` + handler dans `use-notifications-manager-rq`
  qui rejoue le prédicat sur les pages React Query, **sans toucher au badge**.

**Les TROIS écarts assumés vs la fiche** (documentés dans `06-reseau-et-contrat-gateway.md`) :
1. *Le sac d'options prescrit (`{conversationId?, postId?, types?, all?}`) n'a pas de place pour
   `friendRequestId`* — la 3e clé sur laquelle la gateway marque en masse, omise par la fiche. Un
   client l'aurait ignorée EN SILENCE. Union discriminée à la place ; le `contextKey` émis est celui
   que la requête Mongo interpole, les deux dérivant du même couple.
2. *Pas de `count` dans le payload.* Un cache client est PARTIEL : il matche moins de lignes que le
   serveur n'en a marquées. Fournir le champ, c'était offrir le double-décrément dont la fiche
   avertit elle-même deux étapes plus loin. `notification:counts` reste seul autoritaire.
3. *Un `kind` inconnu ne matche RIEN* — repli sûr pour un client plus vieux que son serveur.

**TDD.** 5 tests gateway rouges d'abord (`NotificationService.readSyncEvents.test.ts`, nouveau
`describe`), 9 sur le prédicat partagé, 6 sur le hook web + 2 sur le singleton — tous vus rouges.

**Gates.** `tsc --noEmit` gateway propre ; shared 54 fichiers / 1 538 tests verts ; 28 suites
NotificationService gateway (534 tests) vertes ; suites web « notification » (33 suites / 478 tests)
vertes ; web `tsc` inchangé (1 229 erreurs préexistantes, identiques avant/après).

### Reste ouvert après ce cycle
- **Volet iOS de `gwcontract-05`** : décoder `notification:read-bulk` (`MessageSocketManager` +
  `NotificationToastManager`) et porter le prédicat en Swift. Non livrable depuis un runner Linux.
  L'événement est additif — un client qui l'ignore se comporte exactement comme avant.
- **`gwcontract-13` (nouvelle fiche écrite ce cycle, P2/S)** : symétrique exact côté SUPPRESSIONS.
  « Supprimer toutes les lues » n'émet que `notification:counts`, **qui ne dit rien ici** — seules des
  lignes DÉJÀ lues partent, `unread` est inchangé — et les lignes purgées restent listées sur les
  autres appareils. Le prédicat à diffuser est DÉJÀ écrit côté acteur
  (`useDeleteAllReadNotificationsMutation`, optimiste) : le correctif ne demande aucune règle
  nouvelle. Fiche complète dans `06-reseau-et-contrat-gateway.md` (événement additif
  `notification:deleted-bulk { scope: {kind:'read'} }`, union à un membre par anticipation).
- **`apps/web/utils/socket-validator.ts` est du code mort** : zéro appelant hors de son propre
  fichier de test. Il n'a délibérément PAS été étendu au nouvel événement (ajouter un schéma à un
  validateur inutilisé, c'est ajouter du code mort). À retirer ou à brancher — décision à instruire.
- Hérités : `gwcontract-14` (copie inline du plancher d'historique dans `messages.ts`), `net-02`
  (P1, iOS), `sync-01` (aucun client n'appelle encore `/sync`).

---

# Cycle 117 — la purge annonçait un compteur qui ne bougeait pas

*Entrée de cycle : `main` == branche, arbre propre, `git fetch origin main` fait. Le cycle 116
laissait un successeur ÉCRIT — la fiche `gwcontract-13`, rédigée par lui-même en fin de course.
Ce cycle l'a exécutée telle quelle : c'est le cas nominal de la routine, le backlog d'audit
servant de source de conception et non de registre à cocher (leçon 122).*

## Audit

Le défaut est le symétrique de celui du cycle 116, et il vaut d'être énoncé dans le sens qui le
rend visible : **`deleteAllRead` émettait bien un événement — `notification:counts` — et cet
événement ne dit rien.** Une purge des lues ne retire que des lignes déjà lues : `unread` est
inchangé PAR CONSTRUCTION, et `total` n'est affiché nulle part. Le chemin avait donc l'apparence
complète d'un chemin annoncé, sans qu'aucun bit d'information ne parte.

C'est ce qui le rend plus grave que son jumeau du cycle 116, pas moins :

| | marquage en masse (cycle 116) | purge des lues (ce cycle) |
|---|---|---|
| ce que `counts` recale | le badge (juste) | **rien** |
| ce qui dérive | les lignes affichées | les lignes affichées |
| récupération | refetch complet | refetch complet |

Conséquence produit : vider sa cloche sur l'iPhone la laisse pleine sur l'iPad, et **chaque ligne
survivante ouvre un écran dont la notification n'existe plus**.

## Livré — `notification:deleted-bulk` (gateway + shared + web)

- **shared** — `NotificationDeletedBulkScope = { kind: 'read' }` (`types/notification.ts`),
  `SERVER_EVENTS.NOTIFICATION_DELETED_BULK` + `NotificationDeletedBulkEventData` + entrée dans
  `ServerToClientEvents` (`types/socketio-events.ts`), et le prédicat
  `notificationMatchesDeletedBulkScope` dans `utils/notification-read-bulk.ts` — **même module que
  son jumeau, parce que c'est la même famille** (le fiche le proposait ; l'alternative « un voisin »
  aurait scindé une famille de deux membres).
- **gateway** — `announceDeletedBulk()`, appelé par `deleteAllRead` quand `count > 0`, en PLAIN
  `io.to(ROOMS.user(userId))` (jamais `emitWithSeq` — lockstep gwcontract-01). `emitCountsUpdate`
  est CONSERVÉ : `total` reste juste, même si sa variation n'est affichée nulle part.
- **web** — `onNotificationDeletedBulk` sur le singleton + handler dans
  `use-notifications-manager-rq` qui filtre les pages React Query par le prédicat, **sans toucher
  au badge**.

### Ce qui change de nature par rapport au cycle 116

L'abstention sur le badge n'est plus la même chose. Au cycle 116 c'était une **précaution** — un
cache paginé matche moins de lignes que le serveur n'en a marquées, décrémenter d'après le prédicat
ferait dériver. Ici c'est une **conséquence** du prédicat lui-même : toute ligne retirée était lue,
donc n'a jamais été comptée dans `unread`. Le même geste, avec une justification strictement plus
forte — et c'est cette différence qui est écrite dans les commentaires, pas la ressemblance.

### Ce qui a été REFUSÉ, et pourquoi c'est le cœur de la fiche

Égrener un `notification:deleted` par ligne aurait fermé l'écart **et** la divergence transitoire
(une ligne lue localement dont le `PATCH` a échoué). Refusé : la purge n'est pas bornée — un compte
ancien a des milliers de lignes lues — et cela demanderait d'énumérer les ids AVANT le `deleteMany`.
Le chemin de purge paierait alors un coût proportionnel à l'historique pour fermer un écart
transitoire, récupérable, et **déjà accepté aujourd'hui sur l'appareil acteur** par l'optimiste de
`useDeleteAllReadNotificationsMutation`. Un test gateway fige ce refus (`count: 1200` ⇒ zéro
`notification:deleted`) : c'est le genre de décision qu'une optimisation future annulerait sans le
savoir.

## TDD

11 tests vus ROUGES avant toute ligne de production : 4 sur le prédicat partagé, 4 gateway
(annonce, silence à `count === 0`, non-égrènement, survie sans socket), 6 web (4 sur le hook —
retrait des lues, préservation des non lues, badge intact, `kind` inconnu inerte — et 2 sur le
singleton).

## Gates

| Gate | Résultat |
|---|---|
| shared `bun run build` | OK |
| shared vitest (complet) | 54 fichiers / **1 542 tests** verts |
| gateway `tsc --noEmit` | propre |
| gateway jest `[Nn]otification` | 47 suites / **983 tests** verts |
| web jest (`hooks/queries` + singleton notif) | 18 suites / **550 tests** verts |
| web `tsc --noEmit` | **1 229 erreurs — baseline identique** avant/après |

## Reste ouvert après ce cycle

- **Volet iOS de `gwcontract-13`** — miroir Swift du prédicat + décodage. **Même chantier que le
  volet iOS de `gwcontract-05`** : les deux événements sont jumeaux, les livrer séparément ferait
  écrire deux fois le même câblage dans `MessageSocketManager`/`NotificationToastManager`. Non
  livrable depuis un runner Linux.
- **`apps/web/utils/socket-validator.ts` est du code mort** (constat du cycle 116, reconduit) :
  zéro appelant hors de son propre test. Il n'a, là encore, délibérément PAS été étendu au nouvel
  événement. À retirer ou à brancher — décision à instruire, et deux cycles de suite qu'elle se
  repose : c'est le signal qu'elle mérite un cycle à elle.
- Hérités : `gwcontract-14` (copie inline du plancher d'historique dans `messages.ts`), `net-02`
  (P1, iOS), `sync-01` (aucun client n'appelle encore `/sync`), arbitrage produit `delete-for-me`
  au niveau message (cycle 114, constat 2).
