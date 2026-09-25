## Leçon 529 — Un chrome hérité d'un écran voisin arrive avec les hypothèses de CET écran-là

**Retour porteur (2026-09-05)** : « la ligne des propositions doit avoir un
fond transparent ».

`ComposerMentionStrip` portait `.adaptiveGlass(in: Rectangle())`, justifié en
commentaire par « même chrome neutre que `MentionSuggestionPanel` : une bande
d'assistance à la saisie, pas du contenu de conversation ». La justification
est correcte SUR SON SUJET — les deux vues jouent bien le même rôle — et
fausse sur ce qu'elle sert à décider : `MentionSuggestionPanel` vit sur un
écran CLAIR, le plateau du composer est sombre par doctrine (`PlateauTint`
n'offre que trois teintes sombres). Le verre y peignait une barre pâle en
travers de la scène, juste au-dessus du clavier.

> **« Même chrome que X » n'est une raison que si X a le même FOND.** Une
> analogie de RÔLE ne transporte pas les hypothèses de RENDU, et c'est
> précisément ce qu'un commentaire d'analogie donne l'air d'avoir vérifié.

**Ce que le retrait a réparé en plus, et que personne ne cherchait.** Les
trois témoins de `ComposerMentionStripContrastTests` mesurent « la capsule à
6 % de `textPrimary` par-dessus la teinte du plateau » — un empilement à DEUX
couches, explicitement énoncé. Avec le verre, l'écran en avait TROIS, et la
couche du milieu n'était mesurée nulle part : les ratios étaient justes par
accident, sur un empilement qui n'était pas celui rendu.

> **Un témoin de contraste décrit un EMPILEMENT.** Insérer une couche entre
> deux de celles qu'il nomme ne le fait pas rougir : il continue de mesurer,
> scrupuleusement, un écran qui n'existe plus. La question à poser à un témoin
> de contraste n'est donc pas « ses couleurs sont-elles les bonnes ? » mais
> **« l'empilement qu'il décrit est-il celui que la vue peint ? »** — et elle
> se répond en lisant les modificateurs de fond de la vue, pas le témoin.

Garde : `test_laBande_neSePeintAucunFond` interdit le verre ET tout fond
opaque de remplacement.
