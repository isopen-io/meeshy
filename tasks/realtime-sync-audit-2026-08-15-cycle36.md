# Realtime sync audit — 2026-08-15, cycle 36

Passe de continuous-improvement enchaînée sur le cycle 35 (`fix(gateway/posts):
le repost dupliquait les octets sans ce qui décrit ses pixels`, PR #3044, mergée).
Environnement Linux : gateway + `packages/shared` testables, **pas de toolchain
Swift** — aucune modification SDK/iOS livrée ce cycle.

**Conclusion : un défaut réel trouvé, corrigé, testé. Trois axes balayés à blanc,
documentés ci-dessous pour qu'un prochain cycle ne les ré-instruise pas. Un
constat latent relevé et volontairement NON livré, avec sa raison.**

## Méthode

Le cycle 35 s'est terminé sur une consigne explicite : « un défaut qu'on vient de
corriger dans une famille est une requête à lancer dans toutes les autres, et la
recherche coûte une minute ». Ce cycle a commencé par l'exécuter, puis a élargi
quand l'axe est sorti vert.

### Axes balayés — RIEN à corriger (ne pas refaire)

1. **Les autres copies de lignes « décrivant des octets ».** La requête du cycle
   35 lancée sur toutes les familles. Deux copies seulement existent
   (`copyForwardedAttachments` → `MessageAttachment`, corrigée au cycle 34 ;
   `repostPost` → `PostMedia`, corrigée au cycle 35) et **les deux sont
   complètes**. Vérifié en plus, contre la tentation de « compléter » :
   `PostMedia.codec` et `PostMedia.thumbnailPath` n'ont **aucun lecteur** dans la
   gateway — les recopier serait du bruit, pas une correction. `detachReposts`
   ne copie rien (il coupe deux pointeurs, séparément et à raison).
   `SoundCaptureService` n'est pas une copie mais une CRÉATION : il écrit des
   faits neufs sur des octets neufs (hash, waveform, `sourceLanguage`), rien
   n'est amputé.
2. **`void p` sans `p.catch(...)` dans la couche temps réel** (le piège que
   `services/gateway/CLAUDE.md` documente en tête de ses « Critical Gotchas », un
   rejet non traité terminant le process sous Node 22). Les 26 sites `void`
   audités un par un, y compris les deux formes les plus dangereuses — celles
   placées dans un callback `setTimeout`, qui n'ont AUCUN try/catch englobant
   (`CallEventsHandler.onDisconnectGraceExpired`, `CallService.persistHeartbeatToDb`).
   Toutes les callees concernées enveloppent leur corps ENTIER dans un try/catch,
   et les sites multi-lignes portent bien leur `.catch`. **Zéro rejet atteignable.**
3. **L'asymétrie des contrôles d'appartenance de `conversation:join`.** La
   branche anonyme ne filtre que `isActive: true` là où la branche inscrite teste
   en plus `bannedAt` et `leftAt` avec des motifs de refus distincts. Remonté à la
   source : tous les écrivains de `leftAt` (`leave.ts`, `anonymous.ts`,
   `participants.ts`) écrivent `isActive: false` dans la MÊME écriture, et
   `resolveBanWrite` fait de même. `leftAt != null && isActive === true` n'est donc
   pas un état atteignable — la branche anonyme est **équivalente en sûreté**, au
   libellé du refus près. Rien à corriger.

## Défaut corrigé — le message d'un invité de lien n'accusait jamais réception au rejeu

`MeeshySocketIOManager._emitDeliveryForDrainedMessages`

Le drain rejoue à un revenant tout ce qu'il a manqué, puis marque les vrais
messages `received` pour que la coche de leur AUTEUR passe de « envoyé » à
« remis ». Son filtre d'entrée :

```ts
pending.filter((entry) => (entry.eventType ?? 'new') === 'new')
```

sous un commentaire qui énonçait la bonne règle (« seuls les VRAIS nouveaux
messages ») et une justification qui ne nommait que `edited`/`deleted`. Entre
l'intention et l'égalité littérale s'est glissée `link-message`.

Or `link-message` **est une arrivée** : `linkMessageEmissions` la rejoue sous
`message:new` autant que sous `link:message:new`, précisément parce que iOS et
Android n'écoutent que le premier. Le destinataire reçoit bel et bien un message ;
le filtre le lisait comme une mutation.

Les deux moitiés de la même garantie, servies inégalement :

| destinataire au moment de l'envoi | qui marque `received` | coche de l'auteur |
|---|---|---|
| connecté | `autoDeliverToOnlineRecipients` (audience 4 de `broadcastLinkMessage`) | avance |
| absent, revenu depuis | *personne* | **figée sur « envoyé »** |

Ce que ça coûtait :

- l'auteur restait sur un tic unique jusqu'à ce que quelqu'un OUVRE la
  conversation — c'est-à-dire exactement l'attente que cette fonction existe pour
  supprimer (« matching WhatsApp / iMessage behaviour instead of waiting for the
  user to open the conversation ») ;
- l'envoi par lien étant le **seul** transport d'envoi d'un participant anonyme,
  la moitié en défaut était celle de l'utilisateur sans autre recours ;
- aucune ligne `received` n'était écrite non plus : la conversation dont tout
  l'arriéré était en `link-message` n'entrait même pas dans la requête
  participants, donc `markMessagesAsReceived` n'était jamais appelé et le curseur
  de remise n'avançait pas en base.

**La justification écrite était fausse dès son commit.** Le type déclarait
« it carries no delivery receipt — the share-link send path creates no
read-status rows ». Le MÊME commit (PR #2981) branchait
`autoDeliverToOnlineRecipients` sur ce chemin, dont le cœur est
`markMessagesAsReceived`. Vérifié par `git log -S` sur les trois faits : même
commit.

**Le correctif jumeau existait déjà, un cran plus bas.** Le fan-out adresse les
lignes sans compte par `Participant.id` « parce que le pair sans compte est
peut-être l'AUTEUR qui attend son tic » — un test dédié le couvre. Cet effort
était annulé en amont par un filtre que l'entrée n'atteignait jamais.

**Livré** : `services/gateway/src/socketio/queuedMessageArrival.ts` —
`announcesMessageArrival(eventType)`, prédicat NOMMÉ vivant en face du
vocabulaire qu'il interroge, qui ÉNUMÈRE au lieu de tester une égalité. Le filtre
et le regroupement par conversation le consomment tous les deux.

**Tests** : 4 nouveaux cas dans `MeeshySocketIOManager.test.ts` (l'arrivée par
lien accuse réception ; le curseur avance jusqu'à un message de lien plus récent
qu'une entrée nominale ; les huit familles de mutation restent muettes) +
`queuedMessageArrival.test.ts`. Ce dernier tient sa garde par un
`Record<NonNullable<QueuedMessagePayload['eventType']>, boolean>` **complet** :
ajouter une famille à l'union sans lui donner sa réponse **ne compile pas**. Un
simple compte d'entrées n'aurait rien gardé — il se met à jour tout seul sous les
doigts de celui qui ajoute la famille, et c'est par ce silence-là que
`link-message` a été classée en mutation.

RED prouvée avant correctif (2 échecs, exactement les deux attendus) ; le témoin
anti-sur-correction passait déjà, comme il doit.

**Validation** : 724/724 suites, 17 717/17 717 tests, `tsc --noEmit` propre.

## Constat latent — relevé, NON livré

**Un destinataire ANONYME ne reçoit aucun accusé de remise au drain, quelle que
soit la famille.** `_drainPendingMessages` fait `if (isAnonymous) return;` avant
d'appeler l'accusé, et `_emitDeliveryForDrainedMessages` résout sa propre ligne
par `row.userId === userId` — faux pour une clé de file qui est un
`Participant.id`. La correction est connue (même idiome que
`_dropEndedMemberships` pour la requête, et que `autoDeliverToOnlineRecipients`
pour les préférences : `{ id, isAnonymous: !r.userId }`, servi par les défauts,
`showReadReceipts: true`).

**Non livré** : c'est un gap DISTINCT et plus large — il ne concerne pas la
famille `link-message` mais tous les types d'entrée, et il touche la FORME du
payload émis (`drainPayload.userId` n'aurait plus de `User.id` à porter, là où
`autoDeliverToOnlineRecipients` envoie `firstAcker.userId` possiblement nul).
Décider de cette forme sans pouvoir exercer les décodeurs iOS/Android depuis cet
environnement mélangerait un correctif prouvé avec un pari. À traiter par un
cycle dédié — le correctif de ce cycle vaut déjà pleinement pour la topologie la
plus courante (propriétaire inscrit d'une conversation partagée par lien, absent
pendant qu'un invité écrit).

## Points de conception confirmés (ne pas « corriger »)

- **Les huit familles de MUTATION n'accusent jamais réception, et c'est juste** :
  leur accuser réception affirmerait une remise qui n'a pas eu lieu — et pour
  `deleted`, la remise d'un message qui n'existe plus. Le témoin qui l'exige est
  écrit, il ne se déduit pas du prédicat.
- `eslint src/` échoue toujours dans ce dépôt sur une erreur de FORMAT de
  configuration (eslintrc vs flat config eslint 9), avant lecture du moindre
  fichier — indépendante de tout diff. Pré-existante, déjà notée au cycle 23.
- `bun install` échoue sur le postinstall de `grpc-tools` (binaire précompilé
  inaccessible derrière le proxy). `bun install --ignore-scripts` suffit : le
  binaire n'est utilisé par aucune suite de tests.
