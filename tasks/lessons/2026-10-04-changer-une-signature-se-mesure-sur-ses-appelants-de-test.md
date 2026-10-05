## Changer une signature se mesure sur ses appelants de TEST, sous tous leurs formats d'appel (2026-10-04, #7433 → dcc49b3f, f2ed0de41)

#9202 a remplacé `applyReadReceipt(to:newStatus:deliveredCount:readCount:frontier:)`
par `applyReadReceipt(to:summary:)`. Le relevé des appelants cherchait
`applyReadReceipt(to` sur une ligne : il a manqué `ReadReceiptFrontierTests`, qui
écrivait l'appel sur plusieurs lignes. Toute la cible `MeeshySDKTests` a cessé de
compiler, et `sdk-tests` a rendu « 0 test », la signature d'un crash
d'infrastructure (#5466). Le porteur a dû réécrire les témoins après la fusion.

Le même lot a fait grossir une suite de la passerelle déjà hors budget
(`MessageReadStatusService.test.ts`, 5 264 → 5 272 lignes). Le cliquet #4531
interdit d'y ajouter quoi que ce soit : un témoin neuf va dans sa propre suite.

Règles :
1. **Relever les appelants par le NOM seul** (`grep -rn "applyReadReceipt"`), puis
   lire chaque site. Une recherche sur `nom(label` rate les appels écrits sur
   plusieurs lignes, et ce sont justement ceux des témoins.
2. **Sans compilateur local, une suppression d'API est un risque de compilation
   pour TOUTE la cible de test**, pas pour un fichier. Le dire au moment de livrer,
   et lire le verdict CI avant d'annoncer quoi que ce soit.
3. **« 0 test » n'est pas forcément l'infrastructure** : avant d'invoquer #5466,
   éliminer d'abord une cible de test qui ne compile pas.
4. **Une suite hors budget ne reçoit RIEN**, même un seul cas : extraire, puis ajouter.
