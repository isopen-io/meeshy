## Leçon 570 — Un opt-in porté par le commit de TÊTE se retire tout seul dès qu'on pousse autre chose derrière

2026-09-11, iOS (#6071). J'ai écrit le lot avec « — run test » au sujet,
précisément pour que la suite iOS complète tourne sur la PR. Puis j'ai poussé,
dans la même PR, un commit `docs(lessons): …` sans mot-clé.

Le job s'est appelé **« Build app (app + cibles de test) »** — la portée
compile-seule. L'adhésion avait disparu, et rien ne l'a signalé : il n'y a
aucun avertissement à donner, le workflow a fait exactement ce qui est écrit
dans son doc-comment :

> *« Le sujet est lu sur le commit de TÊTE de la branche. »*

> **Un opt-in porté par le commit de tête n'est pas une propriété de la PR :
> c'est une propriété du DERNIER commit poussé.** Tout ce qu'on ajoute ensuite
> le retire — et ce qu'on ajoute après coup est, par construction, ce qui a
> l'air le moins risqué : une correction de commentaire, une leçon, un
> `.gitignore`. Le commit qui annule la vérification est celui dont on est le
> plus sûr.

**Troisième forme, constatée deux heures plus tard dans la même session, et la
plus insidieuse des trois : METTRE SA BRANCHE À JOUR suffit.** `git merge dev`
crée un commit dont le sujet est « Merge origin/dev into <branche> » — aucun
mot-clé, et il devient la tête. On n'a rien poussé de neuf ; on a seulement
intégré `dev`, c'est-à-dire fait exactement ce qu'on demande à un lot avant de
le fusionner. La PR retombe en compile-seule au moment précis où elle contient
le plus de code qu'elle n'a jamais testé — celui des lots qu'on vient
d'intégrer.

> Les trois formes ont la même racine : **l'adhésion est portée par le SUJET du
> dernier commit, et le dernier commit d'une branche saine est presque toujours
> un commit qu'on n'a pas rédigé pour lui-même** — une leçon, un correctif de
> commentaire, un merge de mise à jour.

Parades, dans l'ordre de fiabilité :

1. mettre le mot-clé au sujet de **chaque** commit d'un lot qui en a besoin —
   coûteux à écrire, mais insensible à l'ordre ;
2. vérifier le NOM DU JOB après chaque poussée (« Build app + tests unitaires »
   = la suite tourne ; « Build app (app + cibles de test) » = elle ne tourne
   pas). Le nom dit la portée, c'est fait pour ;
3. ne rien pousser après le commit porteur — une discipline, donc la plus
   fragile des trois.

Corollaire pour #6065 : une levée automatique sur le DIFF n'aurait pas ce
défaut, puisqu'un commit de documentation ne change pas le diff iOS de la PR.
C'est un argument de plus pour la lever sur ce que la PR TOUCHE plutôt que sur
ce que son dernier sujet DIT.
