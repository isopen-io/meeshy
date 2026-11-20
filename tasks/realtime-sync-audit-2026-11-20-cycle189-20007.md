# Cycle 189 — le plafond ne jette plus, il tronque (et le correctif a maigri sous l'audit)

*2026-11-20, à la suite directe du cycle 188 (#19943, PR #19954, fusionné dans
`dev`). Numéroté 189 : 186, 187 et 188 sont pris par d'autres sessions du même
jour — un identifiant qui ne s'alloue pas collisionne (#5102). Branche
`claude/exciting-planck-z11wka`. Livre **#20007**, ouverte par l'audit
adversarial de #19954.*

---

## Pourquoi celui-là

#20007 est le suivi de mon lot précédent, et c'est la règle de la routine : se
baser sur le développement précédent. Aucune branche ne l'écrivait au relevé
(27 PR ouvertes, aucune sur ces chemins), donc la règle d'asymétrie (#5243) ne
s'appliquait pas. Son jumeau #20008 est sur les chemins de #19955 / #19916,
tenus par d'autres sessions : laissé.

## Les quatre constats de l'audit, et ce qu'ils sont devenus

| # | constat | état |
|---|---|---|
| 1 | aucun témoin ne gardait la clause `bannedAt` de `PARTICIPATION_VIVANTE` | **témoin posé**, 4 rouges prouvés |
| 2 | au-delà de 2 000 participants, l'audience retombe sur la room de conversation seule | **corrigé** : le plafond tronque en le journalisant, à 50 000 |
| 3 | l'existence d'un message sous plancher d'historique | **#17029 et #18681 retrouvées et NOMMÉES dans le code** |
| 4 | les autres retraits (signal chiffré #13142, brûlure de vue unique) | **vérifié** : deux familles DE PLUS portent l'asymétrie → #20019 |

## Le constat qui compte

```ts
take: LIVE_AUDIENCE_SCAN_CAP + 1,                              // 2 000
if ((rows?.length ?? 0) > LIVE_AUDIENCE_SCAN_CAP) return [];   // ← tout est jeté
```

Le plafond ne bornait pas un coût : il **jetait les 2 000 lignes qu'il venait de
lire**, et l'appelant repliait sur `conversation:<id>` seule — le défaut exact
que #18556 puis #19943 avaient corrigé, rétabli au-dessus d'un seuil.

**Et il ne protégeait rien**, ce que la suite du MÊME appel suffisait à montrer :
`enqueueOfflineMessageMutation` relit les mêmes lignes, avec le même `where` et
le même `select`, **sans plafond**, pour la même mutation
(`offlineParticipantQueue.ts:396`). Le coût était déjà payé, deux fois, dont une
sans borne. (#20020.)

## Le correctif a MAIGRI sous l'audit, et c'est le fait du cycle

La première version paginait la lecture (curseur sur `id`, la forme de
`userRelationBackfill`) et émettait **par lots**, en assumant une double
livraison au-delà d'une page. Elle était verte, prouvée par quatre mutations, et
l'audit adversarial l'a démontée en trois mesures :

1. **son propre commentaire mentait** — « rien n'est gardé en mémoire plus
   longtemps que sa propre diffusion » : la fonction ACCUMULAIT toutes les pages
   et ne rendait qu'à la fin, les trois appelants n'émettant qu'après le retour.
   Tout était déjà en mémoire, donc **découper la portée de dédoublonnage ne
   gagnait rien** et faisait perdre l'exactitude ;
2. **l'alternative exacte était GRATUITE** — `ServerEmitIO.to` accepte
   `string | string[]` depuis le cycle 108, et trois jumelles du dépôt émettent
   déjà ainsi (`broadcastReadStatus`, `emitAttachmentUpdated`,
   `autoDeliverToOnlineRecipients`). Le prix que le lot documentait (`.except`,
   « élargir la porte chez ses trois porteurs et tous leurs doubles ») était
   réel, et il MASQUAIT l'alternative à zéro ;
3. **la pagination ajoutait un coût et une course que le défaut n'avait pas** —
   `orderBy: { id: 'asc' }` n'est servi par AUCUN index de `Participant`
   (`@@index([conversationId, isActive])` ne porte pas `_id`), donc un TRI
   BLOQUANT par page sur un chemin chaud ; et un curseur désigne une LIGNE, que
   `cleanupExpiredData` supprime physiquement (participants anonymes, sans
   filtre `isActive`) — page suivante vide ⇒ `complete: true` **faux**, et muet.

> **Un correctif qui ajoute un mécanisme doit prouver que le mécanisme sert à
> quelque chose, et la preuve se lit dans le CODE du correctif, pas dans son
> commentaire.** « Émission par lots » venait de la piste écrite dans l'issue :
> l'issue avait raison sur le défaut, et sa piste était inutile. Suivre une piste
> sans la mesurer, c'est hériter d'une affirmation (cycle 107).

Ce qui est livré : **une lecture bornée à 50 000, qui tronque en le journalisant,
et une émission.** Plus petit que la première version, et plus petit que le
défaut.

## La forme livrée

- `LIVE_AUDIENCE_SCAN_CAP` = 50 000, et dépasser **tronque** (`complete: false`)
  avec un `logger.warn` — la perte d'avant était muette.
- La requête est celle d'avant le lot, à la valeur du `take` près : **aucun tri,
  aucun index, aucune migration.**
- **UNE émission**, donc un dédoublonnage sur l'audience ENTIÈRE — y compris les
  deux lignes vivantes qu'un même compte peut porter (inscrit entré aussi par un
  lien), que la version par lots adressait deux fois.
- `complete` sépare « aucun participant vivant » de « la lecture n'a rien
  prouvé » : condition d'entrée du partage avec la file (#20020), où `[]` vaut
  « personne ».
- Une lecture qui lève rend `targets: []` ⇒ room de conversation seule, le
  comportement d'avant #18556 — jamais rien.

## Le ROUGE, mesuré

| mutation | témoins rouges |
|---|---|
| le code d'AVANT en entier (plafond 2 000 + jeter) | **5** (3 familles REST, le fait de vue unique, l'unité) |
| le plafond JETTE au lieu de tronquer | **1** |
| la clause `bannedAt` quitte l'audience | **4** |
| la BORNE (`take`) quitte la lecture | **5** — le double la refuse |

## Le témoin qui GELAIT la perte, et qui était déjà anesthésié

`broadcastViewOnceFact.test.ts` portait un `describe` entier — « l'audience
nommée est bornée (#18556) » — dont l'unique témoin assertait « au-delà du
plafond, la diffusion replie sur la room de conversation seule ». Réécrit
sciemment, raison sur place, **et son assertion sur la borne conservée** : c'est
la seule chose qu'un témoin de comportement ne peut pas voir.

Il était déjà anesthésié : sa fixture valait
`Array.from({ length: LIVE_AUDIENCE_SCAN_CAP + 1 })`, et la constante retirée du
module, `NaN` rend un tableau VIDE — le témoin passait, sur une foule de zéro
personne. Seule sa seconde assertion a rougi.

## Point 4 — deux familles DE PLUS portent la même asymétrie

Relevé sur `to(ROOMS.conversation(` en production :

| retrait | site | charge | file hors ligne |
|---|---|---|---|
| `attachment:deleted` | `routes/attachments/metadata.ts:154` | ids seuls | **aucune** |
| `message:cited-post-withdrawn` | `announceCitedPostWithdrawal.ts:48` | ids seuls | aucune (repli de relecture écrit) |

→ **#20019**. Le signal chiffré de #13142 n'est PAS dans cette famille : il
s'adresse aux rooms d'APPAREIL (`services/e2ee/device-room.ts`). La brûlure d'une
vue unique passe par `broadcastViewOnceFact`, donc ce lot la corrige.

## Ce qui RESTE, et qui le dit

- **#20020** — la file hors ligne relit sans plafond les lignes que l'audience
  vient de lire : partager la lecture (sous `complete`) retire une lecture
  complète par mutation. C'est aussi là que se décide la pagination de CETTE
  lecture-là, si elle doit l'être.
- **#20019** — les deux retraits restés étroits.
- **#20021 — FERMÉE sans dette** : il n'y a ni lot, ni doublon, ni porte à
  élargir.
- **#17029 / #18681** — l'existence d'un message hors plancher, inchangée.
- **Non mesuré** : existe-t-il en production une conversation de plus de 2 000
  participants vivants ? Le nouveau plafond rend la question moins pressante
  (50 000), elle n'est pas répondue.
