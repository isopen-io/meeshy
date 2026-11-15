## Leçon 391 — Une garantie de présentation qui repose sur « l'item a changé » ne tient pas quand l'item n'a pas de charge

**Lot #4684 (2026-09-01).** Un agent de vérification observe UNE fois, sans le
reproduire, que rouvrir un son de FOND affiche le commutateur sur « Contenu de
publication » — et que valider sans rien changer DÉPLACE le son vers le contenu.
Silencieux, destructeur, et non reproductible en trois tentatives.

Ce qui l'a nommé n'est pas le code mais une CAPTURE : la feuille fautive rendait
la carte d'après-enregistrement (coche verte, durée en grand) là où les trois
reproductions rendent la carte de réouverture. **Ce n'était pas la même feuille.**
C'était la précédente, re-présentée avec son `@State`.

`.sheet(item: $portail)` reconstruit son contenu quand l'ITEM change. Deux
ouvertures successives portent la même valeur — un cas d'énumération sans charge
associée — donc SwiftUI est en droit de réutiliser la vue.

> Un type somme sans charge rend deux ÉVÉNEMENTS distincts indiscernables. La
> valeur dit « quelle feuille », jamais « quelle ouverture ». Tout ce que la
> feuille apprend d'une session survit alors à la suivante.

Deux remèdes, et le second est celui qui dure : une identité renouvelée par
ouverture (`.id(UUID())` posé à l'ouverture) rend la réutilisation impossible ;
et **un site UNIQUE d'ouverture** rend l'inventaire structurel — quatre entrées
posaient chacune leurs deux lignes, un cinquième site aurait oublié la
troisième sans qu'aucun témoin ne rougisse, le défaut ne se voyant qu'à la
SECONDE ouverture.

Corollaire de méthode : **un défaut vu une fois et non reproduit n'est pas un
défaut à classer « à surveiller »** dès lors que son mécanisme s'explique. Ici
l'explication était dans l'image, pas dans la pile — et elle suffisait à écrire
une garantie de structure.
