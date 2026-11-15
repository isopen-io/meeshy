## Leçon 353 — Un conteneur SANS taille intrinsèque ne se dimensionne pas par la mesure de ce qu'il contient

Le carrousel de la vue `3f` (`FeedPostCardCarousel`) a échoué **deux fois** à se
donner une hauteur, et les deux échecs partagent une cause que le symptôme
cachait : **`TabView` n'a aucune taille intrinsèque**, alors que les deux
mécanismes essayés supposent que la vue en a une.

1. **Un `GeometryReader` maison** en `.background` + `@State`, recopié de
   `FittedMediaHeight` **sans le `.frame(maxWidth: .infinity)` qui le précède
   dans l'original**. Sans lui, la largeur reste la dimension LIBRE : elle
   dépend de la hauteur qu'on vient de fixer à partir d'elle. La boucle de mise
   en page ne converge plus et **l'app quitte en silence à l'ouverture du fil** —
   sans rapport de crash, sans `fatal`, sans qu'aucun gate ne rougisse. Le
   commentaire de `FittedMediaHeight` mettait en garde contre exactement ça ; je
   l'avais lu, et j'ai réécrit le mécanisme au lieu de l'employer.

2. **`fittedMediaHeight` lui-même**, le modificateur éprouvé. Correct, mais il ne
   pose sa hauteur qu'à la passe SUIVANTE, une fois la largeur mesurée. À la
   première, `height: nil` — et le `ZStack` prend alors la hauteur de son plus
   grand enfant à taille intrinsèque, c'est-à-dire **le compteur**. Une bande de
   quarante points au lieu d'un média.

> **Une mesure de largeur qui gouverne une hauteur doit d'abord CONTRAINDRE la
> largeur** — et un conteneur sans taille intrinsèque ne se mesure pas du tout :
> il faut lui DONNER sa forme.

`.aspectRatio(_:contentMode: .fit)` n'a rien à mesurer : la largeur est proposée
par le parent, la hauteur en découle, dès la première passe.

**Corollaire sur le site unique.** Le ratio ne recopie pas les bornes : il
INTERROGE `postCardMediaHeight` sur une largeur de sonde et en déduit le
rapport. Plancher, plafond et repli « dimensions absentes » restent définis là
où ils servaient déjà le média unique. Pour que ce soit possible, la règle est
passée `nonisolated` — arithmétique pure que l'isolation par défaut de la cible
(`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`) rendait inappelable depuis une
autre règle pure. **Une règle qu'on ne peut pas interroger hors du fil principal
finit recopiée ailleurs : c'est ainsi qu'un site unique cesse d'en être un.**

**Et le point de méthode, qui vaut au-delà de SwiftUI.** J'ai annoncé « j'ai la
cause » quand j'avais « j'ai UNE cause » : le correctif (1) était juste et
nécessaire, mais le témoin qui l'aurait relié au symptôme — un carrousel
réellement instancié — n'existait pas dans mon environnement, et je ne l'ai su
qu'en le cherchant après coup. **Chercher le témoin d'abord, annoncer ensuite.**
Le défaut (2) n'a été vu que sur une CAPTURE, gate entièrement vert.
