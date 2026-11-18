## Un même IDIOME dans deux lois ne dit pas la même RÈGLE — et le compter dans UN langage le sous-compte (cycle 177, #19599)

#19299 avait consolidé la descente du plancher de lecture dans le gateway et
laissé un suivi : « la SIXIÈME copie vit dans `packages/shared`, là où la loi
du gateway ne peut pas l'atteindre ». Le suivi était juste sur l'adresse. Il
était faux sur deux choses, et chacune se mesure.

### Le compte était fait en TypeScript, et la loi a des miroirs

« La sixième copie » en était **cinq** :

| fichier | occurrences |
|---|---|
| `packages/shared/utils/first-unread.ts` | 1 |
| `packages/MeeshySDK/.../FirstUnreadBoundary.swift` | **2** |
| `apps/android/core/model/.../FirstUnreadBoundary.kt` | **2** |

Deux faits que le relevé initial ne pouvait pas voir. D'abord, **une loi à
miroirs se compte dans tous ses langages** : #19299 avait balayé `*.ts`, donc
rendu un `1` honnête pour son instrument et faux pour le dépôt — c'est la
leçon 261 sous un autre jour, un chiffre qui est une propriété de l'outil et
se lit comme une propriété du sujet. Ensuite, **les deux miroirs natifs
portaient l'idiome DEUX FOIS dans la même unité** (`resolve` et son assembleur
de candidats) : une jumelle divergente n'a pas besoin d'un autre fichier pour
naître, le même suffit.

> Devant un suivi qui annonce « la Nième copie », demander dans quel LANGAGE
> le N a été compté — et, si la loi a des miroirs, le recompter avant de s'y
> fier.

### Le `min` du gateway n'était pas une clause de la loi, c'était une clause de son HISTOIRE

Le suivi posait la bonne question — « `min` ou `??` pour un résolveur
client ? » — et c'est la réponse qui apprend quelque chose. `readFloorOf`
(gateway) prend le MINIMUM des deux colonnes ; `firstUnreadBoundary` (clients)
prend la PREMIÈRE non nulle. Les deux formes coïncident sur toute donnée saine
et ne diffèrent que sous `position > horloge`, une dérive d'horloge.

Le `min` se lisait comme une clause de la loi. Il n'en est pas une : c'est un
cliquet de NON-RÉGRESSION, et sa raison n'est pas dans le SUJET de la loi mais
dans le PASSÉ de ses consommateurs — les trois sites du gateway étaient ancrés
sur l'horloge avant #19299, donc la position seule aurait pu rétrécir leur
fenêtre sous ce qu'elle couvrait. **Aucun client n'a ce passé** : la descente y
est position-d'abord depuis son origine (#7215), et l'y abaisser ferait
redevenir « non lu » chaque message de `(horloge, position]` — un séparateur
qui fait remonter le lecteur dans du déjà-lu, sans qu'aucun non-lu ne soit en
jeu.

> Avant de consolider deux sites qui portent le même idiome, demander
> **pourquoi chacun l'a choisi**, pas seulement s'ils se ressemblent. Une
> clause justifiée par l'HISTOIRE d'un site ne se transpose à aucun site qui
> n'a pas cette histoire — et consolider sans le voir aurait changé, en
> silence, le comportement de trois clients sous couvert de refactor.

C'est la faute du cycle 107 (« une symétrie LEXICALE prise pour une symétrie de
fond ») déplacée d'un cran : là-bas c'était le NOM du miroir qui transposait,
ici c'est le CORPS de l'expression.

### Ce qui est partagé est la clause, pas la loi

Le découpage qui en sort répond aux deux objections à la fois.
`packages/shared/utils/read-cursor-floor.ts` porte la PREMIÈRE clause — la
descente ordonnée — et `readFloorOf` la COMPOSE avec son propre
`clampToClock`. La loi du gateway ne bouge donc pas, ses jumelles
(`readFloor.ts` / `deliveryFloor.ts`) restent adjacentes, et la différence
entre les deux régimes est désormais une fonction NOMMÉE au lieu d'un écart de
prose que personne ne confronte.

> Quand deux lois partagent une clause et divergent sur une autre, partager la
> CLAUSE plutôt que la loi est ce qui garde l'écart vérifiable. Fusionner les
> deux l'aurait effacé ; les laisser séparées l'aurait laissé en prose.

### Et deux verdicts opposés se gèlent par DEUX témoins qui se citent

`readFloor.test.ts` gèle le minimum, `read-cursor-floor.test.ts` gèle la
position, chacun nommant l'autre dans son commentaire. Un lot qui consoliderait
les deux formes fait tomber l'un des deux — ce qu'aucun doc-comment ne sait
faire. Les deux miroirs natifs reçoivent le même témoin, pour la raison du
cycle 176 : un site corrigé sans témoin est un site qu'on peut défaire en
silence.
