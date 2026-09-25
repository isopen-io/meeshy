## Leçon 505 — Un manque ÉCRIT dans un document peut être une destruction, pas une absence

**Le fait.** La planche du composer rangeait « GIF / stickers animés » dans les manques assumés
avec, en colonne « État Meeshy », trois mots : *absent (collage = image fixe)*. La ligne a survécu à
plusieurs révisions et à la livraison d'un décodeur d'images animées (#4925), sans que personne la
rouvre — elle décrivait fidèlement ce qu'on voyait à l'écran.

Elle décrivait le SYMPTÔME. La cause était une ligne : `persistIfLibraryWrite` décodait une
`UIImage` au budget de la surface, puis la ré-encodait en `pngData()`. Un GIF collé perdait ses
images 2 à N **à l'écriture dans la bibliothèque** — donc avant le disque, avant le cache, avant
tout site capable de les rattraper. Ce n'était pas une feature à construire : c'était une source
qu'on détruisait.

**Pourquoi la distinction change tout.** Une feature absente se planifie : on estime, on ordonne, on
la met dans un milestone. Une source détruite est un BUG, avec un coupable et une ligne — et la
roadmap de ce dépôt dit qu'un bug a au moins la priorité de la feature qu'il dégrade. Les deux
états rendent le même verdict à l'écran (« ça ne bouge pas »), donc l'étiquette qu'on leur colle est
un choix, pas une observation.

> **Un document qui note « absent » a répondu à la question « qu'est-ce que je vois ? », jamais à
> la question « qu'est-ce qui est arrivé à ce que je ne vois pas ? ».** Devant une ligne de manque,
> demander : cette matière ARRIVE-t-elle jusqu'au site qui la rend ? Si elle arrive et n'est pas
> rendue, c'est une feature ; si elle n'arrive pas, chercher QUI l'a jetée — et c'est presque
> toujours un ré-encodage, une projection, ou un champ qu'un `select` ne demandait pas.

**Le motif complet, parce qu'il se répète.** Trois lots consécutifs ont trouvé la même forme sous
trois noms : #4925 (« trois sites PROTÉGEAIENT une animation que rien ne jouait »), #4852 (le bitmap
d'un sticker rangé sous une clé que la couche n'essayait pas), et celui-ci. À chaque fois, la moitié
coûteuse existait et fonctionnait ; ce qui manquait était le PASSAGE d'un maillon au suivant — et un
passage manquant ne produit pas d'erreur, il produit un repli plausible.

**Le témoin qui l'attrape ne teste aucun maillon.** Il teste les JOINTURES : qui remet les octets au
suivant. Une suite par maillon reste verte pendant que la chaîne est coupée, parce que chaque
maillon fait correctement son travail sur ce qu'il reçoit. `AnimatedStickerChainGuardTests` lit donc
la source des six sites de passage — collage, grille, pose (×2), scène (×4), couche, téléversement —
plutôt que le comportement de six composants.

Sites : `apps/ios/Meeshy/Features/Main/Composer/StickerLibraryArtwork.swift` (la règle qui garde les
octets), `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryStickerLayer.swift` (la
branche synchrone), `apps/ios/MeeshyTests/Unit/Composer/AnimatedStickerChainGuardTests.swift`.

---
