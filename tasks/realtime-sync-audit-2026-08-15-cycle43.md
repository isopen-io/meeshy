# Cycle 43 — la piste du cycle 42 était fausse, et ce qu'on a trouvé en la vérifiant

## La piste héritée, et pourquoi elle ne tient pas

Le cycle 42 laissait ceci :

> Les deux émetteurs restants de `read-status:updated` — le drain hors ligne
> (`MeeshySocketIOManager`) et `MessageHandler.autoDeliverToOnlineRecipients` —
> **ne consultent pas `showReadReceipts`**.

**C'est faux, aux deux endroits.** Lecture dans le code :

| Émetteur | Consulte la préférence ? | Où |
|---|---|---|
| `_emitDeliveryForDrainedMessages` | oui | `getPreferencesForUsers([{ id: readerKey, isAnonymous }])`, puis `if (!prefMap.get(readerKey)?.showReadReceipts) return;` |
| `autoDeliverToOnlineRecipients` | oui | `getPreferencesForUsers(...)` puis filtre `allowedRecipients` |

La consigne du cycle 42 — « établir laquelle des deux avant d'écrire quoi que ce
soit » — a donc payé : elle a évité d'écrire un correctif pour un défaut qui
n'existait pas.

## Ce que la vérification a mis au jour à la place

Le vrai écart entre ces deux émetteurs et les portes REST n'est pas *si* la
préférence est consultée, mais **ce qu'elle commande** :

- **Portes REST** (`message-read-status.ts:326`, `:422`,
  `conversations/messages.ts:1349`) : `markMessagesAsReceived` est appelé
  **inconditionnellement**, et `broadcastReadStatus` ne tait que la DIFFUSION.
- **Émetteurs socket** : la préférence coupe le `markMessagesAsReceived`
  lui-même — donc l'ÉTAT persisté (curseur `lastDeliveredAt` + gel
  `MessageStatusEntry`), pas seulement sa divulgation.

C'est l'invariant du cycle 42 pris à l'envers (« la préférence décide de la
DIFFUSION, jamais de la LECTURE »). Conséquence : ré-activer ses accusés ne
révèle rien des messages livrés pendant la période d'opt-out — l'état n'a jamais
été écrit. Et l'intention n'est de toute façon **pas atteinte** aujourd'hui,
puisque les portes REST enregistrent : l'état dépend du transport.

**Non livré ici, délibérément.** Les témoins d'`autoDeliver` affirment la forme
actuelle explicitement (« no `markMessagesAsReceived`, no broadcast »). Retourner
une intention écrite noir sur blanc demande d'établir d'abord si un `received`
automatique relève de ce réglage — la question même que le cycle 42 posait, et
qui reste ouverte. Voir la piste en fin de document.

## Le défaut effectivement corrigé

En balayant les surfaces qui exposent des accusés, trois `select` chargent
`statusEntries` — des accusés **nominatifs** — sans consulter `showReadReceipts`,
là où les **cinq** lecteurs de `MessageReadStatusService` le font tous
(`getMessageReadStatus`, `getConversationReadStatuses`, `getMessageStatusDetails`,
`getLatestMessageSummary`, plus le filtre public `filterReadReceiptVisible`).

Hypothèse de départ : fuite nominative. **Vérifiée avant d'écrire : il n'y a pas
de fuite**, et la raison est plus instructive que l'hypothèse.

### Pourquoi il n'y a pas de fuite

`messageSchema` ne déclare `statusEntries` **ni** dans
`routes/conversations/types.ts` **ni** dans `routes/links/types.ts`.
`fast-json-stringify` retire tout champ non déclaré. Le tableau était donc
construit, parfois recopié par un formateur, puis **jeté à la sérialisation**.

Le commentaire du schéma de cette même route le disait déjà, à propos d'un autre
champ : « fast-json-stringify strips undeclared fields, which silently killed
client infinite scroll ».

### Ce qu'il en coûtait

| Site | Opt-in ? | Recopié en aval ? | Servi ? |
|---|---|---|---|
| `conversations/messages.ts` (`include_status=true`) | oui | oui | **non** — retiré par le schéma |
| `links/.../getConversationMessages` | **non** | non (le formateur unifié l'ignore) | **non** — mort avant la sérialisation |
| `links/.../getConversationMessagesWithDetails` | **non** | oui (`formatMessageWithSeparateSenders`) | **non** — retiré par le schéma |

Une requête de relation supplémentaire par page, ramenant jusqu'à
`messages × participants` documents `MessageStatusEntry`, sur le chemin de
lecture le plus chaud du produit. **Deux des trois sites la payaient sans même
d'opt-in.**

Aucun client du dépôt ne demande `include_status` (balayage web / iOS / Android /
SDK). Le champ était pourtant promis jusque dans `@meeshy/shared`
(« retourné uniquement si `include_status=true` ») — une promesse que le contrat
n'a jamais pu tenir.

## Le piège, qui survit au correctif

Déclarer `statusEntries` au schéma pour « réparer » le champ manquant
publierait d'un coup des accusés nominatifs — identité, horodatage, **durée de
lecture**, **appareil** — sans le gate d'opt-out. La fuite hypothétique
deviendrait réelle par un ajout d'apparence anodine.

D'où le choix de ne pas seulement supprimer les `select`, mais de laisser la
raison écrite aux trois endroits où quelqu'un aurait l'idée de les rétablir, avec
le renvoi vers la voie gatée : `GET /conversations/:id/statuses`.

## Correctifs

- [x] Les trois `select` `statusEntries` supprimés, plus le mapping
      `mappedMessage.statusEntries` et la recopie du formateur de lien
- [x] `include_status` reste **accepté** — aucun client envoyant le paramètre
      n'est rejeté — avec sa description corrigée et le renvoi vers la voie gatée
- [x] Variables `includeStatus` / `includeStatusStr` retirées (plus de lecteur)
- [x] Doc `@meeshy/shared` corrigée : elle promettait un champ qu'aucun point de
      service ne rend

## Deux témoins qui affirmaient l'inverse

`messages-routes.test.ts` monte un **faux Fastify sans sérialiseur** : il voyait
donc `statusEntries` dans la réponse, un champ que la production retire depuis
toujours. Ses deux témoins encodaient la dépense comme un acquis
(« includeStatus=true adds statusEntries to select », « statusEntries field
mapped when present »).

C'est le **troisième cycle consécutif** où un double décrit un autre programme
que celui qu'on livre (cycles 41, 42, 43).

Les deux témoins sont retournés, et une garde montée sur un **vrai** Fastify —
`message-status-entries-contract.test.ts` — verrouille les deux moitiés
séparément :

1. le champ n'est pas **servi**, même quand la ligne en porte et qu'on le demande ;
2. il n'est pas non plus **chargé** — la dépense suit le contrat, pas l'inverse ;
3. `include_status` reste accepté ;
4. les compteurs agrégés, eux gatés, continuent d'être servis.

Le témoin (1) est **vert avant comme après** : c'est lui qui établit la prémisse
du cycle — le sérialiseur retirait déjà tout.

## Gates

- [x] 4 RED discriminants vus rouges avant correctif
- [x] `bunx tsc --noEmit` gateway : 0
- [x] Suite gateway complète : **727 suites, 17 776 tests, tout vert**
      (cycle 42 : 726 / 17 771 — +1 suite, +5 tests)
- [x] CHANGELOG + doc `@meeshy/shared` + journal + leçon 278

## Écarté délibérément

**Retirer `include_status` du schéma.** Le paramètre est documenté et
public. Un dépôt prouve l'absence d'appelant DANS LE DÉPÔT — même raisonnement
qu'au cycle 42 pour `POST /messages/:id/status`. Le garder accepté ne coûte
plus rien maintenant qu'il ne déclenche aucun chargement.

**Retirer `statusEntries` du type `GatewayMessage` partagé.** Aucun consommateur
dans le dépôt, mais c'est une surface de type publique ré-exportée par
`conversation.ts`. Le commentaire est corrigé ; le retrait mérite sa propre
dépréciation.

**Servir le champ pour de bon, gaté.** Ce serait ajouter une seconde voie
nominative à côté de `GET /conversations/:id/statuses`, qui existe, qui est
gatée, et que le web consomme déjà. Deux voies pour une donnée sensible, c'est
la configuration qui a produit les cycles 38 à 42.

## Piste PRIORITAIRE pour le cycle 44 — mesurée, NON livrée

**Le même mécanisme, beaucoup plus large, sur `GET /links/:identifier/messages`.**
Le `messageSchema` de `routes/links/types.ts` ne déclare que **sept** propriétés.
Mesuré en montant le schéma réel sur un vrai Fastify :

```
SURVIVING KEYS: ["id","content","originalLanguage","messageType","createdAt","sender","translations"]
```

Sont donc retirés du fil, alors que `formatMessageWithSeparateSenders` les
produit : `anonymousSender`, `attachments`, `reactions`, `replyTo`, `replyToId`,
`isEdited`, `editedAt`, `deletedAt`, `updatedAt`.

Deux conséquences, et la première n'est pas une dépense mais un **défaut
fonctionnel** :

1. Une conversation ouverte par lien partagé ne peut afficher **ni pièce jointe,
   ni réaction, ni réponse citée**, et un message d'invité arrive **sans
   identité** (`sender` vaut `null` pour un anonyme, et c'est `anonymousSender`
   qui portait le nom — retiré). À vérifier côté client avant de conclure : le
   web a peut-être un autre chemin pour ces vues.
2. `getConversationMessagesWithDetails` **charge** tout cela — `attachments`,
   `reactions`, et `replyTo` avec son sender, ses attachments et ses réactions
   imbriqués — à chaque page, pour rien. La dépense corrigée dans ce cycle
   (`statusEntries`) est la plus petite des quatre.

Ordre de travail suggéré : établir d'abord ce que le client attend réellement de
ce point de service (il est possible que le schéma ait raison et que le
formateur/les `include` soient en trop), puis trancher champ par champ —
compléter le schéma là où le client en a besoin, retirer les `include` partout
ailleurs. Ne pas déclarer en bloc : `attachments` et `anonymousSender` sont des
surfaces de données, et le cycle 43 vient de montrer qu'un champ déclaré sans
examiner ce qu'il publie est exactement le piège.

## Piste secondaire — repérée, NON livrée

**La préférence coupe l'ÉCRITURE sur les deux émetteurs socket de `received`**
(voir § 2 ci-dessus). Trois choses à établir avant d'écrire :

1. `showReadReceipts` est-elle censée gouverner les `received` (accusés de
   **livraison**) ou seulement les `read` ? WhatsApp et Signal ne laissent pas
   désactiver la livraison. La documentation du dépôt ne tranche nulle part.
2. Si oui : l'état doit-il quand même être enregistré, la préférence ne taisant
   que la diffusion — ce que font déjà les trois portes REST, et ce que
   l'invariant du cycle 42 impose ?
3. Le cas échéant, `autoDeliverToOnlineRecipients` doit marquer TOUS les
   destinataires en ligne mais ne nommer comme `firstAcker` qu'un destinataire
   non opt-out, et sauter l'émission si aucun ne reste — le fan-out étant
   consolidé et nommant une seule personne.

Noter que le gate d'écriture ne protège **rien** que les lecteurs ne protègent
déjà : les cinq filtrent les opt-out à la lecture, `getLatestMessageSummary` les
retirant même du dénominateur. Enregistrer ne divulguerait donc pas.
