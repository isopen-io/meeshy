## Un PLAFOND qui abandonne est une perte silencieuse ; un plafond qui PAGINE est une borne (cycle 189, #20007)

`loadLiveParticipantTargets` lisait l'audience vivante d'une conversation avec
`take: LIVE_AUDIENCE_SCAN_CAP + 1` (2 000), et **rendait `[]` dès que le compte
dépassait le plafond**. Son appelant repliait alors sur la room de conversation
SEULE — c'est-à-dire exactement le défaut que #18556 puis #19943 venaient de
corriger : un lecteur qui a reçu `message:new` dans sa room PERSONNELLE (régime
par lecteur d'un message à pièce protégée) puis quitté le fil pour la liste ne
recevait ni suppression, ni épingle, ni désépinglage, ni fait de vue unique. La
file hors ligne ne le rattrape pas — elle saute les comptes CONNECTÉS.

> **Un plafond qui, dépassé, rend MOINS que ce qu'il avait déjà lu n'est pas une
> borne de coût : c'est une porte qui se ferme en silence.** La borne juste lit la
> page suivante (curseur, la forme de `userRelationBackfill`) et ÉMET par lots ;
> le plafond ne disparaît pas, il devient la taille d'une page.

Trois constats qui valent au-delà de ce site :

- **Le plafond ne protégeait aucun coût, et il suffisait de lire la suite du même
  appel pour le voir.** Quelques lignes plus bas, `enqueueOfflineMessageMutation`
  relit EXACTEMENT les mêmes lignes (`{ conversationId, ...PARTICIPATION_VIVANTE }`,
  `select: { id, userId }`) **sans plafond ni pagination**, pour la même mutation.
  Avant de justifier une borne par son coût, regarder ce que le chemin paie DÉJÀ
  (forme jumelle de « avant de conclure qu'une garde coûterait une requête,
  regarder ce que le site lit déjà », cycle 127).

- **`[]` disait deux choses, et c'est ce qui interdisait de partager la lecture.**
  « Aucun participant vivant » (une affirmation) et « la lecture n'a rien prouvé »
  (une ignorance) sortaient par la même valeur. Tant qu'elles se ressemblent, la
  liste ne peut pas être remise à la file hors ligne, dont la garantie est
  DURABLE : `[]` y vaut « personne » et n'enfile pour personne (cycle 116). Le
  verdict de complétude (`complete`) est le prix d'entrée du partage, pas un
  ornement.

- **Un témoin peut GELER la perte qu'il décrit.** `broadcastViewOnceFact.test.ts`
  portait « au-delà du plafond, la diffusion replie sur la room de conversation
  seule » — vrai du code, et rangé sous un intitulé qui se lit comme une
  intention. Il a été RÉÉCRIT sciemment, avec sa raison sur place : c'est la forme
  du cycle 188 (« un `toEqual` affirme autant sur ce qu'il GARDE que sur ce qu'il
  ADMET »), appliquée cette fois à un `describe` entier.

Et deux formes de double, mesurées dans le même lot :

- **Un double qui ignore `take` / `cursor` / `skip` rend la MÊME page
  indéfiniment** : une lecture paginée y tient toujours dans une seule page, et
  le témoin n'exerce alors que sa propre copie. C'est la troisième variante en
  trois cycles de « un double ment aussi par ce qu'il ACCEPTE » (cycle 185, un
  `orderBy` TABLEAU lu comme un objet ; cycle 188, un `to(room: string)` qui
  rangeait un TABLEAU sous une clé innommable). Le double de #20007
  (`__tests__/helpers/live-audience-double.ts`) APPLIQUE la clause, REJOUE le tri,
  DÉCOUPE la page — et JETTE sur toute forme qu'il ne modélise pas.

- **Une constante importée qui disparaît ne casse pas toujours un témoin : elle
  l'anesthésie.** Le témoin de plafond fabriquait
  `Array.from({ length: LIVE_AUDIENCE_SCAN_CAP + 1 })` ; la constante retirée,
  `undefined + 1` donne `NaN`, et `Array.from({ length: NaN })` rend un tableau
  **VIDE**. Le témoin continuait d'asserter « la room de conversation seule » — et
  passait, sur une foule de zéro personne. Seule sa seconde assertion (`take`) a
  rougi. **Un témoin dont la fixture se calcule depuis un import vérifie aussi cet
  import.**

Enfin, le renvoi : le code disait « révéler l'EXISTENCE d'un message est une
question distincte, suivie par sa propre issue », sans numéro. L'audit a dû la
chercher. Elle existait en deux exemplaires — **#17029** (décision produit) et
**#18681** (le rejeu) — et les deux sont désormais NOMMÉES sur place. **Un renvoi
sans adresse n'est pas un renvoi.**
