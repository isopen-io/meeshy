## Leçon 545 — Deux canaux de publication, deux inventaires de ce qui PART

**Contexte** (#5409). Le longpress d'un message ouvrait encore l'ancien atelier.
Le reroutage vers le composer v3 tenait en trois lignes ; ce qui l'avait
empêché pendant plusieurs lots tenait en deux choses, et aucune n'était celle
qui était écrite.

**Ce qui était ÉCRIT.** Un doc-comment justifiait le routage vers l'atelier :
« `ComposerDocumentDraft` n'a ni `mediaIds`, ni fichier, ni lieu ». Faux sur les
trois points depuis #4756. Son JUMEAU, sur une autre porte, disait exactement la
même chose et avait déjà été corrigé — la correction n'avait pas été portée ici.

> Un doc-comment qui EXEMPTE une unité d'une règle se vérifie comme une
> affirmation, pas comme une décision. Et corriger un exemplaire ne corrige pas
> sa jumelle : le commentaire ne documente que le fichier qui le porte
> (leçon 85).

**Ce qui bloquait VRAIMENT.** `documentLocalMedia` — la seule liste que la voie
document téléverse — n'a QU'UN écrivain, l'INTAKE. Une GRAINE va directement au
canvas et saute l'intake. Tant que sa surface était la SCÈNE, cela ne coûtait
rien : le canal scène reçoit tous les actifs chargés. La voie DOCUMENT ne les
voit pas.

> **Deux canaux de publication ⇒ deux inventaires de ce qui part.** Un média peut
> être posé sur le canvas, visible à l'écran, décrit dans le blob publié — et
> n'avoir aucun TÉLÉVERSEUR. Rien ne rougit : le canvas est juste, c'est la
> publication qui est vide.

C'est la forme exacte de la leçon 543 (#5406) sur un autre étage : un champ
parfaitement produit, qu'aucun chemin ne fait voyager. **La question à poser à
tout contenu composé n'est pas « est-il correct ? » mais « par quel canal
part-il, et ce canal le connaît-il ? ».**

**La jumelle avait déjà le défaut, en production.** Une autre porte montait déjà
la surface document AVEC une graine et publiait pour de bon : partager une image
depuis une autre app puis publier en POST perdait l'image. Elle n'a pas été
trouvée en cherchant le bug — elle est tombée en posant la question ci-dessus à
tous les monteurs de graine.
