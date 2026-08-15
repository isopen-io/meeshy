# Audit synchro temps réel — cycle 37 (2026-08-15)

## Point de départ : le constat latent du cycle 36

Le cycle 36 a corrigé le filtre du drain (`link-message` classée en mutation) et
a relevé, SANS le livrer, un gap plus large :

> **Un destinataire ANONYME ne reçoit aucun accusé de remise au drain, quelle que
> soit la famille.** `_drainPendingMessages` fait `if (isAnonymous) return;`
> avant d'appeler l'accusé […] Décider de cette forme sans pouvoir exercer les
> décodeurs iOS/Android depuis cet environnement mélangerait un correctif prouvé
> avec un pari.

**Le pari n'existait pas, et se lisait en trois fichiers.** La forme du payload
était déjà tranchée, partout, avant ce cycle :

| Site | Ce qu'il dit déjà |
|---|---|
| `ReadStatusUpdatedEventData.userId` (`packages/shared/types/socketio-events.ts`) | `string \| null` — « `null` quand c'est un participant ANONYME […] le cas se produit sur l'accusé de livraison automatique d'une conversation ouverte par lien de partage, où les anonymes sont la population dominante » |
| `ReadStatusUpdateEvent.userId` (iOS, `MessageSocketManager.swift`) | `String?`, avec le doc-comment jumeau |
| `ReadStatusUpdatedEvent.userId` (Android, `SocketEvents.kt`) | `String? = null` |
| `MessageHandler.autoDeliverToOnlineRecipients` | émet DÉJÀ `firstAcker.userId`, possiblement nul, sur le même événement |

Le jumeau EN LIGNE de cette unité émettait donc déjà, en production, la forme
exacte que le cycle 36 croyait devoir inventer. *Une incertitude sur un contrat
se lève en lisant le contrat, pas en attendant de pouvoir exécuter ses
consommateurs.*

## Le défaut

`_drainPendingMessages` retournait avant l'accusé dès que la clé de file était un
`Participant.id` :

```ts
// Delivery receipts require a registered userId (participant lookup is
// keyed on Participant.userId, null for anonymous) — skip for anonymous.
if (isAnonymous) return;
```

La justification était vraie de la REQUÊTE d'alors — `_emitDeliveryForDrainedMessages`
résolvait sa propre ligne par `row.userId === userId`, qui ne matche AUCUNE ligne
pour un lecteur sans compte, donc la boucle sortait sur zéro conversation. Elle
n'a jamais été vraie du **droit de l'auteur à voir sa coche avancer**. Une
contrainte d'implémentation avait été écrite comme une règle produit, et le
`return` posé un cran plus haut la rendait indélogeable : il n'y avait plus rien
à corriger en aval, puisque plus rien n'y arrivait.

## Ce que ça coûtait, et pourquoi c'est asymétrique

L'envoi par lien partagé est le SEUL transport d'envoi d'un participant anonyme,
et dans une conversation ouverte par lien, **l'anonyme est la population
dominante**. Un auteur inscrit qui écrit à des invités de lien absents restait
donc sur un tic unique jusqu'à ce que l'un d'eux OUVRE la conversation —
exactement l'attente que `_emitDeliveryForDrainedMessages` existe pour supprimer
(« matching WhatsApp / iMessage behaviour instead of waiting for the user to open
the conversation »).

Le cycle 36 avait rétabli l'accusé pour la famille `link-message` ; le `return`
de ce cycle-ci l'annulait pour la moitié des LECTEURS. Les deux moitiés du même
scénario produit — l'invité de lien qui écrit, l'invité de lien qui reçoit —
étaient coupées au même endroit, à deux niveaux différents.

## Livré

`services/gateway/src/socketio/MeeshySocketIOManager.ts` :

1. **`_drainPendingMessages`** — le `return` anticipé disparaît ; `isAnonymous`
   voyage AVEC la clé jusqu'à l'accusé. Il n'est pas redécouvert en aval : c'est
   lui qui dit sous quelle colonne retrouver le lecteur.
2. **`_emitDeliveryForDrainedMessages(readerKey, pending, isAnonymous)`** —
   le premier paramètre est renommé `readerKey` : il porte la CLÉ DE FILE
   (`userId` inscrit / `Participant.id` invité de lien), la convention exacte
   qu'`enqueueForOfflineParticipants` applique en enfilant (`p.userId ?? p.id`)
   et que `_dropEndedMemberships` lit déjà sous les deux colonnes. *Le supposer
   utilisateur est précisément ce qui a fait sauter l'accusé.*
3. **Préférences** — `{ id: readerKey, isAnonymous }`, même idiome
   qu'`autoDeliverToOnlineRecipients`. Déclarer inscrit un lecteur sans compte
   enverrait un `Participant.id` à `fetchManyFromDatabase` comme s'il s'agissait
   d'un `User.id` : requête payée pour rien, résultat vide mis en cache sous un
   id qui n'est pas un utilisateur, et absence de `showReadReceipts` qui
   re-supprimerait l'accusé qu'on vient de rétablir. `getPreferencesForUsers`
   sert les anonymes par les défauts, sans base (`showReadReceipts: true`).
4. **Résolution de la ligne propre** — `isAnonymous ? row.id === readerKey :
   row.userId === readerKey`. Le branchement est STRICT dans les deux sens.
5. **Payload** — `participantId: own.id`, `userId: own.userId` (donc `null` pour
   un lecteur anonyme). Pour un inscrit, `own.userId` VAUT `readerKey` : c'est
   par lui que la ligne a été reconnue, la valeur émise ne change pas.

## Tests

RED prouvée avant correctif : **6 échecs, exactement les six attendus** (3 sur le
drain, 3 sur l'accusé). Le témoin anti-sur-correction passait déjà, comme il doit.

4 nouveaux témoins dans `MeeshySocketIOManager.test.ts` :

- l'accusé est bien APPELÉ pour une clé anonyme, avec la nature du lecteur ;
- la ligne propre d'un lecteur anonyme se résout par `Participant.id`
  (`markMessagesAsReceived` reçoit la bonne ligne — sans le branchement, la
  boucle sortait sur zéro conversation et personne n'apprenait rien) ;
- le payload porte `userId: null`, **jamais la clé de file** — y mettre
  `readerKey` remplirait le champ d'un `Participant.id` qu'un consommateur
  comparant à sa propre identité pour synchroniser son curseur lirait comme un
  `User.id`, la seule forme qui puisse mentir ;
- les préférences sont lues sous `{ id, isAnonymous: true }`.

**Anti-sur-correction** : un lecteur inscrit n'adopte JAMAIS la ligne d'un
participant sans compte dont l'`id` coïncide avec son `userId`. Un
`row.id === key || row.userId === key` — la forme « tolérante » qui vient
naturellement — passerait tous les autres témoins et accuserait réception au nom
d'un tiers.

Les 9 appels préexistants du bloc passent désormais `false` explicitement : un
troisième argument implicitement `undefined` documente mal la branche testée.

## Validation

- `bun run test` (gateway) : **724/724 suites, 17 721/17 721 tests** (+4)
- `bunx tsc --noEmit` : propre
- `packages/shared` : build propre

## Points de conception confirmés (ne pas « corriger »)

- **Les huit familles de MUTATION n'accusent toujours pas réception** — le
  prédicat `announcesMessageArrival` du cycle 36 est inchangé, et sa table
  exhaustive continue de refuser de compiler si une famille arrive sans réponse.
- **`_dropEndedMemberships` reste la gate d'autorisation en amont** : un accusé
  n'est jamais affirmé pour une entrée qu'on vient de refuser de livrer. Le
  témoin correspondant a suivi la signature.
- `eslint src/` échoue toujours sur une erreur de FORMAT de configuration
  (eslintrc vs flat config eslint 9), avant lecture du moindre fichier —
  indépendante de tout diff. Pré-existante, notée aux cycles 23 et 36.
- `bun install` échoue sur le postinstall de `grpc-tools` (binaire précompilé
  inaccessible derrière le proxy) ; `bun install --ignore-scripts` suffit.

## Piste pour le cycle suivant

Le lecteur anonyme accuse maintenant réception au drain. Reste à vérifier le
symétrique côté LECTURE (`type: 'read'`) : les deux routes REST de mark-as-read
et `broadcastReadStatusUpdate` résolvent-elles l'acteur sans compte par la même
convention `userId ?? id`, ou portent-elles le même `row.userId === userId`
qu'on vient de corriger ici ? Le champ `lastReadAt`/`unreadCount` étant scopé sur
`userId`, un acteur anonyme y pose une question de forme DISTINCTE (à qui
appartient un curseur de lecture sans ligne `User` ?) qui mérite son propre
cycle.
