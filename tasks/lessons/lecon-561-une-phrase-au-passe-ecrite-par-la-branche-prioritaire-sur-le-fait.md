## Leçon 561 — Une phrase au passé écrite par la branche PRIORITAIRE sur le fait porté par l'AUTRE naît fausse, et le devient vraie plus tard

Deux branches vivantes, deux faits liés. #5887 fait SORTIR `apps/web-old-version3`
du dépôt ; #5889 retouche `apps/web-v3/parity.md`, dont une ligne décrit cette
application. L'ordre de merge est décidé : **#5889 d'abord**.

J'ai proposé d'écrire, dans #5889 :

> `apps/web-old-version3` — 48 routes — **sortie du dépôt le 2026-09-09 (#5882)**

C'est faux, et pas « imprécis » : entre le merge de #5889 et celui de #5887, `dev`
sert un arbre où le répertoire **est encore là**, sous une ligne qui déclare qu'il
est parti. L'intervalle n'est pas une abstraction de raisonnement — c'est l'état
que le dépôt sert réellement, à quiconque clone pendant ce temps.

La formulation retenue, proposée par la session qui portait #5889 :

> **quitte le dépôt avec #5882**

Vraie AVANT le merge de #5887 (c'est une promesse tenue par une PR ouverte),
vraie APRÈS (c'est un fait accompli), et impossible à lire comme un état présent.

> **Le test à poser n'est pas « cette phrase sera-t-elle vraie ? » mais « est-elle
> vraie dans CHACUN des deux ordres de merge possibles, ET pendant l'intervalle
> entre les deux ? »** La forme qui survit nomme l'ÉVÉNEMENT et son ISSUE, jamais
> sa date : « quitte le dépôt avec #5882 », pas « sorti le 2026-09-09 ».

CE QUI REND LE DÉFAUT DUR À VOIR. Il n'existe qu'à partir du moment où l'on
CHOISIT un ordre de merge — c'est-à-dire au moment le plus tardif du lot, quand
les deux diffs sont écrits et relus. La phrase était juste tant que les deux PR
étaient symétriques ; c'est la décision d'ordonnancement qui la rend fausse, et
elle ne touche aucune ligne de code. Aucun gate ne peut la voir : elle est dans
un document, et elle est syntaxiquement irréprochable.

C'est le PENDANT, entre branches, de « un corps d'issue est DATÉ, le code non » :
- là, une phrase vraie à l'écriture **vieillit** et devient fausse ;
- ici, une phrase **naît fausse** et le devient vraie plus tard.

Les deux se soignent pareil — dater l'événement par son ISSUE, qui ne bouge pas,
plutôt que par une horloge, qui bouge par rapport à l'arbre servi.

COROLLAIRE POUR TOUTE SESSION QUI COORDONNE — dès qu'on répond « merge celle-ci
en premier », **relire ce que la branche prioritaire AFFIRME du travail de
l'autre.** J'ai donné l'ordre de merge et la mauvaise formulation dans le même
message, sans voir que le premier invalidait la seconde ; c'est la session
d'en face qui l'a attrapé. Un ordre de merge n'est pas qu'un calendrier : il
décide de la vérité des phrases écrites de part et d'autre.

SECOND COROLLAIRE, DU MÊME JOUR ET DE LA MÊME CAUSE — **« relire le fichier pour
choisir le suivant libre » ne tranche que si les deux écrivains partagent le
FICHIER.** Deux sessions se sont donné cette règle pour allouer un numéro de
leçon, chacune l'a appliquée honnêtement, et **les deux ont écrit une 560** :
`dev` s'arrêtait à 559, et le fichier que chacune relisait ne contenait pas les
leçons de l'autre, restées sur sa branche.

C'est le même défaut de raisonnement que ci-dessus, appliqué à un identifiant
plutôt qu'à une phrase : on a traité comme PARTAGÉ un substrat qui ne l'est
qu'après le merge. Une branche non mergée est invisible à la relecture de
l'autre — c'est même sa définition.

Ce qui a tranché n'est pas la relecture mais la règle d'asymétrie du dépôt
(§ « La branche poussée tôt ») : les deux leçons POUSSÉES gardent leurs
numéros, celle qui n'avait pas encore atteint le distant se déplace. Aucune
négociation — la décision se lit depuis ce que git montre.

> **La parade n'est pas de mieux communiquer, c'est de NE PAS ALLOUER.** Un
> titre daté et nommé — « Leçon — `idb ui text` avale un caractère (2026-09-09) »
> — ne collisionne avec rien, et le numéro se pose au merge, quand le substrat
> est enfin commun. C'est le § « un identifiant qui ne s'alloue pas ne
> collisionne pas » (#5102) rejoué sur le seul espace de noms que ce fichier
> possède : sa numérotation.
