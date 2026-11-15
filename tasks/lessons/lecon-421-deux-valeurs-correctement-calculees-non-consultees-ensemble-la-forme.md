## Leçon 421 — Deux valeurs correctement calculées, non consultées ensemble : la forme dominante d'une nuit

Trois défauts trouvés en quelques heures sur le composer, par trois sessions, avec
la MÊME structure — et aucun ne rougissait nulle part, parce que **chaque moitié
est juste séparément** :

| # | ce qui est calculé | ce qui le consomme | le symptôme |
|---|---|---|---|
| 4759 | `bringForward` LIT cinq familles d'objets | `mutateItem` en ÉCRIT quatre | l'échange de rang s'applique à MOITIÉ : les deux objets finissent au même rang |
| (pair) | `backgroundSoundAccentHex` calcule une garde AA et la PASSE | la branche `.credit` la laisse tomber, la branche `.original` la lit | crédit à **1,03:1**, invisible |
| 4513 | `showsCanvas(...)` dit « une story a un canvas » | `ComposerDocumentSurface(showsScene:)` reçoit `documentHasScene`, qui dit « non » | la story ouverte n'a **plus aucun canvas** |

> **Une valeur lue à un seul endroit ne peut pas être lue de travers ailleurs —
> mais rien ne garantit que ce qu'on LIT soit ce qu'on puisse ÉCRIRE, ni que ce
> qu'on CALCULE soit ce qu'on CONSULTE.** L'asymétrie entre le fourni et le
> consommé ne produit aucun rouge : les deux côtés compilent, chaque valeur est
> valide, et le test de chaque moitié passe.

**Ce qui les rend invisibles longtemps** : tant qu'un seul consommateur existe,
l'écart n'a aucun effet. Le #4513 le montre à l'état pur — les deux prédicats
divergeaient depuis toujours, sans conséquence, parce que `.document + hasScene`
montait une AUTRE vue qui peignait la scène. Le jour où le document l'a portée
lui-même, l'écart est devenu un écran vide.

**Ce qui les attrape** : pas le gate. 263 témoins étaient VERTS au-dessus de la
régression du #4513, et la suite du #4759 l'était aussi avant son correctif.
C'est la mesure à l'ÉCRAN qui a tranché, sur un binaire dont l'horodatage a été
vérifié avant l'installation.

**Ce qui les prévient** : ancrer la garde sur le NOM du prédicat, pas sur sa
valeur. `test_laPresenceDeLaScene_aUnSeulPredicat` n'affirme pas un résultat —
elle rend IMPOSSIBLE qu'un site lise `documentHasScene` pour décider de la
présence d'une scène. Une garde sur la valeur serait restée verte le jour où un
second lecteur apparaît ; une garde sur le nom rougit à l'instant où il est
écrit.

### Corollaire — deux témoins faux la même nuit, dans les deux sens

Aucun des deux n'était rouge :
- un témoin **visuel** de la session voisine « prouvait » deux couleurs sur une
  même rangée ; il avait échantillonné un bouton à l'autre bout de la carte ;
- mon témoin de **calcul** concluait que `textMuted` tenait AA ; il ne composait
  l'alpha que d'un côté de la comparaison, donc mesurait `textSecondary`.

Les deux ont été trouvés en cherchant à s'appuyer dessus pour autre chose.

> **Un témoin peut être faux sans être rouge, et c'est le cas le plus coûteux** —
> il ne se contente pas de ne rien garder : il ATTESTE. Les deux fois, le fait
> qui restait après correction était plus faible à raconter et infiniment plus
> solide.
