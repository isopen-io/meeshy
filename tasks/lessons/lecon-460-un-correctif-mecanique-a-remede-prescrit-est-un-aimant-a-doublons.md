## Leçon 460 — Un correctif MÉCANIQUE à remède prescrit est un aimant à doublons : annoncer AVANT, pas après

`dev` était rouge sur deux cliquets de fichiers générés. Le message d'erreur
portait lui-même le remède :

    Régénérer avec : cd packages/shared && npm run api-endpoints:generate

Je l'ai lancé, vérifié, poussé, PUIS annoncé. Une autre session avait fait
exactement la même chose : `4fb503a054` et `6a031381fa`, deux commits distincts,
**mêmes deux fichiers, mêmes cinq insertions, diff identique à l'octet**.

Aucun dégât — git a reconnu deux changements identiques comme un seul et n'a rien
dupliqué (contrairement à
[[feedback_automerge_duplicates_identical_import_no_conflict]], où la même
insertion à des positions différentes s'était doublée). Mais le travail, lui, a
été fait deux fois.

> **Plus un correctif est mécanique, plus il est probable que quelqu'un d'autre
> le fasse en même temps.** Un défaut qui demande du jugement ne sera repris par
> personne sans se coordonner ; un défaut dont le message d'erreur DICTE la
> commande sera repris par la première session qui le voit. La règle
> s'inverse donc : pour un correctif difficile, annoncer après suffit ; pour un
> correctif évident, **annoncer d'abord**.

Corollaire de forme : dans un dépôt à N sessions, un rouge de fichier GÉNÉRÉ est
le cas le plus probable de duplication — le remède est prescrit, il est rapide, et
il ne demande aucune connaissance du lot fautif.
