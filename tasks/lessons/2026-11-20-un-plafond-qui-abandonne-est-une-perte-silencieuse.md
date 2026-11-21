## Un PLAFOND qui abandonne est une perte silencieuse ; un plafond qui TRONQUE est une borne (cycle 189, #20007)

`loadLiveParticipantTargets` lisait l'audience vivante d'une conversation avec
`take: LIVE_AUDIENCE_SCAN_CAP + 1` (2 000), et **rendait `[]` dès que le compte
dépassait le plafond**. Son appelant repliait alors sur la room de conversation
SEULE — c'est-à-dire exactement le défaut que #18556 puis #19943 venaient de
corriger : un lecteur qui a reçu `message:new` dans sa room PERSONNELLE (régime
par lecteur d'un message à pièce protégée) puis quitté le fil pour la liste ne
recevait ni suppression, ni épingle, ni désépinglage, ni fait de vue unique. La
file hors ligne ne le rattrape pas — elle saute les comptes CONNECTÉS.

> **Un plafond qui, dépassé, rend MOINS que ce qu'il avait déjà lu n'est pas une
> borne de coût : c'est une porte qui se ferme en silence.** La borne juste garde
> ce qu'elle a lu, le dit (`complete: false`) et le JOURNALISE.

Quatre constats, et le dernier est celui qui coûte le plus cher à apprendre :

- **Le plafond ne protégeait aucun coût, et il suffisait de lire la suite du même
  appel pour le voir.** Quelques lignes plus bas, `enqueueOfflineMessageMutation`
  relit EXACTEMENT les mêmes lignes (`{ conversationId, ...PARTICIPATION_VIVANTE }`,
  `select: { id, userId }`) **sans plafond**, pour la même mutation. Avant de
  justifier une borne par son coût, regarder ce que le chemin paie DÉJÀ (forme
  jumelle de « avant de conclure qu'une garde coûterait une requête, regarder ce
  que le site lit déjà », cycle 127).

- **`[]` disait deux choses.** « Aucun participant vivant » (une affirmation) et
  « la lecture n'a rien prouvé » (une ignorance) sortaient par la même valeur.
  Tant qu'elles se ressemblent, la liste ne peut pas être remise à la file hors
  ligne, dont la garantie est DURABLE : `[]` y vaut « personne » et n'enfile pour
  personne (cycle 116).

- **Un témoin peut GELER la perte qu'il décrit.** `broadcastViewOnceFact.test.ts`
  portait « au-delà du plafond, la diffusion replie sur la room de conversation
  seule » — vrai du code, et rangé sous un intitulé qui se lit comme une
  intention. Réécrit sciemment, raison sur place (forme du cycle 188 : « un
  `toEqual` affirme autant sur ce qu'il GARDE que sur ce qu'il ADMET »,
  appliquée à un `describe` entier).

- **Et il était déjà ANESTHÉSIÉ.** Sa fixture valait
  `Array.from({ length: LIVE_AUDIENCE_SCAN_CAP + 1 })`. La constante retirée du
  module, `undefined + 1` donne `NaN`, et `Array.from({ length: NaN })` rend un
  tableau **VIDE** : le témoin continuait d'asserter « la room de conversation
  seule » et **passait**, sur une foule de zéro personne. Seule sa seconde
  assertion (sur `take`) a rougi. **Un témoin dont la fixture se calcule depuis
  un import vérifie aussi cet import.**

### Le premier correctif était plus compliqué que le défaut — et son commentaire était FAUX

La première version de ce lot PAGINAIT la lecture (curseur sur `id`, la forme de
`userRelationBackfill`) et émettait **par lots**, une page lue valant une
émission faite. Elle était verte, prouvée par quatre mutations, et l'audit
adversarial l'a démontée en trois points :

1. **Son propre commentaire mentait.** « Rien n'est gardé en mémoire plus
   longtemps que sa propre diffusion » : la fonction ACCUMULAIT toutes les pages
   et ne rendait qu'à la fin, les trois appelants n'émettant qu'après le retour.
   Tout était déjà en mémoire — donc **découper la portée de dédoublonnage ne
   gagnait rien**, et faisait perdre l'exactitude.
2. **`ServerEmitIO.to` accepte `string | string[]` depuis le cycle 108.** Une
   audience de 50 000 part donc en UNE émission, dédoublonnée de bout en bout,
   sans élargir aucune porte. Le prix documenté de l'alternative exacte
   (`.except`, « élargir la porte chez ses trois porteurs et tous leurs
   doubles ») était réel — et il masquait l'alternative GRATUITE.
3. **La pagination introduisait un coût et une course que le défaut n'avait
   pas.** `orderBy: { id: 'asc' }` n'est servi par AUCUN index de `Participant`
   (`@@index([conversationId, isActive])` ne porte pas `_id`) : un TRI BLOQUANT
   sur tous les participants du fil, **par page**, sur un chemin chaud. Et un
   curseur désigne une LIGNE, que `cleanupExpiredData` supprime physiquement
   (participants anonymes, sans filtre `isActive`) : page suivante vide ⇒
   `complete: true` **faux**, et muet.

> **Un correctif qui ajoute un mécanisme doit prouver que le mécanisme sert à
> quelque chose — et la preuve se lit dans le code du correctif, pas dans son
> commentaire.** Ici, « émission par lots » venait de la piste écrite dans
> l'issue ; l'issue avait raison sur le DÉFAUT et sa piste était inutile. Suivre
> une piste sans la mesurer, c'est hériter d'une affirmation (cycle 107).

Le lot livré est donc plus PETIT que le défaut : une lecture, bornée à 50 000,
qui tronque en le journalisant, et une émission. Deux des quatre constats de
l'audit disparaissent avec le mécanisme retiré ; le troisième (`take` gardé par
aucun témoin) est devenu un double qui **EXIGE** la borne.

### Un double qui ignore une borne la laisse disparaître

Le double de la première version honorait `take` / `cursor` / `skip` sans les
exiger. Mesuré par l'audit : **retirer `take` de la production, ou retirer
`orderBy`, laissait les 33 témoins VERTS** — la pagination devenait décorative
en production sans qu'un seul rougisse. Le double livré exige `take` et jette sur
toute autre forme ; un témoin assert en plus la valeur de la borne
(`lastArgs()`), parce qu'aucun témoin de comportement ne peut la voir.

Enfin, le renvoi : le code disait « révéler l'EXISTENCE d'un message est une
question distincte, suivie par sa propre issue », sans numéro. L'audit a dû la
chercher. Elle existait en deux exemplaires — **#17029** (décision produit) et
**#18681** (le rejeu) — et les deux sont désormais NOMMÉES sur place. **Un renvoi
sans adresse n'est pas un renvoi.**
