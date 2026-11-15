## Leçon 491 — Une règle qui NAÎT hors de l'unité de son hôte naît hors de toutes ses gardes

`ComposerRailDoorBadge.matter(...)` (#4994) prenait le TEXTE de la publication et
appelait `ComposerHashtags.tags(in:)` pour compter la pastille de la porte `#`.
Le chiffre était juste. C'était quand même une **seconde dérivation du même
fait** — et le meuble interdit explicitement ce doublon, avec un témoin :
`test_lesBalises_neSontDeriveesQuUneFois` compte les occurrences et exige 1.

Ce témoin était VERT. Il balaie `AppSourceGuard.composerHostSource()`, l'unité du
meuble ; le fichier neuf n'y était pas.

> **Le doublon était invisible parce qu'il vivait dans un fichier neuf, pas
> parce qu'il était subtil.** C'est le miroir exact de la leçon 347 (« une règle
> qui déménage sans emmener son adresse éteint en silence les gardes qui la
> balayaient ») : même angle mort, à la CRÉATION plutôt qu'au déplacement — et
> plus dangereux, parce qu'un déménagement se remarque et une naissance non.

L'indice était pourtant dans la signature, à deux lignes d'écart :

| champ | ce qu'il recevait |
|---|---|
| `mentions` | un **compte**, depuis `composerReferences` |
| hashtags | un **texte**, à re-dériver |

Deux champs jumeaux, deux traitements. **L'asymétrie entre deux entrées de même
nature est la trace la plus lisible d'un site qui a échappé à sa règle**, et
elle se lit sans monter une vue.

Le réflexe à installer : **quand un fichier de RÈGLE naît à côté d'un hôte
gardé, l'inscrire dans son unité dans le MÊME commit.** Pas parce qu'on
soupçonne une faute — parce qu'on ne peut pas savoir laquelle des gardes
existantes aurait eu quelque chose à dire.

Trouvé en relisant #4994 après qu'une session voisine a payé la même faute sur
un autre champ, dans le même fichier, la même heure. Elle, sa garde l'a
attrapée — la sienne balayait le bon fichier.
