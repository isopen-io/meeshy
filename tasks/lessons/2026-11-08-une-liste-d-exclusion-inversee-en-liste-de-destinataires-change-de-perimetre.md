## Une liste d'EXCLUSION inversée en liste de DESTINATAIRES change de périmètre, et le doc-comment de la loi le disait (cycle 144)

`getBlockRelatedUserIds` rend l'ensemble bidirectionnel ENTIER d'un compte —
tous ceux qui l'ont bloqué, tous ceux qu'il a bloqués — **sans aucune notion de
conversation**. Son doc-comment explique pourquoi c'est sans danger :

> « Intersecting the result with a live socket map is the caller's job and is
> what makes the swap behaviour-preserving: **an id in this set that owns no
> socket contributes nothing to AN EXCLUSION LIST**, exactly as a candidate
> filter would have dropped it. »

La phrase est exacte, et elle porte sa propre condition : **comme liste
d'exclusion.** Un id étranger à la conversation y est inerte — on ne retire que
des gens qui n'allaient rien recevoir.

Le correctif de #16745 a voulu retirer l'épingle d'un pair bloqué EN COURS de
partage. Pour cela il a pris la différence de deux lectures de cette loi et l'a
servie à `io.to(socketId)` : **l'ensemble a changé de rôle.** Dave, qui n'est pas
dans le fil et n'a aucun lien avec Alice, apprenait — par son propre blocage, et
à raison d'un coup par minute s'il débloquait et rebloquait — l'existence d'un
identifiant de conversation auquel il n'a pas accès, le fait qu'Alice y tenait un
partage de position, et l'instant. **Une porte NEUVE vers des gens hors du fil,
ouverte par un lot de confidentialité, et pire sur son axe que le défaut qu'il
fermait.**

> **Un ensemble a un périmètre, et ce périmètre dépend de l'usage qu'on en
> fait.** Soustraire tolère le large ; adresser ne le tolère pas. La question à
> poser au moment où l'on réutilise un ensemble existant n'est pas « contient-il
> les bons ids ? » mais **« dans quel SENS cet ensemble a-t-il été borné, et
> est-ce encore le bon sens ? »**

Deux choses rendent cette famille coûteuse à voir :

1. **Le lot était en train de resserrer**, et c'est l'état d'esprit dans lequel
   on ouvre le moins les yeux. Chaque ligne alentour retirait quelque chose à
   quelqu'un ; celle-là donnait, et elle se lisait comme les autres parce qu'elle
   parlait de la même chose. C'est la leçon 275 retournée : on avait mesuré ce
   que la charge TRANSPORTE, pas **à qui elle est ADRESSÉE**.
2. **Le doc-comment de la loi contenait la réponse** et ne pouvait pas la faire
   rougir. Il énonce une condition d'usage — « as an exclusion list » — que
   personne ne vérifie au site d'appel, et qu'on lit comme une explication plutôt
   que comme une contrainte. Même famille que « un commentaire qui ÉNONCE une
   contrainte est une AFFIRMATION » (cycle 94) : ici il dit vrai, et c'est le
   LECTEUR qui en a pris la moitié.

**Et ce qui l'a attrapée n'est aucun des deux cliquets du lot.** Le témoin de
comportement couvrait les cinq portes existantes ; le cliquet de source cherchait
les émissions adressées à un SALON, donc par construction il ne regardait pas
celle qui ne l'était pas. C'est un audit ADVERSARIAL — à qui l'on demande de
casser, non de relire — qui l'a trouvée, et il valait son coût : sans lui, le
lot partait avec sa propre fuite et ses gardes vertes.

**Le corollaire : ce qui a rendu l'invariant impossible à tenir.**

La rétractation ciblée existait pour tenir l'invariant « `blockRelated` = les
pairs SANS ÉPINGLE ». Le même audit a montré que cet invariant était faux sur
**quatre chemins** — un re-départ de partage, un arrêt sans partage, deux
appareils du même compte, une émission ciblée perdue — et qu'il ne pouvait pas
être vrai : *qui porte l'épingle* dépend de l'instant de chaque annonce, du
nombre d'appareils, d'un rafraîchissement arrivé entre-temps.

> **Quand un invariant d'état exige une algèbre pour rester vrai, et qu'une
> erreur dans cette algèbre laisse une donnée RÉELLE affichée chez quelqu'un
> qu'on protège, c'est l'invariant qu'il faut retirer — pas l'algèbre qu'il faut
> réparer.**

La règle qui l'a remplacé ne tient aucun état : **les ANNONCES se filtrent, les
RÉTRACTATIONS non.** Une rétractation ne porte pas la donnée sensible, et c'est
le seul chemin qui RETIRE ce qui est affiché — la filtrer concède un événement
sans contenu à un co-participant pour éviter de laisser une position réelle
épinglée pendant huit heures chez un bloqué. Le choix n'est pas serré, et le
gain structurel est qu'il n'y a plus rien à tenir à jour, rien à rejouer si une
émission se perd, et rien à décider entre union et intersection.

La première version de ce lot appelait d'ailleurs l'UNION des ensembles de
plusieurs appareils « la posture la plus fermée des deux ». C'était faux dans le
sens qui compte : « n'a RIEN reçu » est l'**INTERSECTION**. *« Fermé » qualifie
« ne pas émettre vers un bloqué » ; appliqué à une rétractation, cette fermeture
EST le fail-open.*
