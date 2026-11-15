## Leçon 457 — Un run CIBLÉ prouve ce qu'il nomme, et rien d'autre : les deux régressions étaient dans les suites auxquelles je n'avais pas pensé

La suite SDK complète prend ~31 min et se fait tuer vers ~20 min en tâche de
fond. Je me suis donc rabattu, toute la journée, sur des runs `-only-testing`
ciblés — adaptation rationnelle à une contrainte réelle, et qui a changé en
silence le sens du mot « vert » : **vert sur ce que j'ai pensé à nommer.**

La CI, qui exécute tout, a rendu **2 échecs sur 9 251**. Les deux étaient à moi,
et — c'est le point — **aucun des deux n'était atteignable par le raisonnement
« quels tests couvrent le code que j'ai changé ? »** :

| échec | ce qui l'a déclenché |
|---|---|
| `Plan2DIntegrationGuardTests…sdkTargetIncluded` | un **DOC-COMMENT** nommant `Plan2DLayout` depuis la cible core. Aucun chemin d'exécution, aucun symbole : du texte |
| `StoryDraftStoreTests…losesNoRuntimeField` | une attente qui encodait un **CONSTAT DATÉ** que mon lot venait de rendre faux |

Le premier ne suit aucun appel ; le second suit une donnée que je n'avais pas
touchée, dans un fichier que je n'avais pas ouvert. Une liste de suites dérivée
du diff ne pouvait contenir ni l'un ni l'autre.

> **La suite complète n'est pas une formalité de fin : c'est le seul endroit où
> les témoins auxquels on n'a pas pensé peuvent parler.** Quand elle ne tient
> pas dans la fenêtre disponible, la parade n'est pas de s'en passer — c'est de
> la faire tourner ailleurs (la CI) ET d'attendre son verdict avant de dire
> qu'un lot est vert. Dire « vert » sur des runs ciblés, c'est déclarer un
> résultat qu'on n'a pas mesuré.

Corollaire de forme : une garde de SOURCE ne se déclenche sur aucun symbole. Un
commentaire qui nomme un type d'une couche supérieure depuis une couche
inférieure est **la première marche** de la violation qu'elle interdit — celle
qui ne rougit ni au compilateur ni à l'exécution. La nommer en commentaire n'est
pas anodin : c'est ainsi qu'un lot suivant croit l'import légitime.
