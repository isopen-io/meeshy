## La PORTÉE d'un cliquet est une affirmation, et c'est celle que personne ne relit (2026-11-20, cycle 194, #20091)

### Le fait

Le cliquet de #16690 tient une loi de confidentialité — « une audience de
DIFFUSION lit la participation VIVANTE, jamais `isActive` NU ». Il était vert.
Son balayage partait de `path.resolve(__dirname, '..')`, soit `src/socketio/`.

Mesuré en lançant **son propre classifieur** sur `src/` : 15 audiences dans
`socketio/` (13 conformes, 2 déclarées larges), et **51 au dehors, dont 50
nues**. La propriété tenait sur 13 sites ; le cliquet l'affirmait de
l'ensemble — et l'un des 50 était l'annuaire des appareils qui reçoivent les
enveloppes chiffrées.

### La règle

La leçon 261 dit qu'une énumération porte deux affirmations : « ces sites
respectent la règle » et « ce sont les sites où la règle s'applique ». Appliquée
à un INVENTAIRE, la seconde se relit : c'est une liste, elle a l'air d'une
liste, on peut la compter.

**Appliquée à une PORTÉE, elle ne se relit jamais** — parce que ce n'est pas une
liste, c'est un chemin. `path.resolve(__dirname, '..')` ne ressemble pas à une
affirmation sur le dépôt ; ça ressemble à de la plomberie.

> Devant tout cliquet, poser la question en DEUX temps : « qu'est-ce qu'il
> vérifie ? » **et** « où regarde-t-il ? ». La seconde se répond en lançant son
> balayage sur une racine plus large et en comparant les comptes — c'est une
> commande, pas une relecture.

### Le corollaire : la cécité de SYNTAXE, composée avec celle de portée

Le même balayage exigeait `participant.findMany({ where: {` d'affilée. **28 des
215 lectures de `Participant` du dépôt lui échappaient par la seule forme de
leur appel** — un `select` écrit avant le `where` suffisait, et `groupBy`
n'était pas lu. Deux de ces 28 vivaient dans son propre répertoire : invisibles
même avant l'élargissement.

Deux cécités, deux raisons différentes de rester vert, et **aucune des deux ne
ressemble à un trou** : l'une est un chemin, l'autre une expression régulière.
Élargir la portée sans corriger la syntaxe aurait produit un cliquet plus large
et toujours menteur, avec l'autorité d'un lot qui vient de le vérifier.

### Ce qu'on fait quand la mesure rend 50 sites

On ne les range pas tous dans l'inventaire des exemptions. `DELIBERATELY_WIDE`
dit « ce site DOIT être large » : y verser 50 lignes rend le cliquet vert en
affirmant 50 fois une décision que personne n'a prise. Un second inventaire,
`MEASURED_NOT_INSTRUCTED`, dit l'autre phrase — « on ne sait pas encore ce que
ce site décide » — avec sa famille et son issue, et trois témoins le tiennent :
les deux inventaires sont DISJOINTS, chaque ligne désigne encore un site, et la
dette ne grossit pas.

> **« Décidé large » et « pas encore instruit » ne sont pas la même phrase, et
> les confondre est ce qui transforme une dette en autorisation.** Quand les
> deux cohabitent dans un seul inventaire, on lira toujours « décidé ».
