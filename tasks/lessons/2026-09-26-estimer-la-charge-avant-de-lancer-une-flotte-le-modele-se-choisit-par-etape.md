## Estimer la charge avant de lancer une flotte : le modèle et l'effort se choisissent par étape, jamais par héritage (2026-09-26, #7945)

La passe de simplification iOS a tourné en trois temps : relevé sur 34 lots,
double vérification adverse, puis application en deux workflows d'environ
soixante-dix agents chacun. Les agents d'application étaient sur Sonnet ; les
relecteurs et les correcteurs, eux, **héritaient du modèle de la session — le
plus haut — à l'effort maximal**. Les deux workflows d'application ont consommé
environ 24,7 millions de jetons de sous-agents, la limite d'usage est tombée au
milieu des relectures et vingt-six relectures ou corrections ont échoué. À la
relance, les vingt-deux relectures sont reparties exactement pareil : héritage,
effort maximal, aucune estimation. Le porteur : « estime la charge du travail
pour utiliser les modèles adaptés et être plus économique ».

> **Avant tout appel à Workflow, écrire l'estimation : par étape, le nombre
> d'agents, la taille de chacun (fichiers, constats), et ce que la CI couvre
> déjà. Puis poser `model` ET `effort` par étape.** Barème par défaut :
> haiku pour la pure mécanique (lister, compter, reformater) ; sonnet/medium
> pour une édition bornée dont le patch est écrit ; sonnet/high pour une
> relecture bornée ; opus/high seulement pour un jugement qui traverse
> plusieurs fichiers (jumelles fusionnées d'un fichier à l'autre, arbitrage de
> conception). Une flotte n'hérite jamais du modèle de tête à l'effort maximal.
> Le plan s'écrit dans le workflow (`log()`), pour que le coût se lise avant
> les résultats.

Deux leviers que l'estimation fait apparaître et que l'héritage cache :

1. **Ce que la CI a déjà prouvé réduit la tâche.** Les quinze groupes du
   premier jalon étaient déjà fusionnés, compilés et testés : leur relecture ne
   portait plus que sur le comportement (accessibilité, animations, cas
   nil/vide), un travail borné. Le même prompt « compilation par lecture +
   comportement + témoins » sur du code vert paie deux fois la même preuve.
2. **La taille d'un groupe se mesure avant, pas après.** Un groupe d'un seul
   constat sur un fichier ne mérite pas le même relecteur qu'une jumelle
   fusionnée sur douze fichiers. Le tri (constats × fichiers × part de
   jugement : jumelle, simplification, perf, bug) se fait en dix lignes de
   script sur la liste des groupes.

Mesure de la correction, même jour : vingt-six agents « modèle de tête /
effort maximal » sont devenus quatre opus/high (les quatre fusions de jumelles
multi-fichiers) et vingt-deux sonnet (treize high, neuf medium).
