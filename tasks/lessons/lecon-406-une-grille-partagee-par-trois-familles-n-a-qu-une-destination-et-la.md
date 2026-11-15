## Leçon 406 — Une grille PARTAGÉE par trois familles n'a qu'UNE destination, et la famille qui perd sa donnée le fait en silence

**Le lot.** La palette de stickers (#4579) montre trois familles de décorations
— amour, heure, lieu — dans la *même* grille de vignettes. C'est ce qui leur
donne un air de famille, et c'était le bon choix visuel.

**Le défaut.** `templateTab(family:)` appelait `onTemplateSelected(gabarit,
emplacements)` pour les trois. Or un LIEU ne se pose pas en sticker : lui seul
porte des coordonnées et un id de POI que la plateforme LIT (`/posts/nearby`).
Un `StorySticker` les aurait perdues — et **rien à l'écran ne l'aurait dit** :
la pastille se serait dessinée correctement, au bon endroit, avec le bon nom de
lieu. Seule la donnée serait partie.

> **Ce qu'une surface POSE dépend de ce que la chose EST, jamais de la grille
> qui la montre.** Partager la présentation est bon ; partager la destination
> ne l'est que si les familles partagent leur nature.

**Ce qui l'a attrapé.** Pas une relecture — le TÉMOIN. En écrivant la garde
« taper une décoration pose quelque chose », il a fallu nommer l'appel visé, et
c'est en l'écrivant qu'on voit qu'il n'y en a qu'un pour trois familles. Le
témoin qui devait prouver la loi 4 a révélé un défaut d'une autre nature.

**Le contre-témoin.** Il porte sur l'AIGUILLAGE, pas sur l'appel : le poseur
doit contenir `onLocationTemplateSelected(` **et** `onTemplateSelected(`. Un
témoin qui n'aurait vérifié que « ça pose quelque chose » serait resté vert.
