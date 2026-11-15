## Leçon 455 — Un témoin d'ALLER-RETOUR est aveugle à toute perte SYMÉTRIQUE, et c'est le golden littéral qui la voit

En livrant le témoin d'exhaustivité du pont v1⇄v3 (#4833), j'ai fait voyager la
forme d'onde d'une note vocale — `[Float]`, ~80 échantillons — avec
`.number(Double($0))`.

Mon témoin neuf est resté **VERT**. Il compare l'objet source encodé en JSON à
l'objet revenu encodé en JSON : `Double(0.2 as Float)` vaut `0.20000000298…`
**des deux côtés**, donc l'égalité tient. Le golden PARTAGÉ, lui, a rougi
immédiatement : il compare à un JSON écrit à la main qui porte `0.2`.

> **Un aller-retour ne peut pas voir une perte que l'aller et le retour
> subissent ÉGALEMENT.** Précision flottante, normalisation de casse, tri, coup
> de rabot sur les espaces, arrondi d'horloge : tout ce qui s'applique aux deux
> côtés s'annule dans la comparaison. Le témoin dit « rien ne se perd » et il a
> raison — *entre lui et lui-même*.

Le correctif n'était pas à écrire : `exactDouble` existait **trois lignes
au-dessus** de ma ligne, avec un doc-comment qui nomme le symptôme mot pour mot —
« `Double(Float(0.6))` vaudrait 0.6000000238… ». Je ne l'ai pas cherché parce que
je ne savais pas avoir un problème.

Deux conséquences de méthode :

1. **Ne jamais retirer un témoin LITTÉRAL sous prétexte qu'un témoin plus
   GÉNÉRAL existe.** Le golden semble redondant devant un témoin d'exhaustivité
   qui couvre toutes les familles ; il ne l'est pas. L'un ancre à une valeur
   ÉCRITE, l'autre à une valeur CALCULÉE — ils ne peuvent pas attraper les mêmes
   défauts. Ici c'est le plus vieux et le plus bête des deux qui a gagné.
2. **Devant un helper nommé `exact…`, `canonical…`, `normalized…` dans un
   fichier, demander CE QU'IL RÉPARE avant d'écrire la conversion naïve à côté.**
   Sa seule existence est la trace d'un défaut déjà payé — et un helper de
   conversion vit rarement loin de la conversion qu'il remplace.
