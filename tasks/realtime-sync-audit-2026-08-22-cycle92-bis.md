# Cycle 92 bis — la présence est gardée sur ce qui LISTE un participant, sur rien qui en MUTE un

**Branche** : `claude/keen-hamilton-jarxb5`
**Nom** : le numéro 92 était déjà pris par une session concurrente (schéma partagé /
expéditeur, `messages-advanced.ts`) — même convention qu'au cycle 91 bis.
**Point de départ** : le lot laissé ouvert par le cycle 91 bis (§6) — `POST /conversations/:id/invite`,
« déclarer `member` + poser le gate, ensemble ».

## 1. Ce que le site ouvert a révélé en l'ouvrant

Le cycle 91 bis avait raison sur le site et trop étroit sur la famille. En allant
poser le gate sur l'invitation, le voisinage a montré la vraie règle :

| route | ce qu'elle envoie sous `conversationParticipantSchema` | présence gardée ? |
|---|---|---|
| `GET /conversations` | projection construite | **oui** (`resolvePrefsOnly`) |
| `GET /conversations/:id` | rangs bruts + `gatedParticipants` | **oui** |
| `GET /conversations/:id/participants` | projection construite | **oui** |
| `POST /conversations/:id/invite` | **rang Prisma BRUT** sous la clé `member` | non |
| `PATCH …/participants/:userId/role` | **rang Prisma BRUT** sous la clé `participant` | **non** |

> **La présence est gardée sur les trois surfaces qui LISTENT un participant,
> et sur aucune des deux qui en MUTENT un.**

## 2. Pourquoi une seule des deux fuit

Les deux passent un rang Prisma brut au même schéma. Seul le NOM de la clé les sépare :

- `invite` déclare `membership`, envoie `member` ⇒ tout est supprimé, **la fuite
  n'a jamais eu lieu** — par accident de nommage, pas par décision ;
- `PATCH …/role` déclare `participant` et envoie `participant` ⇒ le rang passe,
  et `Participant.isOnline` / `Participant.lastActiveAt` sont **déclarés** par
  `conversationParticipantSchema` : ils sortent **non gardés**.

C'est le cycle 91 bis d'un cran plus loin. Sa leçon : un schéma bien formé peut
être entièrement faux. Sa suite : **un schéma qui « marche » peut cacher une
fuite au lieu de l'empêcher** — ici le sérialiseur ne protège que le site dont
la clé est cassée.

## 3. Ce que le rang brut emporte d'autre

Sur `PATCH …/role`, `updatedParticipant` est lu en `include` (donc TOUS les
scalaires) et rediffusé **tel quel** sur `PARTICIPANT_ROLE_UPDATED` à toute la
salle — un chemin **sans** sérialiseur. Passent alors `bannedAt`, `leftAt`,
`deletedForMe`, `nickname`, `shareLinkId`.

Vérifié, et NON retenu comme fuite de secret : la cible est cherchée par
`userId`, donc toujours un inscrit — `sessionTokenHash` et `anonymousSession`
y sont nuls. La mise en garde `conversationDetailInclude` (Iter 35 F8) ne se
rejoue pas ici.

Et la charge utile REST est en plus **mal formée** : pas de `participantId`, pas
de `username`/`firstName`/`lastName` (pourtant chargés), et `role` porte le rang
DE CONVERSATION (`member`) là où le schéma déclare le rôle GLOBAL
(`USER|ADMIN|…`), pendant que `conversationRole` reste absent.

## 4. La cause commune

**Aucun sérialiseur de participant n'existe.** La forme de fil est réécrite à la
main à chaque site ; les trois sites qui l'écrivent gardent la présence, les deux
qui passent le rang brut ne la gardent pas. La garde n'est pas oubliée : elle est
inatteignable, parce qu'il n'y a pas d'endroit unique où la poser.

## 5. Le lot

- [x] `serializeConversationParticipant` — pur, dans `packages/shared/utils/participant-helpers.ts`,
      à côté du schéma qu'il honore ; prend la visibilité de présence en paramètre.
- [x] `GET …/participants` : sa projection en ligne DEVIENT l'appel (référence, comportement conservé).
- [x] `PATCH …/role` : sérialise + garde la présence (REST **et** diffusion Socket.IO).
- [x] `POST …/invite` : sérialise + garde ; clé alignée sur celle de ses deux voisins.
- [x] `POST …/participants` : `participant` déclaré SANS producteur — retiré (précédent 91 bis §5).
- [x] Témoins : vrai Fastify, assertions de VALEUR, rouges prouvés avant correctif.


## 6. Ce que la vérification des clients a trouvé — un second défaut, vivant

Avant de changer la forme d'un événement diffusé, il faut savoir qui le lit. Le
relevé des consommateurs de `participant:role-updated` a rendu trois réponses,
dont deux n'étaient pas la question posée.

**Web — sûr.** Ses trois sites ne lisent que `conversationId`, `userId`,
`newRole`. Aucun ne descend dans `participant`.

**Swift — sûr sur la taxonomie, cassable sur le vide.** `participant.role` est
déclaré et jamais lu (iOS applique `newRole`, au premier niveau) : la bascule
`role` → `conversationRole` ne coûte rien. Mais le bloc `participant` était
**NON-optionnel**, quand la passerelle envoie `null` si la relecture du rang ne
rend rien — et que le type PARTAGÉ le déclare `participant?`. Le décodeur du
manager journalise et JETTE l'événement entier sur la moindre erreur : un `null`
supprimait donc le rafraîchissement du trombinoscope, sans trace. Rendu optionnel,
avec ses deux témoins (`null` et clé absente).

**Android — MORT depuis toujours.** `ParticipantRoleUpdatedEvent` exigeait un
`role` de premier niveau **que la passerelle n'a jamais émis** : elle envoie
`newRole`. Le champ étant non-optionnel et sans défaut, `decodeFromString` levait
`MissingFieldException` à CHAQUE événement (`coerceInputValues` ne secourt un
non-nullable que s'il a un défaut ; `ignoreUnknownKeys` ne fabrique pas une clé
absente). L'exception est avalée par le `runCatching` du listener :

> **Aucun changement de rang n'a jamais atteint le trombinoscope Android.**

Corrigé par `@SerialName("newRole")`.

### Pourquoi personne ne l'avait vu, et c'est la leçon

Le seul témoin du chemin, `ConversationMembersViewModelTest`, CONSTRUIT
l'événement en Kotlin et l'ÉMET directement dans le flow. Il saute le décodeur —
la seule couche où vivait le défaut.

> **Un témoin qui n'exerce pas la sérialisation atteste un contrat que personne
> ne respecte.** C'est mot pour mot la leçon du cycle 91 bis (« mocker les schémas
> partagés DÉSARME fast-json-stringify »), dans un autre langage et dans l'autre
> sens : là le serveur ne servait rien, ici le client ne décode rien. La forme du
> témoin est la même — il n'a jamais traversé la couche qui casse.

Et le commentaire du site d'émission le disait sans le savoir : « les seuls
consommateurs sont les écrans de participants (web, iOS) ». Android en a un. Il
n'était pas compté parce qu'il n'a jamais marché.

## 7. Ce que ce cycle n'a PAS pu vérifier

Dettes d'ENVIRONNEMENT, pas d'implémentation — dites ici plutôt que tues :

- **Android non exécuté.** Le conteneur ne résout pas l'Android Gradle Plugin
  (cache Gradle vide, Google Maven injoignable) : `ParticipantRoleUpdatedDecodeTest`
  est écrit et sera exercé par la CI, pas ici. Le correctif ne repose pas sur une
  intuition — il repose sur le contrat de `kotlinx.serialization`, où un champ
  requis sans défaut et absent lève, et où `coerceInputValues` ne secourt que ce
  qui a un défaut.
- **Swift non compilé.** Aucune chaîne Swift sous Linux. Les deux sites d'appel
  du constructeur mémberwise ont été repris à la main (`CacheCoordinatorTests`),
  et les accès `event.participant.x` passés en `event.participant?.x`.
- Inchangées : `npx eslint` échoue dans ce conteneur (cycle 79), `librosa` absent.

## 8. La leçon

> **Un schéma qui « marche » peut cacher une fuite au lieu de l'empêcher.** Deux
> routes jumelles passaient le même rang Prisma brut au même schéma ; l'une
> fuyait, l'autre non, et le seul discriminant était la coïncidence d'un nom de
> clé. Celle qui ne fuyait pas ne protégeait rien — elle était cassée.
>
> La garde ne manquait pas par oubli : elle n'avait **aucun endroit unique où
> être posée**. Trois surfaces réécrivaient la forme de fil à la main, et une
> règle qui doit être retapée à chaque site est une règle qu'un site finira par
> ne pas avoir. Outiller la famille — ici une fabrique, au cycle 91 bis un
> balayage — est ce qui transforme une discipline en propriété.
