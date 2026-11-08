# Un test de joignabilité posé sur le COMPTE ne dit rien d'un événement dont l'ACTEUR est ce compte

**Cycle 146, #16688.** La file de rejeu hors ligne décide son audience par
`connectedUsers.has(queueKey)`, où la clé est le COMPTE — indexée pour TOUTES
les sockets du compte. Pour onze familles d'événements sur quatorze, le prédicat
est juste : l'acteur est un TIERS, et la question « ce destinataire a-t-il une
socket ? » a un sens.

Pour les trois familles de MARQUES PERSONNELLES — étoile, masquage « pour moi »,
restauration — l'acteur **est** le destinataire. L'appareil qui pose la marque
fournit donc toujours la socket que le prédicat cherche : la réponse est
toujours OUI, et **aucune entrée n'a jamais été écrite** pour l'autre appareil
du même compte, resté éteint.

## Pourquoi c'est plus discret qu'un no-op ordinaire

C'est la famille « une garde conditionnée à ce qu'elle garde est un no-op »,
déplacée d'une GARDE vers une AUDIENCE. Et le déplacement la rend invisible :

- le prédicat n'est pas faux, il est juste — pour la majorité des familles ;
- aucun témoin ne rougit, puisque le comportement est correct partout où il est
  exercé ;
- et la feature cassée est DOCUMENTÉE comme marchant : les deux modules
  producteurs écrivent « diffuser à `user:{id}` pour que les AUTRES appareils
  convergent », et les deux clients qui la consomment le redisent chez eux.

Elle marchait — à condition que les deux appareils soient allumés **en même
temps**, ce qu'aucun des trois endroits ne dit.

## La question à poser

Devant tout prédicat d'audience, demander **qui RENSEIGNE la valeur qu'il
lit** :

> *Le sujet de cet événement peut-il être celui dont la présence décide de
> l'audience ?*

Si oui, le prédicat ne mesure pas le destinataire — il mesure l'émetteur, et il
faut une autre porte. Chercher les événements dont l'acteur et le destinataire
sont la même entité : ils sont rares, et c'est précisément pourquoi la règle
générale leur est appliquée sans qu'on y pense.

## Corollaire de méthode — un recours se MESURE famille par famille

Le premier jet de ce lot annonçait les trois familles comme également perdues.
Le relevé a rendu trois recours DIFFÉRENTS : l'étoile n'en avait aucun (zéro
état d'étoile dans les onze fichiers de `GET /sync`, et aucune charge de message
n'en porte), le masquage avait les pierres tombales `hidden` de `GET /sync` (un
recours PULL), la restauration aucun canal push.

Annoncer une panne qu'on n'a pas mesurée coûte la confiance dans les cycles où
il y en a une. Et ici la mesure a aussi démenti une de mes propres phrases — « aucun
`isStarred` n'existe dans le dépôt » était faux : il en existe un, drapeau de
VUE alimenté par l'ensemble des favoris, jamais un champ de charge.
