## Leçon 371 — Un COMPTE recopié dans un second témoin est une jumelle qu'on ne peut pas déduire du premier

`dev` rouge le 2026-08-31 à 07:37, par ma poussée. Un seul échec sur **1079 suites
et 22 138 tests** :

```
● ROUTE_TABLE compte désormais 61 entrées (60 + `me-consents`, #4348)
    Expected: 61   Received: 62
```

Le lot de #3734 ajoutait une route, donc une entrée à `ROUTE_TABLE`. Il avait
bien mis à jour le canary — celui de `route-registration-table.test.ts`, que le
commentaire du second fichier désigne lui-même comme **la référence**. Le second,
dans `me-categories-canonical-address.test.ts`, en tient une COPIE pour son
propre récit d'adjacence, et se décrit comme telle :

> « ce fichier-ci n'en garde qu'une COPIE ponctuelle, propre à son propre récit
> d'adjacence `me-permissions`/`me-categories` »

**Rien dans la ligne qu'on édite ne permet de deviner que l'autre existe.** C'est
la propriété qui rend ce défaut différent d'un oubli ordinaire : le sous-agent
n'a pas été négligent, il a corrigé le site que son territoire et ses voisins
lui montraient. Un compte n'a pas d'appelants ; on ne le trouve pas en cherchant
« qui utilise ceci ».

> **Deux témoins qui comptent la MÊME grandeur dans deux fichiers sont une
> jumelle divergente**, au même titre que deux implémentations d'une règle. Celui
> qu'on n'édite pas devient rouge, et sa mise à jour ne se déduit pas de l'autre.
> La parade n'est pas « chercher les copies » — c'est de n'avoir qu'un site, ou
> de retirer le TOTAL du témoin qui n'en a pas besoin : un récit d'adjacence se
> raconte avec deux index voisins, jamais avec la longueur du tableau.

Ce que la mesure dit du DISPOSITIF, et c'est le vrai enseignement :

1. **Les gates d'un sous-agent ne peuvent pas attraper ça, par construction.**
   Ils sont cadrés sur son territoire et ses voisins immédiats — c'est ce qui les
   rend rapides et c'est la bonne règle. Le fichier fautif n'y figure pas.
2. **Seule la suite COMPLÈTE l'a vu**, ce qui justifie son coût (8 à 12 min) —
   mais elle l'a vu **après la poussée**, parce que je l'avais lancée en parallèle
   du `push` pour ne pas sérialiser deux attentes.
3. Le raisonnement qui m'y a conduit était pourtant juste sur ses prémisses : les
   suites ciblées étaient vertes, `tsc` vert, les cliquets de manifeste verts.
   **Un ensemble de contrôles verts ne borne que ce qu'ils regardent** (leçon 365
   à nouveau) — et aucun d'eux ne regardait ce fichier.

Parade retenue, faute de pouvoir supprimer la copie dans ce lot : quand un lot
touche `routes/index.ts`, la suite complète tourne **avant** la poussée, pas à
côté. Le gain de parallélisme ne vaut pas un `dev` rouge de vingt minutes, et il
est nul de toute façon quand la CI ne conclut pas (#4395).
