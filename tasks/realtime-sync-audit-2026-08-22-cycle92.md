# Cycle 92 — la présence est gardée sur ce qui LISTE un participant, sur rien qui en MUTE un

**Branche** : `claude/keen-hamilton-jarxb5`
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

- [ ] `serializeConversationParticipant` — pur, dans `packages/shared/utils/participant-helpers.ts`,
      à côté du schéma qu'il honore ; prend la visibilité de présence en paramètre.
- [ ] `GET …/participants` : sa projection en ligne DEVIENT l'appel (référence, comportement conservé).
- [ ] `PATCH …/role` : sérialise + garde la présence (REST **et** diffusion Socket.IO).
- [ ] `POST …/invite` : sérialise + garde ; clé alignée sur celle de ses deux voisins.
- [ ] `POST …/participants` : `participant` déclaré SANS producteur — retiré (précédent 91 bis §5).
- [ ] Témoins : vrai Fastify, assertions de VALEUR, rouges prouvés avant correctif.
