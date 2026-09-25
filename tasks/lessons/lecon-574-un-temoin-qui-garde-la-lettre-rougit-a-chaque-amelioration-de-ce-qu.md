## Leçon 574 — Un témoin qui garde la LETTRE rougit à chaque amélioration de ce qu'il garde

2026-09-11, iOS (#6078). Les huit rouges hérités de la suite iOS, diagnostiqués
un par un : **sept ne sont pas des défauts de code.** Ce sont des témoins de
SOURCE qui exigeaient une chaîne précise, et que le code a quittée en
s'améliorant — une composition alpha corrigée, une galerie centralisée en un
site unique, un fichier découpé (le `private` tombe : Swift ne le rend visible
qu'aux extensions du même fichier), une bande de médias remplacée par un rail
de slides, une adresse par URL devenue une adresse par index.

> Un témoin qui épingle `contains("case.contentCard:documentLocalMedia.append(")`
> ne garde pas une règle : il garde une IMPLÉMENTATION. Il s'engage à rougir
> le jour où quelqu'un fait mieux — et il rougit alors **contre** le progrès,
> en désignant comme fautif le lot qui a amélioré la forme.

Le geste juste n'est pas de « réparer le test » ni de le supprimer, mais de
**retrouver la règle qu'il voulait tenir et de la réécrire sur le porteur
actuel**. Trois précautions apprises dans ce lot :

1. **Vérifier que la capacité existe encore avant de réécrire.** Le témoin de
   la bande avertissait lui-même qu'une réparation naïve rouvrirait le défaut
   qu'il fermait. J'ai donc cherché les trois capacités chez le rail
   (recevoir sans amender, peindre un élément, en retirer un) AVANT de
   toucher à la moindre assertion.
2. **Recalculer les valeurs, ne jamais les recopier depuis le rapport
   d'échec.** Le contraste attendu passait de 2,70 à 3,04 : j'ai refait la
   composition source-over et les luminances WCAG à la main plutôt que de
   coller le nombre que la machine affichait. Une valeur copiée d'un rouge est
   une valeur non vérifiée — et si la formule avait été FAUSSE, la recopier
   aurait gravé le défaut dans le témoin.
3. **Ajouter l'interdiction de la forme abandonnée** quand on réécrit, sinon
   on échange un rouge contre un trou.

Et la cause systémique vaut d'être dite : sept témoins ne peuvent pas dériver
ensemble par négligence individuelle. Ils dérivent parce que **la suite iOS ne
tourne ni sur `dev` ni sur les PR sans mot-clé** : un témoin cassé n'est vu par
personne pendant des semaines, et le lot qui l'a cassé est parti depuis
longtemps. C'est #6065, mesuré une fois de plus.
