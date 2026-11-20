## Nier un filtre écrit pour être lu POSITIVEMENT réveille le piège que sa forme positive avait fermé — et son complément déclaré vaut mieux que de mesurer la négation (2026-11-19, #19905)

**Contexte.** `mostRecentSharedConversation` (la destination de la copie vocale d'un
talkie qui ne passe pas) bornait ses candidates par
`{ …, deletedAt: null, NOT: SERVER_BLIND_REGIME_FILTER }`. Les deux clauses exigent,
sous MongoDB, la clé PRÉSENTE. Aucun chemin de création n'écrivant
`Conversation.deletedAt` — son unique écrivain du dépôt pose une DATE à la mise au
rebut, jamais `null` — la première écartait **toute conversation vivante** : la
fonction rendait `null` pour tout le monde, l'émetteur enregistrait sa voix pour
rien, sans erreur ni trace. Le défaut est fail-closed, donc muet, donc immortel.

**Ce que ce cas ajoute à la leçon 318.** Celle-là porte sur l'ÉGALITÉ nue
(`champ: null`), qu'on reconnaît à sa graphie et qu'un cliquet sait balayer. La
seconde clause n'avait pas cette graphie : elle était une NÉGATION d'un prédicat
canonique, importé, correct — et `SERVER_BLIND_REGIME_FILTER` est justement écrit
pour fermer ce piège. Son doc-comment le dit mot pour mot : *« écrit sans négation
de document : un champ absent n'y entre jamais »*. Ce site était le SEUL du dépôt à
le NIER, et la négation annulait exactement la propriété pour laquelle il avait été
écrit ainsi.

> **Un prédicat positif est une AFFIRMATION sur la forme qu'il prend, pas sur le
> sens qu'il porte.** Le nier conserve le sens et détruit la forme — donc
> l'exactitude sur les clés absentes — sans qu'aucune graphie ne change au site qui
> le nie. Devant tout `NOT: <CONSTANTE_IMPORTÉE>`, la question n'est pas « ce que
> cette constante veut dire est-il le contraire de ce que je veux ? » (ici oui),
> mais **« cette constante a-t-elle été écrite pour être lue dans ce sens-là ? »**

**Le correctif qui vaut mieux qu'une mesure.** La tentation était de mesurer ce que
Prisma fait d'un `NOT` englobant un `AND` de trois conditions contre un document
sans la clé. Mesure impossible ici (ni MongoDB ni démon Docker dans le conteneur),
et surtout inutile : le complément EXACT du filtre est déclaré dans le même
fichier, `SERVER_READABLE_REGIME_FILTER`, qui dit l'absence dans une branche
(`isSet: false`). `NOT BLIND ≡ READABLE` par construction — les deux listes sont
complémentaires sur tous les documents — donc la substitution ne change rien à ce
qui est retenu **et retire la question**. Une forme positive n'a pas de sémantique
de négation à connaître. Quand une incertitude porte sur le comportement d'un
opérateur, chercher d'abord la formulation qui ne l'emploie pas : c'est moins cher
qu'une mesure, et ça ne se périme pas.

**Pourquoi les témoins voisins ne pouvaient pas tomber.** Les fixtures de #19835 —
posées la veille, sur la MÊME fonction — portaient `deletedAt: null` et
`encryptionMode: null` explicitement, avec un commentaire qui l'expliquait :
*« sur MongoDB, `{ champ: null }` est une ÉGALITÉ »*. La phrase est vraie, et c'est
elle qui a rendu la fixture fausse : **connaître le piège a servi à faire PASSER les
témoins, pas à les faire tomber.** Un document de test qui porte les clés pour que
le filtre les trouve atteste un monde où le défaut n'existe pas. La fixture d'une
règle de présence de clé se construit donc sur la forme que la PRODUCTION écrit —
ici : ni l'une ni l'autre — et jamais sur celle qui fait passer la requête.

**Mesure du lot.** Chaque moitié du correctif, rétablie seule, fait tomber 6 des 10
témoins. `tsc` 0 erreur, 1517 tests verts sur les quatre familles touchées.
