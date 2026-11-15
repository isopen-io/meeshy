## Leçon 483 — Une vue sans CONSOMMATEUR n'a aucun site où rougir, et un format se perd dans un NOM

**Contexte (2026-09-03, #4925).** Le lot d'origine avait livré deux moitiés d'une
même feature : `AnimatedImageDecoder` (des octets → des images) et
`AnimatedImageView` (des images → du mouvement). Il avait ensuite câblé la SCÈNE,
qui n'est pas une vue SwiftUI mais un `CALayer`. Relevé du jour :
**`AnimatedImageView` n'était montée nulle part** — zéro occurrence dans
`apps/ios/` comme dans `packages/MeeshySDK/Sources/`.

Un sticker de message et une image de commentaire arrivaient donc figés avec un
décodeur parfait et une vue parfaite dans le même paquet. Le doc-comment du
décodeur nommait même ces deux surfaces comme non couvertes — il décrivait le
trou sans que personne ne le lise comme une tâche.

> **Rien n'était en panne.** Les témoins du décodeur passaient, ceux de la vue
> aussi, le build était vert. La question qui attrape ce défaut n'est pas « ce que
> j'ai écrit est-il juste ? » mais **« qui MONTE ce que j'ai écrit ? »**.

C'est la forme la plus discrète du dépôt, et elle a une parade mécanique : après
avoir écrit une vue ou un service, **`grep` son nom hors de son propre fichier**.
Zéro occurrence = feature absente, quels que soient ses témoins. La garde qui
l'empêche de revenir n'interroge donc pas la vue mais ses HÔTES
(`AnimatedImageConsumerGuardTests`).

### Puis la mesure a dit non, et la cause était trois couches plus haut

Le maillon câblé et prouvé, un GIF envoyé en commentaire restait **figé** au
simulateur : cinq captures espacées, zéro différence. Le fichier arrivé au lecteur
était un **JPEG 240×240 de 4 404 o** — le GIF envoyé faisait 6 448 o.

La cause tenait en une ligne, présente en deux exemplaires :

```swift
let ext = isVideo ? "mov" : "jpg"
```

`loadTransferable(type: Data.self)` rend les octets ORIGINAUX ; le code les
écrivait sous un nom `.jpg`, et le `mimeType` se dérive ensuite de l'EXTENSION.
Tout l'aval — jusqu'au serveur — traitait un GIF valide comme un JPEG.

> **Le format n'était pas perdu par une compression : il était perdu par un NOM.**
> Et une extension écrite en dur ne ressemble pas à une perte de données — elle
> ressemble à une valeur par défaut. C'est ce qui l'a rendue invisible pendant que
> trois sites du dépôt (`MeeshyImageWatermark`, `MediaSaveBranding`,
> `MediaCompressor.compressImageData`) protégeaient soigneusement l'animation
> quelques couches plus bas.

### Les trois règles à retenir

1. **Une chaîne se mesure à son maillon le plus en amont.** Un correctif de RENDU
   qu'on vérifie à l'écran peut échouer sans être faux : la charge n'anime plus
   quand elle arrive. Vérifier ce qui ARRIVE (`file` sur le cache disque) avant
   d'accuser ce qui AFFICHE.
2. **Le savoir existe souvent déjà, en `private`, au service d'un seul appelant.**
   `MediaCompressor` savait lire les signatures et laisser passer un GIF ; le
   chemin d'ingestion ne le consultait pas. Exposer bat réécrire — deux tables
   divergent au premier format ajouté.
3. **Borner un élargissement sur une décision ÉCRITE.** La règle ne préserve que
   GIF/PNG/WebP — ceux que `compressImageData` rend déjà tels quels. Le HEIC reste
   transcodé parce qu'un commentaire du dépôt dit pourquoi (« most web clients
   cannot decode HEIC inline »). Élargir « par symétrie » aurait servi au web un
   format qu'il ne rend pas.

### Le témoin qui l'aurait attrapé

Pas une garde de source — elle aurait dit que la ligne existe, pas qu'elle produit
une vue animée. Le témoin utile MONTE la vue dans une `UIWindow` et lit
l'`UIImageView` produite (`AnimatedImageViewMountingTests`). Hors fenêtre, SwiftUI
n'instancie pas un `UIViewRepresentable` : le premier jet échouait sur « aucune
UIImageView montée », un rouge qui décrivait l'instrument et non le produit.
