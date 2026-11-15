## Leçon 535 — Suivre le NOM plutôt que le CHEMIN : deux fois le même jour, sur le même lot

**Deux correctifs posés au bon endroit *selon le nom*, au mauvais endroit
*selon l'exécution*** — 2026-09-05, tous deux sur la publication d'un post à
canvas.

| correctif | où je l'ai posé | pourquoi c'était faux | où il fallait |
|---|---|---|---|
| l'ADOPTION du média dans le canvas | `StoryViewModel+PublicationUpload.runStoryUpload` | ce fichier sert les STORIES ; un POST descend la voie durable | `OutboxDispatcher`, seul étage qui tienne la carte `position → id serveur` |
| le REDRESSEMENT d'orientation | `StoryMediaLayer` (« la couche des médias ») | le média d'un post-photo est un FOND (`isBackground`) | `StoryBackgroundLayer`, qui a sa propre couche |

Les deux fois, le raisonnement était : *« ce défaut concerne un média de
canvas ⇒ il vit dans le fichier dont le nom parle de médias de canvas »*. Les
deux fois, le nom décrivait une FAMILLE et l'exécution suivait une autre
route.

> **Un nom de fichier décrit la famille que son auteur visait ; il ne décrit
> pas le chemin que la donnée emprunte.** `StoryViewModel+PublicationUpload`
> ne dit pas « stories seulement », `StoryMediaLayer` ne dit pas « sauf les
> fonds » — et ni l'un ni l'autre ne ment : ils nomment ce qu'ils font, pas ce
> qu'ils NE font pas.

**Ce qui l'attrape, et ce qui ne l'attrape pas.** Relire le fichier ne
l'attrape pas : il est cohérent. Chercher d'autres fichiers au nom voisin ne
l'attrape pas non plus — j'avais couvert média, lieu et sticker, et le fond
manquait quand même. Ce qui l'attrape est de **suivre l'exécution depuis le
geste** : quel routeur décide, quelle branche est prise, quelle couche peint.
Trois mesures, pas trois lectures.

**Le témoin qui l'a révélé les deux fois est le même** : republier et LIRE le
résultat. La première fois, le serveur a rendu `ORPHELIN` après un correctif
que je croyais posé ; la seconde, la carte est restée à l'envers après un
redressement que je croyais complet. Dans les deux cas, la compilation était
verte et les témoins unitaires aussi — ils éprouvaient la RÈGLE, jamais son
site d'appel.

> **Une règle juste, testée, et appelée nulle part sur le chemin réel, est
> indiscernable d'une règle absente.** C'est la forme de la journée
> (leçon 533) vue depuis l'autre bout : là, une moitié présente rassurait sur
> la moitié absente ; ici, un correctif présent rassure sur le chemin qu'il ne
> couvre pas.
