## La ligne de base d'une PR est la TÊTE de sa base, pas le dernier verdict archivé (cycle 141)

**Issues** : #16720, #16722 (fermée aussitôt), #16714 (le correctif que je n'ai pas vu)

La CI des PR étant gelée (`vars.PR_CI_GEL`), la preuve d'une branche passe par
`workflow_dispatch`. Celui du cycle 141 a rendu huit rouges. Pour décider
lesquels étaient miens, j'ai confronté ma branche au dernier run `dev`
**complété** — et j'ai écarté le run `dev` **en cours** comme non concluant,
en invoquant la règle du dépôt « un relevé pris sur un run inachevé n'est pas
un verdict ».

C'est ce run-là qui portait la réponse. `dev` était passé à `d367563cc`
(« épingle ubuntu-24.04 », #16714) et son run était **intégralement vert**.

J'ai donc affirmé deux fois, publiquement et avec des tableaux à l'appui :
que cinq témoins vidéo et six suites de codecs d'image étaient « la ligne de
base durable de `dev` », et qu'« aucun correctif n'existe aujourd'hui dans le
dépôt ». Les deux étaient faux depuis deux merges.

> **Un run complété vieux de deux merges décrit un `dev` qui n'existe plus.**
> La règle « un run inachevé n'est pas un verdict » dit de ne pas CONCLURE d'un
> run en cours ; elle ne dit pas de se rabattre sur le dernier verdict archivé.
> La ligne de base d'une PR est l'**état courant de sa base** : `git log
> origin/dev`, les branches `claude/*` ouvertes, les PR récemment fusionnées —
> pas le dernier résultat de CI qu'on sait lire.

Le prix, en plus des deux commentaires faux : une issue (#16722) ouverte pour un
défaut déjà réparé, et un cycle entier passé à construire une explication
(« capacité du conteneur ») pour des rouges qui avaient une cause et un
correctif.

### Et j'ai SUR-corrigé, ce qui est la même faute dans l'autre sens

La première version de cette leçon accusait les cycles précédents : « ce que
plusieurs cycles avaient consigné comme *les rouges de codecs d'image, capacité
libvips du conteneur, verts en CI* était une image de runner qui avait bougé ».

**Faux, et mesuré faux.** Le run de CI sous l'épingle `ubuntu-24.04` rend les
trois tranches `Tests · gateway` VERTES — or les six suites de codecs d'image
vivent dans la passerelle. Leur verdict en CI est donc bien VERT, exactement ce
que les cycles précédents avaient écrit. Leur rouge en LOCAL est bien une
capacité absente de ce conteneur de développement. **Les deux moitiés de leur
phrase étaient justes.**

Ce qui était faux était uniquement MON attribution : j'ai pris les rouges
observés en CI sous Ubuntu 26.04 et je les ai expliqués par leur cause locale,
qui n'avait rien à y voir. Deux causes distinctes produisaient le même nom de
suite en échec, et j'ai fusionné les deux.

> **Corriger une erreur en accusant la mesure d'un autre demande la même preuve
> que l'erreur elle-même.** Une sur-correction se lit comme de la rigueur — elle
> a le ton de quelqu'un qui vient de vérifier — et elle salit un relevé juste
> dans un registre permanent. Avant de réécrire le constat d'un cycle
> précédent : le MESURER, pas seulement constater qu'il ne colle pas à ce que je
> viens de voir.

La leçon de MÉTHODE sur la ligne de base (ci-dessus) tient entièrement. C'est sa
généralisation en amont qui était de trop.

Deux réflexes qui l'attrapent, et le second est le vrai :

- avant de déclarer qu'un rouge n'est pas le sien, lire la TÊTE de la base, pas
  son dernier run archivé ;
- avant de déclarer qu'aucun correctif n'existe, chercher les branches et les PR
  qui le portent peut-être déjà — sur un dépôt où plusieurs sessions travaillent
  en parallèle, « je n'en vois pas » n'est pas « il n'y en a pas ».
