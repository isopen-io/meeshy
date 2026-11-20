# Cycle 189 — le plafond n'abandonne plus, il pagine

*2026-11-20, à la suite directe du cycle 188 (#19943, PR #19954, fusionné dans
`dev`). Numéroté 189 : 186, 187 et 188 sont pris par d'autres sessions du même
jour — un identifiant qui ne s'alloue pas collisionne (#5102). Branche
`claude/exciting-planck-z11wka`. Livre **#20007**, ouverte par l'audit
adversarial de #19954.*

---

## Pourquoi celui-là

#20007 est le suivi de MON lot précédent, et c'est la règle de la routine : se
baser sur le développement précédent. Aucune branche ne l'écrivait au relevé
(`git fetch`, 27 PR ouvertes, aucune sur ces chemins), donc la règle d'asymétrie
(#5243) ne s'appliquait pas. Son jumeau #20008 (copie vocale d'un talkie) est
sur les chemins de #19955 / #19916, tenus par d'autres sessions : laissé.

## Les quatre constats de l'audit, et ce qu'ils sont devenus

| # | constat | état |
|---|---|---|
| 1 | aucun témoin ne gardait la clause `bannedAt` de `PARTICIPATION_VIVANTE` | **témoin posé**, 4 rouges prouvés |
| 2 | au-delà de 2 000 participants, l'audience retombe sur la room de conversation seule | **corrigé** : lecture paginée, émission par lots |
| 3 | l'existence d'un message sous plancher d'historique | **#17029 et #18681 retrouvées et NOMMÉES dans le code** |
| 4 | les autres retraits (signal chiffré #13142, brûlure de vue unique) | **vérifié** : deux familles DE PLUS portent l'asymétrie → issues |

## Le constat qui compte

```ts
take: LIVE_AUDIENCE_SCAN_CAP + 1,            // 2 000
if ((rows?.length ?? 0) > LIVE_AUDIENCE_SCAN_CAP) return [];   // ← tout est jeté
```

Le plafond ne bornait pas un coût : il **jetait les 2 000 lignes qu'il venait de
lire**, et l'appelant repliait sur `conversation:<id>` seule — le défaut exact que
#18556 puis #19943 avaient corrigé, rétabli au-dessus d'un seuil.

**Et il ne protégeait rien**, ce que la suite du MÊME appel suffisait à montrer :
`enqueueOfflineMessageMutation` relit les mêmes lignes, avec le même `where` et le
même `select`, **sans plafond ni pagination**, pour la même mutation
(`offlineParticipantQueue.ts:395`). Le coût était déjà payé, deux fois, dont une
sans borne.

## La forme du correctif

- **Lecture au CURSEUR**, page par page (`orderBy: { id: 'asc' }`, `cursor`,
  `skip: 1` — la forme de `userRelationBackfill`), `take: page + 1` : la ligne
  excédentaire est la sonde « y en a-t-il d'autres ? », donc une audience de la
  taille exacte d'une page ne paie pas de page vide pour l'apprendre.
- **Émission par LOTS** : une page lue est une émission faite. La room de
  conversation voyage dans le PREMIER lot, et dans lui seul.
- **Le plafond survit en nombre, pas en conséquence** : `LIVE_AUDIENCE_PAGE`
  (2 000) est la taille d'une page, `LIVE_AUDIENCE_MAX_PAGES` (25) la borne dure à
  50 000 vivants — elle existe pour qu'une boucle de pagination sur une table
  VIVANTE ne tourne pas sans fin, et quand elle tronque **elle le journalise** :
  la perte d'avant ce lot était muette.
- **`complete` sépare l'affirmation de l'ignorance.** `batches: []` disait à la
  fois « aucun participant vivant » et « la lecture n'a rien prouvé ». La
  distinction ne change rien à l'émission (les deux replient sur la room de
  conversation) ; elle est la condition pour que cette lecture soit un jour
  PARTAGÉE avec la file hors ligne, où `[]` vaut « personne » et n'enfile pour
  personne (cycle 116).
- **Une panne de page n'efface pas les pages prouvées.** La lecture qui lève à la
  page *n* rend les *n-1* premières et `complete: false` : fail-OPEN sur la
  livraison, ces charges ne portant que des ids.

Trois sites de production, tous convertis : `broadcastMessageMutation` (les
quatre familles REST), `broadcastViewOnceFact` (ouverture et purge) et
`MessageHandler.handleMessageDelete` (le transport socket).

## Ce que le lot ASSUME, écrit sur place

À plusieurs lots, les lots sont des portées de dédoublonnage DISJOINTES : un
socket présent dans la room de conversation **et** dans sa room personnelle d'un
lot ultérieur reçoit l'événement deux fois. Borné par trois choses — cela n'arrive
qu'au-delà de 2 000 participants vivants ; les cinq familles ne portent que des
IDS, dont l'application est idempotente chez les trois clients (le web l'écrit
sur son propre site : « Rejouée, l'écriture ne change rien ») ; et ces émissions
ne sont pas estampillées par `emitWithSeq`, donc un doublon ne ressemble jamais à
un TROU de séquence pour le SyncEngine.

L'alternative EXACTE — `.except(conversation:<id>)` sur les lots suivants — exige
d'élargir la porte d'émission (`ServerEmitIO`) chez ses trois porteurs et tous
leurs doubles, pour supprimer un doublon idempotent. Elle n'est pas écartée, elle
est à son prix : **#20021**.

## Le ROUGE, mesuré

| mutation | témoins rouges |
|---|---|
| la clause `bannedAt` quitte l'audience | **4** (3 familles REST + l'unité) |
| le plafond ABANDONNE (le code d'avant) | **7** |
| une panne de page jette les pages prouvées | **1** |
| le double de test IGNORE la pagination | **1** |

## Le témoin qui GELAIT la perte

`broadcastViewOnceFact.test.ts` portait un `describe` entier — « l'audience
nommée est bornée (#18556) » — dont l'unique témoin assertait « au-delà du
plafond, la diffusion replie sur la room de conversation seule ». Réécrit
sciemment, avec sa raison sur place.

**Et il était déjà anesthésié avant d'être réécrit** : sa fixture valait
`Array.from({ length: LIVE_AUDIENCE_SCAN_CAP + 1 })`. La constante retirée,
`NaN` donne un tableau VIDE — le témoin passait encore, sur une foule de zéro
personne, et seule sa seconde assertion (`take`) a rougi. **Un témoin dont la
fixture se calcule depuis un import vérifie aussi cet import.**

## Point 4 — deux familles DE PLUS portent la même asymétrie

Relevé sur `to(ROOMS.conversation(` en production :

| retrait | site | charge | file hors ligne |
|---|---|---|---|
| `attachment:deleted` | `routes/attachments/metadata.ts:154` | ids seuls | **aucune** |
| `message:cited-post-withdrawn` | `announceCitedPostWithdrawal.ts:48` | ids seuls | aucune (repli de relecture écrit) |

Les deux sont des RETRAITS, à charge d'ids, adressés à `conversation:<id>`
seule : le lecteur resté sur la liste ne les reçoit pas. → **#20019**.

Le signal chiffré de #13142, lui, n'est PAS dans cette famille : il s'adresse
aux rooms d'APPAREIL (`services/e2ee/device-room.ts`), pas à la room de
conversation — son audience ne dépend d'aucune présence dans le fil. La brûlure
d'une vue unique passe par `broadcastViewOnceFact`, donc elle est corrigée par
ce lot même.

## Ce qui RESTE, et qui le dit

- **#20020** — la file hors ligne relit sans plafond les lignes que l'audience
  vient de lire : partager la lecture (sous `complete`) retire une lecture
  complète par suppression, épingle et désépinglage.
- **#20021** — l'exactitude par `.except(conversation:<id>)`, et son prix.
- **#20019** — les deux retraits ci-dessus.
- **#17029 / #18681** — l'existence d'un message hors plancher, inchangée par ce
  lot : élargir l'audience des familles d'ids élargit d'autant la population qui
  apprend qu'un id existe. C'était déjà vrai de #18556 et de #19943 ; ça l'est
  maintenant sans plafond.
