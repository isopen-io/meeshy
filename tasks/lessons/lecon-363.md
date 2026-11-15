## Leçon 363

**« `Closes #n` » n'est inerte que sur une branche qui n'est PAS la branche par
défaut — et ici la branche par défaut est `dev`.**

Consigne de nuit, sans ambiguïté : *« Tu ne fermes JAMAIS une issue. »* Le rôle
est de livrer, faire verdir la CI, poser `to-integrate` et un commentaire de
relais ; c'est le porteur qui intègre et qui ferme.

Convention du dépôt, tout aussi explicite (`CLAUDE.md` racine, § Pilotage) :
*« L'issue **fermée** par le commit qui la livre (`Closes #n`) »*.

J'ai suivi la seconde sans voir qu'elle contredisait la première, parce que je
portais une hypothèse jamais vérifiée : *une poussée sur une branche de travail
ne ferme rien, l'auto-fermeture ne joue que sur `main`*. La prémisse est juste ;
son application était fausse. `git remote show origin` rend **`HEAD branch:
dev`** — la branche sur laquelle je pousse EST la branche par défaut.

Quatre issues fermées sans revue : #4416, #4439 (18:48:55) et #4495, #4496
(22:04:42). Le témoin était pourtant lisible dans la charge de l'API :
`closed_at` à la seconde EXACTE de la poussée, et `closed_by` = le compte qui
pousse, pas un relecteur.

> **Une convention de message de commit est une action, pas une annotation.**
> Avant de l'employer, demander sur quelle branche elle s'exécute, et si cette
> branche est celle que le dépôt tient pour défaut. La vérification tient en
> une commande ; l'hypothèse a tenu quinze commits.

Ce qui rend le défaut coûteux n'est pas la fermeture elle-même — elle se défait
d'un clic — mais **ce qu'elle AFFIRME** : une issue marquée `completed` dit que
le travail est livré et vérifié. Or ces quatre issues ont été fermées pendant
que la CI n'avait rendu **aucun verdict** depuis sept heures (#4395 annulait,
#4526 rougissait). La fermeture a donc affirmé plus que ce qui était mesuré —
exactement ce que le protocole `to-integrate` existe pour empêcher.

Réparation : les quatre rouvertes, chacune avec le mécanisme écrit dans un
commentaire, et `Refs #n` à la place de `Closes #n` pour la suite.

**Forme générale, à rapprocher de la leçon 275** (*une protection se mesure sur
tout ce que la charge TRANSPORTE*) : ici, ce qui partait à côté du code n'était
pas une donnée mais un EFFET DE BORD DE PLATEFORME. La question à poser à tout
commit n'est donc pas seulement « que contient-il ? » mais **« qu'est-ce que sa
poussée DÉCLENCHE ? »** — hooks, auto-fermetures, workflows, étiquettes. Un
message de commit est la seule partie du diff qui s'exécute ailleurs.
