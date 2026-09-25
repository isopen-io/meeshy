## Leçon 389 — Un `return` muet sert l'échec, l'attente et l'absence dans la même assiette

**Lot #4667 (2026-09-01).** « Le son de bibliothèque ne peut pas être rogné
correctement ! » Le rapatriement existait pourtant, écrit, correct, et il
DÉPOSAIT bien le fichier.

Ce qui manquait n'était pas le code mais ses ÉTATS. La zone « Rogner » se montait
sur `recordedURL != nil && recordedDuration > 0` — deux conditions qui décrivent
l'ARRIVÉE d'un fichier. Un son emprunté n'en a pas tant qu'il n'est pas
téléchargé, et les deux sorties d'échec tenaient en deux mots :
`guard … else { return }` sur la résolution d'URL, `try?` sur le réseau.

Résultat : pendant le téléchargement, sur une URL irrésolue, sur un réseau coupé
et quand il n'y a rien à rogner, l'écran affichait **exactement la même chose** —
rien. Le porteur en a conclu, à raison, que le rognage ne marchait pas.

> C'est la leçon « une erreur avalée en VIDE se lit comme un vide légitime »
> vue depuis l'UI : ce n'est pas seulement le diagnostic qui se perd, c'est le
> VERDICT PRODUIT. L'utilisateur ne dit pas « ça a échoué », il dit « ça n'existe
> pas ».

Le remède n'est pas un drapeau `isLoading` de plus : deux booléens rendent
représentable un état qui n'existe pas (chargement ET échec) et obligent chaque
lecteur à se souvenir de l'ordre dans lequel les interroger. Un type somme
(`AudioTrackAcquisition`) plus une fonction qui traduit l'état en ce que l'écran
rend (`AudioTrimSection.resolve`) donnent quatre cas exclusifs, éprouvables sans
monter d'écran — et le témoin qui compte porte sur l'ORDRE des priorités : une
piste PÉRIMÉE ne doit pas coiffer un rapatriement en cours, sans quoi l'auteur
vise un extrait d'un son qui ne partira pas.
