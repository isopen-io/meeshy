# Cycle 95 — `GET /sync` entre sous contrat, et les trois défauts que l'enveloppe inerte couvrait

Date : 2026-08-22 · Branche : `claude/keen-hamilton-xatt72`

## 1. D'où part ce cycle

Du §9 du cycle 94 bis, qui nommait sa suite et en fixait l'ORDRE :

> **`GET /sync` sert la même CARTE brute, et n'a aucun schéma de réponse.**
> Zéro appelant sur les trois clients aujourd'hui : piège armé, pas panne. Le
> lot est « donner un contrat à `/sync` », pas « recopier un transform » — et
> c'est cet ordre-là qui compte, puisque c'est le contrat qui rend la forme
> fausse observable.

L'ordre s'est vérifié : le transform seul aurait corrigé UN défaut sur trois.
Ce sont le schéma et sa mesure qui ont fait apparaître les deux autres, dont le
plus large ne concerne pas `/sync`.

## 2. Constat d'entrée, relevé et non hérité

`GET /sync` ne portait **aucun** `schema.response`. Rien n'y était gouverné,
donc aucune forme n'y était fausse : il n'y avait pas de contrat à contredire.

Zéro appelant client, vérifié sur les trois : `ConversationSyncEngine`
(`packages/MeeshySDK/…/Sync/ConversationSyncEngine.swift`) fait son delta par
`GET /conversations?updatedSince=`, pas par cette route. C'est précisément la
fenêtre où corriger la forme ne casse personne.

## 3. Ce que le contrat a rendu observable

### 3.1 `translations` sortait en CARTE Mongo — le jumeau du cycle 94 bis

`Message.translations` est une colonne `Json?` : une carte `langue → {text, …}`.
Les trois clients décodent un TABLEAU. `syncMessageSelect` faisait
`translations: true`, et le gestionnaire étalait la ligne telle quelle.

C'est mot pour mot le défaut que le cycle 94 bis a corrigé sur
`GET /messages/:messageId`, et il vivait ici pour la même raison. La gravité est
la même aussi : `APIMessage.translations` se décode côté iOS avec un `try` NON
tolérant — une carte y fait échouer le décodage du message **entier**, pas
seulement de ses traductions.

Corrigé par `transformTranslationsToArray`, le sérialiseur du dépôt pour ce
passage — celui qu'appliquent déjà la liste, la recherche, l'édition, la
suppression et le chemin ZMQ.

### 3.2 Les pièces jointes partaient avec leur relation `reactions` BRUTE

`attachmentMediaSelect` charge `reactions: { select: { emoji, participantId } }`.
Le contrat de fil est `reactionSummary` + `currentUserReactions`, produits par
une agrégation serveur que `/sync` ne faisait pas.

Ce défaut ne se contentait pas d'être indécodable : **il publiait QUI a réagi**,
là où le contrat n'expose qu'un compte et les emojis du lecteur.

Corrigé par `serializeAttachmentForSocket`, qui miroite exactement ce select et
porte déjà l'agrégation. Son nom dit « socket » ; sa documentation dit la portée
réelle — « use this helper everywhere a Message attachment is broadcast to
clients so payloads stay at parity with the REST payload ».

`currentUserReactions` a demandé un champ de plus au `select` des appartenances
(`Participant.id`) : un utilisateur porte un `Participant.id` **différent par
conversation**, et `/sync` traverse toutes ses conversations d'un coup. Le champ
ne coûte pas un aller-retour — la ligne était déjà lue pour le plancher
d'historique.

### 3.3 Le défaut le plus large ne concerne pas `/sync`

En passant la charge au vrai `fast-json-stringify`, le témoin des pièces jointes
a servi `metadata: {}`.

`messageAttachmentSchema.metadata` était déclaré `{ type: 'object', nullable:
true }` — un objet **NU**. Le champ étant LISTÉ, le sérialiseur applique
`additionalProperties: false` et le vide : **l'omettre l'aurait mieux servi**.
Et ce schéma n'est pas propre à `/sync` — la LISTE de messages sert ses pièces
jointes par lui.

Le consommateur est réel et il est en production :

```tsx
// apps/web/components/conversations/conversation-item/message-formatting.tsx:103
const audioEffectsTimeline = (attachment as unknown).metadata?.audioEffectsTimeline;
```

Le rendu que cette lecture pilote est visible : `message-formatting.tsx` peint
une icône d'effet (🎤 👶 😈 🎶) à côté d'une note vocale selon les événements
`activate` de la timeline. **Ces icônes ne sont jamais apparues.**

Sa JUMELLE — `messageMinimalSchema.attachments[].metadata`, celle de l'APERÇU de
conversation et non celle du fil — portait le même objet nu, avec une
description qui NOMMAIT `audioEffectsTimeline` pendant qu'elle le supprimait.

Portée exacte, vérifiée plutôt que supposée : `messageSchema.attachments` est
`{ items: messageAttachmentSchema }`, donc la LISTE de messages sert bien ses
pièces jointes par le schéma fautif — la correction ne bénéficie pas qu'à
`/sync`.

Deux sites voisins de la même famille (`voiceQualityAnalysis`, `documentLayout`,
tous deux produits en `Record<string, unknown>`) portaient le même défaut. Ils
sont corrigés dans le même lot : ce sont des pièges armés, pas des pannes
prouvées — dit ici plutôt que laissé implicite.

## 4. Le cliquet qui manquait

Ce troisième défaut vivait dans un angle mort **documenté et jamais outillé**.
`services/gateway/CLAUDE.md` le dit depuis le cycle 87 bis :

> Le balayage ne lit que `services/gateway/src/routes` : les schémas de
> `packages/shared`, dont un défaut se propage le plus loin, lui échappent.

`routes/__tests__/shared-schema-sweep.test.ts` ferme l'angle mort. Il réemploie
le `stripComments` du frère plutôt que de le recopier, et diffère de lui sur un
seul point de mécanique : là-bas les schémas vivent sous une clé `response:`
qui borne le balayage ; ici ce sont des constantes exportées, donc le fichier
est balayé en entier.

`FROZEN_SHARED_NAKED` est **vide**, et c'est un état à défendre : quand le
cliquet tombe, l'entrée en trop est un site NEUF, à déclarer — jamais à geler
sans raison écrite.

C'est la leçon du cycle 87 bis appliquée à sa propre limite : le cycle 86 avait
construit le balayage des routes et l'avait laissé dans son JOURNAL ; deux
cycles plus tard, deux agents ont retrouvé les mêmes trois sites séparément, à
la main, le même jour. **Un outil vit dans le dépôt ou il n'existe pas.**

## 5. La mesure, et le ROUGE prouvé

Les clés servies ont été relevées **mécaniquement** depuis `syncMessageSelect`
et les surcharges du gestionnaire, puis passées au vrai sérialiseur via
`app.inject()`. Les témoins assertent sur les VALEURS servies — jamais sur
`statusCode`, qui était vert pendant toute la vie des trois défauts.

Cinq mutations, jouées isolément :

| mutation | effet |
|---|---|
| retrait de `transformTranslationsToArray` | **11 / 65 tombent** |
| retrait de `serializeAttachmentForSocket` | 2 / 65 tombent |
| retrait d'une clé du schéma (`messageSource`) | 1 / 65 tombe, en la NOMMANT |
| retrait d'`additionalProperties` sur `metadata` (shared) | 1 / 65 tombe |
| retrait d'`id: true` du select d'appartenance | **0 / 64 — VERT** |

La cinquième est le résultat le plus utile du lot. Le double Prisma rend sa
ligne d'appartenance quel que soit le `select` : `id` y était présent même une
fois la requête amputée, donc le témoin de VALEUR ne pouvait pas tomber. C'est
exactement la faute que `services/gateway/CLAUDE.md` interdit — un témoin qui ne
peut pas tomber n'est pas un témoin — et le dépôt portait déjà l'idiome qui la
répare, dans ce fichier même : **c'est la REQUÊTE qui porte le contrat.** Un
second témoin assert désormais que le select DEMANDE `id`, et la mutation tombe.

## 6. Ce qu'il a fallu réparer dans les témoins existants, et pourquoi

**Une rangée de témoin doit rendre ce que la REQUÊTE rend.** Les rangées de
cette suite omettaient `attachments` — une relation sélectionnée revient en
tableau VIDE, jamais en `undefined` — parce que rien ne les lisait tant que la
charge traversait non gouvernée. Le sérialiseur, lui, les lit.

**Un témoin assertait la CARTE Mongo telle quelle.** Il codifiait la forme de la
BASE, écrit à un moment où toute forme était « juste » faute de contrat. Il
assert désormais le tableau.

**Et une charge de témoin inventée se découvre en 500, pas en assertion.** La
première version de la rangée portait une traduction de pièce jointe
`{ url, segments }`, inventée. `messageAttachmentSchema` déclare `type`,
`transcription` et `createdAt` **`required`** : fast-json-stringify a refusé de
sérialiser, et la route a rendu 500 avec `"type" is required!`. Le schéma
partagé faisait son travail ; c'est la fiction qui a cédé.

## 6 bis. Une propriété du contrat, dite plutôt que découverte plus tard

`messageAttachmentSchema` déclare `type`, `transcription` et `createdAt`
**`required`** sur chaque entrée de la carte `translations`. Une entrée stockée
qui en manquerait une fait échouer la sérialisation, donc rend 500 — pour la
PAGE entière, sur un chemin de rattrapage.

Ce n'est pas une exposition NEUVE : `messageSchema.attachments` est
`{ items: messageAttachmentSchema }`, donc `GET /conversations/:id/messages`
porte exactement la même contrainte depuis toujours. Réemployer le schéma
canonique fait hériter `/sync` de la propriété de son aîné, ce qui est le
comportement voulu — mais c'est une propriété, pas un détail, et elle se dit.

## 7. Ce que ce cycle laisse ouvert

- **`GET /sync` n'agrège pas les réactions de MESSAGE**, seulement celles des
  pièces jointes. Il sert `reactionSummary` + `reactionCount` (deux colonnes
  dénormalisées, donc justes) mais pas `currentUserReactions` au niveau du
  message, que la liste de messages construit par une requête dédiée
  (`userReactionsMap`). Un client rattrapé hors ligne ne saurait donc pas
  quelles réactions sont les siennes sur la bulle elle-même. Le lot est une
  requête d'agrégation de plus sur le chemin de rattrapage — à instruire contre
  son coût, pas à avaler en passant.
- **`APIMessage.translations` se décode avec un `try` non tolérant** quand ses
  trois voisins immédiats sont en `try?` avec la raison écrite. Les DEUX routes
  qui servaient une carte sont désormais corrigées, donc le piège est désamorcé
  côté serveur — mais un seul émetteur qui se trompe de forme continuerait de
  faire perdre le message ENTIER. C'est un lot iOS, reporté du cycle 94 bis et
  toujours ouvert.
- **`GET /messages/:messageId` n'agrège pas les réactions de pièce jointe.**
  Reporté du cycle 94 bis, non traité ici. Le sérialiseur employé par ce lot
  (`serializeAttachmentForSocket`) est exactement ce qui le fermerait.
- **La quatrième famille n'est toujours pas outillée.** Quatre balayages sont
  maintenant à inventaire vide (`response-schema-sweep`,
  `response-payload-mismatch`, `error-schema-sweep`, et le
  `shared-schema-sweep` de ce cycle). Aucun ne voit une déclaration **présente,
  bien formée, et fausse contre son producteur**. Un cliquet qui apparierait
  chaque `select:` avec le schéma de la réponse qu'il alimente couvrirait la
  famille.

## 8. La leçon

> **Un angle mort DOCUMENTÉ reste un angle mort.** La limite du balayage — « il
> ne lit pas `packages/shared` » — était écrite noir sur blanc dans le CLAUDE.md
> du service, dans la section même qui explique le défaut. Elle y a survécu à
> huit cycles pendant qu'un schéma partagé vidait `metadata` sur toutes les
> routes qui l'importent. Écrire une limite ne la garde pas ; seul un cliquet la
> garde.

Et le corollaire, qui est la vraie mesure de ce lot :

> **Gouverner une route en révèle plus que ce qu'elle contient.** Des trois
> défauts trouvés, le plus large ne concernait pas `/sync` : il vivait dans un
> schéma partagé, sur une route qui, elle, marchait — et il n'est apparu que
> parce qu'une charge utile est passée au vrai sérialiseur. Le contrat d'une
> route est un instrument de mesure braqué sur tout ce qu'elle importe.
