# Cycle 188 — « same audiences, for the same reason », et deux audiences différentes

*2026-11-20, à la suite du cycle 185 (#19835, fusionné dans `dev`). Numéroté 188 et
non 186 : deux autres sessions ont pris 186 et une 187 pendant que ce lot attendait
un runner — un identifiant qui ne s'alloue pas collisionne (#5102). Branche
`claude/exciting-planck-jzn9ox`. Livre **#19943**.*

---

## Pourquoi celui-là

Les cinq suivis du cycle 185 étaient tous PRIS par d'autres sessions au relevé
(#19881 → PR #19891 ; #19905 et #19906 → PR #19916 ; #19910 → PR #19932 ;
#19837 demande staging). La règle d'asymétrie (#5243) tranche sans négociation :
celui qui n'a rien écrit cède. #19943, ouverte par l'audit d'audience du même
cycle, n'avait **aucune branche** — et c'est un défaut de SYNCHRONISATION temps
réel pur, pas une dette de forme.

## Le constat

`MessageMutationParams` promet, sur la famille `expired` :

> *Server-initiated twin of `'deleted'` — **same audiences, for the same
> reason**.*

Les deux audiences n'étaient pas les mêmes, et elles ne l'étaient plus depuis
#18556, qui a élargi la seule expiration :

| famille | audience, avant ce lot |
|---|---|
| `expired` | `loadLiveParticipantTargets` + `conversationAudienceRooms` — room de conversation **et** rooms personnelles |
| `deleted`, `pinned`, `unpinned` | `ROOMS.conversation(id)` **seule** |

Même asymétrie sur le transport socket (`MessageHandler.handleMessageDelete`),
qui re-code sa diffusion à la main.

## Pourquoi c'est une perte, et pour qui

La room personnelle n'est pas une commodité d'adressage : c'est **la seule
adresse de `message:new` pour une partie de la population**. Dès que le message
porte une pièce protégée, l'envoi passe en régime PAR LECTEUR
(`messageNewEmission.emitPerReader`) et n'adresse que des `user:<id>`. Or on
QUITTE `conversation:<id>` en revenant à la liste (`ConversationHandler`,
`ConversationViewingHandler`, `StatusHandler`), et on garde sa room personnelle.

La chaîne complète, et les trois canaux qui ne la rattrapent pas :

1. le lecteur a reçu la bulle dans sa room personnelle ;
2. l'auteur supprime — `message:deleted` ne part qu'à `conversation:<id>` ;
3. la **file hors ligne ne compense pas** : elle saute les comptes CONNECTÉS
   (`offlineParticipantQueue`) ;
4. `emitConversationPreviewUpdate` bouge sa **ligne de LISTE**, jamais son fil.

Son cache de fil (`staleTime: Infinity` côté web) garde donc la bulle d'un
message supprimé jusqu'à un rechargement manuel, et ignore toute épingle.

## Ce que l'arbitrage a de simple, et pourquoi il a traîné

Les trois charges ne portent que des **ids** (`MessageDeletedEventData`,
`MessagePinnedEventData`, `MessageUnpinnedEventData`) : élargir l'audience
n'ouvre aucune surface de confidentialité, et c'est ce qui distingue ces
familles de l'ÉDITION, dont le texte reste gardé par `readership`.

Ce qui l'a tenu en vie n'est pas une décision, c'est **un témoin incident** :
`broadcastMessageMutation.expiredAudience.test.ts:124` assertait
`rooms === 'conversation:CONV'` sous un intitulé qui parle d'autre chose
(« une suppression garde son ACTEUR »). La ligne épinglait la room étroite sans
que personne l'ait voulu — et un second, dans `broadcastMessageMutation.test.ts`,
faisait la même chose.

> **Un `toEqual` affirme autant sur ce qu'il GARDE que sur ce qu'il ADMET**, et
> l'intitulé du témoin ne couvre en général que la première moitié. Les deux
> assertions sont rouvertes SCIEMMENT, avec la raison écrite sur place : c'est
> exactement la forme que #19943 demandait.

## La forme du correctif

**Le TYPE du client Prisma pose DEUX questions, pas une.** Le doc-comment disait
« `prisma` n'existe QUE sur les mutations qui déplacent l'APERÇU » — vrai, et
trop étroit : il n'y avait qu'une question posée au type.

| question | type | qui répond OUI |
|---|---|---|
| *cette mutation déplace-t-elle la ligne de LISTE ?* | `MutationPrisma` (porte la relecture d'aperçu) | `edited`, `deleted`, `expired` |
| *doit-elle atteindre qui est SUR la liste ?* | `AudiencePrisma` = `Pick<PrismaClient, 'participant'>` | **les cinq** |

C'est ce qui donne un `prisma` à l'épingle **sans** lui donner la passe
d'aperçu — l'argument de coût du doc-comment d'origine reste intact, et le
prochain transport qui recopiera la forme ne l'héritera pas.

Le compilateur a NOMMÉ les deux sites à mettre à jour (`messages-pin.ts`, deux
`TS2345`) : exiger le champ plutôt que l'optionnaliser est ce qui rend
l'omission impossible au septième transport.

### Le repli ne tombe jamais à rien

`loadLiveParticipantTargets` rend `[]` quand la lecture lève **ou** quand
l'audience dépasse `LIVE_AUDIENCE_SCAN_CAP` (2000), et `conversationAudienceRooms`
rend alors la room de conversation SEULE — c'est-à-dire le comportement d'avant
ce lot. Une lecture en panne dégrade, elle ne supprime pas la diffusion.

## Le ROUGE, mesuré

| mutation | témoins rouges |
|---|---|
| l'ancienne room étroite sur `deleted` / `pinned` / `unpinned` (REST) | **3** / 9 |
| l'ancienne room étroite sur le transport SOCKET | **1** |
| `loadLiveParticipantTargets` qui PROPAGE au lieu de replier | **4** (les quatre témoins de repli) |
| le lot lui-même, sur les deux témoins incidents | **2**, rouverts sciemment |

Les témoins qui PASSAIENT déjà comptent autant : « un participant qui a QUITTÉ
la conversation n'est pas adressé » garde que l'élargissement ne déborde pas sur
les lignes `isActive: false` (`PARTICIPATION_VIVANTE`).

## Le double qui acceptait un tableau et le rangeait ailleurs

Le `makeIO()` de `MessageHandlerDelete.test.ts` déclarait `to(room: string)`.
Socket.IO accepte `Room | Room[]`, et `conversationAudienceRooms` rend un
TABLEAU dès qu'il y a un participant à nommer : le double **acceptait** l'appel
et indexait l'émission sous le tableau lui-même, donc sous une clé qu'aucune
assertion ne peut nommer. Un témoin posé sur `emitsTo(io, 'user:…')` serait resté
rouge en accusant la production.

> **Un double ment aussi par ce qu'il ACCEPTE**, et la forme la plus discrète de
> ce mensonge est un paramètre dont il ne lit qu'une des formes admises. C'est
> le constat du cycle 185 sur `findConversationsIn` (un `orderBy` TABLEAU lu
> comme un objet), rejoué sur un autre paramètre, dans un autre fichier, à un
> cycle de distance.

## Deux commentaires devenus FAUX, relus dans le même lot

Un lot qui déplace une frontière doit relire ce qui la décrivait :

- `realtime-message-pin.ts` (web) — « la passerelle les diffuse à la salle de la
  conversation ». Sa conclusion de sûreté reste vraie et c'est elle qui rend
  l'élargissement sans risque côté client : *« Aucune fuite inter-conversation :
  seule la rangée de la conversation que la charge NOMME est touchée. Rejouée,
  l'écriture ne change rien. »*
- `emitConversationPreviewUpdate.ts` — « `MESSAGE_EDITED` / `MESSAGE_DELETED`
  are emitted only to the conversation room ». La RAISON d'être du helper
  survit intacte, et elle méritait d'être dite autrement : **les deux canaux ne
  se remplacent pas**, l'un porte un FAIT sur un message, l'autre l'état
  RECALCULÉ de la ligne. Élargir l'audience du premier ne rend pas le second
  superflu.

## Ce qui RESTE, et qui le dit

- **Le transport socket n'a pas été replié sur `broadcastMessageMutation`.** Il
  porte une exclusion d'acteur que le helper ne sait pas dire (l'auteur contre
  le modérateur, deux monnaies d'id), et l'y porter est un lot à soi. Seule
  l'AUDIENCE a été alignée — c'est ce que #19943 demandait, et rien de plus.
- **L'édition garde son audience propre** (`editedAudience.ts`, gardée par
  `readership`) : son texte n'est pas un id, et ce lot ne la touche pas.
- **Le coût est d'une lecture de plus par suppression, épingle et désépinglage**
  — `select: { id, userId }`, plafonnée à 2000 lignes, la même que l'expiration
  paie depuis #18556.
