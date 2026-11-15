## Leçon 439 — Deux protections INDÉPENDANTES chez deux hôtes différents, et il en faut DEUX : trois façons d'échouer, une seule de réussir

**Le fait (2026-09-02).** Le `content` d'une story est tantôt une légende
d'auteur, tantôt un index de recherche que la passerelle dérive de la
concaténation des overlays. Pour qu'un lecteur ne rende pas le texte deux fois,
il lui faut **deux** choses, écrites chez **deux hôtes différents** :

- le **prédicat** qui distingue index et légende — il vit au *gateway*
  (`isContentDerivedFromTextObjects`) ;
- le **repli de clé** `text` / alias legacy `content` sur l'overlay — il vit
  dans le *décodeur SDK iOS* (`StoryModels.swift:460`).

| ce que le client a | résultat |
|---|---|
| ni l'un ni l'autre | doublon |
| le repli, pas le prédicat | doublon |
| **le prédicat, pas le repli** | **croit avoir corrigé, n'a rien corrigé** |
| les deux | correct |

La troisième ligne est la dangereuse : la comparaison porte alors sur une
concaténation VIDE, rend « ce n'est pas un index », donc « c'est une vraie
légende » — et le doublon survit **sous une garde qui a l'air posée**.

> Quand une correction exige deux mécanismes situés chez deux propriétaires,
> énumérer les combinaisons AVANT d'écrire la garde. Celle qui « corrige à
> moitié » est toujours celle qui ne rougit pas.

**Mesuré sur les trois clients, trois erreurs différentes** : iOS ne pose pas
la question ; Android non plus, et rend l'index AU CENTRE, là où l'objet vit
déjà ; le web a une garde — mais son critère est un PROXY, `isCanvasV3` au lieu
de « ce contenu est-il dérivé ? ». Le proxy se trompe dans les DEUX sens : une
story v1 avec overlays porte quand même un index (doublon), et une story v3
peut porter une vraie légende, que le web TAIT (perte de contenu).

> **Un proxy n'est pas une garde.** Il répond à une question voisine, et sa
> justesse tient tant que les deux questions coïncident. Le jour où elles
> divergent, il se trompe dans les deux sens à la fois — et le sens qui PERD du
> contenu est plus grave que celui qui en montre trop.

**La cause racine n'est pas une garde manquante, c'est un champ qui ne dit pas
qui l'a écrit.** `content` porte sa valeur, jamais sa PROVENANCE. Une
redéduction côté client marche, mais elle est facultative (l'oublier ne rougit
pas), fragile (séparateur, clé, `trim`) et ambiguë (une légende égale à la
concaténation est indécidable). Le doublon n'est qu'un symptôme : le prochain
sera un aperçu de liste, un digest, un partage externe. Issue de contrat
ouverte (#4846) plutôt qu'un troisième correctif de vue.

**Et le fail-safe n'est pas symétrique.** Overlays absents, concaténation non
reconstituable ⇒ le verdict est « vraie légende », donc on AFFICHE. Montrer un
doublon est laid ; taire la légende d'un auteur est une perte de contenu. *Une
garde qui hésite tombe du côté où l'on ne perd rien* — formulation d'une
session voisine, adoptée.
