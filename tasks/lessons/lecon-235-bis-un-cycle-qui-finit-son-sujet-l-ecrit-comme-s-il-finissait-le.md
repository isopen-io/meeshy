## Leçon 235 bis — Un cycle qui finit SON SUJET l'écrit comme s'il finissait le FICHIER (cycle 68)

> « bis » : trois passes concurrentes ont numéroté 235 le même jour. Celle qui
> a atteint `main` la première garde le numéro nu ; celle-ci prend le suffixe.
> Même geste que pour la 234 bis et le dossier `cycle68-bis` — renommer plutôt
> que renuméroter en cascade à travers des branches vivantes.

Le cycle 35 a corrigé l'invalidation des traductions sur les quatre transports
d'ÉDITION, et a laissé dans `routes/messages.ts` cette phrase :

> `translations: null` appartient à CETTE écriture, pas à une seconde plus bas […]
> Les trois autres transports d'édition invalident déjà dans l'écriture du
> contenu ; **celui-ci était le dernier à ne pas le faire.**

Exact, et trompeur. « Le dernier » vaut pour la famille ÉDITION. Trois cents
lignes plus bas, dans le MÊME fichier, la route de SUPPRESSION portait le même
défaut — deux écritures séparées, `translations: null` puis `deletedAt` — et
personne n'y est revenu.

> **Une note de clôture porte toujours un périmètre implicite, et c'est celui du
> cycle qui l'écrit, pas celui du fichier qui la reçoit.** Écrire « le dernier »,
> « tous les autres le font déjà », « la famille est complète » sans NOMMER la
> famille produit une preuve d'exhaustivité que la lecture suivante applique au
> mauvais ensemble. Nommer : « le dernier des quatre transports d'ÉDITION ».
> Et devant une telle note, ne jamais la lire comme un quitus : demander de
> quelle famille elle parle, puis chercher les familles VOISINES du même fichier.

### Le corollaire opératoire : le correctif était déjà écrit, à côté

Le plus frappant n'est pas que le défaut ait duré — c'est que **son argument, son
raisonnement et sa formulation existaient déjà dans les deux fichiers
concernés**, sur la route voisine. Aucune découverte n'était nécessaire : il
fallait relire ce que le fichier disait déjà, en se demandant à quoi d'autre
cela s'appliquait.

> Quand un fichier explique longuement POURQUOI une écriture doit être atomique,
> passer cet argument aux autres écritures du même fichier est le geste le moins
> cher du dépôt — et celui que personne ne fait, parce qu'un argument déjà écrit
> se lit comme un problème déjà réglé.

### Le vrai prix d'une écriture en deux temps n'est pas la fenêtre, c'est son échec

Le réflexe est de mesurer la fenêtre (« quelques millisecondes, un lecteur
concurrent au pire »). C'est le petit prix. Le grand est l'ÉCHEC de la seconde
écriture, qui fige l'état intermédiaire **définitivement** — ici : un message
vivant, sans aucune traduction, que rien ne recalcule (le dépôt l'écrit :
« aucun chemin ne retente une traduction absente »).

> Devant deux écritures séparées, poser les deux questions dans cet ordre :
> *que voit un lecteur DANS la fenêtre* (souvent bénin) et *que reste-t-il si la
> seconde n'a JAMAIS lieu* (souvent irréversible). La seconde décide.

Corollaire d'ordonnancement, déjà présent ailleurs dans le dépôt (« Échouer ICI
laisse le lien ACTIF : c'est le sens sûr ») : **l'écriture destructrice ne
committe jamais en premier.** Et quand les deux peuvent tenir dans un seul
`update`, fusionner ne choisit pas un meilleur ordre — il supprime la question.

### Une garde qui compte des écritures décrit une FORME ; préférer l'état interdit

La garde évidente est « exactement UN `update` ». Elle tombe bien sous la
réintroduction du défaut, mais elle décrit une forme : un refactor qui repasserait
à deux écritures dans l'ORDRE INVERSE la satisferait encore sur la première.

La garde qui porte la propriété rejoue les écritures sur une ligne modèle et
INTERDIT l'état intermédiaire — ici « vivante ET sans traductions ». Les deux ont
été livrées ; seule la seconde survit à un réordonnancement.

### La famille « aveux du dépôt » (Leçon 234) rend des candidats, pas des verdicts

Premier candidat instruit ce cycle : `node-signal-stores.ts`, « TODO: Replace
with database persistence for production », **zéro consommateur dans tout le
dépôt**. Du code mort, en apparence — et il ne fallait PAS le supprimer : il
appartient à un chantier ÉTAGÉ (`dma-interoperability/`, jalons « Phase 3 »
explicites chez ses voisins), pendant que le chiffrement de production passe
ailleurs.

> Un aveu VÉRIDIQUE sur un travail étagé n'est pas une dette. Pour chaque aveu,
> trancher d'abord : est-ce un OUBLI ou un JALON ? Zéro consommateur prouve que
> le code n'est pas branché — jamais qu'il est abandonné.
---
---
