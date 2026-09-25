## Leçon 628 — `.frame(maxWidth:)` ÉTEND, il ne BORNE pas : pour empêcher un enfant de dicter la taille d'un `ZStack`, le poser en `overlay` d'une couche neutre

**Le fait (2026-09-18, #7037).** Ouvrir une pièce jointe d'un post ne montrait aucune croix. Mesurée dans l'arbre d'accessibilité, elle était à **x = −326,3 pt** — 286 pt à gauche d'un écran de 402. Le plein écran ne se fermait plus qu'au geste.

**La cause.** `SceneFloorView` peint l'empreinte du sol en `scaledToFill()` **nue**. Ce modificateur rend une vue qui REMPLIT la proposition : au moins une dimension déborde, et **c'est cette taille débordante que la vue ANNONCE**. Le `ZStack` du plein écran, qui adopte la taille de son plus grand enfant, prenait 1082,7 pt de large (874 × 1,24) et se centrait : bord gauche à (402 − 1082,7) / 2 = −340,3. La croix, alignée sur ce bord au pas du couloir (14 pt), tombait à −326,3. **L'arithmétique du défaut est exactement celle mesurée** — c'est ce qui l'a identifiée.

**Deux fausses pistes, écartées en les MESURANT.**
- `.frame(maxWidth: .infinity, maxHeight: .infinity)` sur le carrousel : ce cadre est EXTENSIBLE, il monte jusqu'au plafond proposé et ne rétrécit jamais une vue déjà plus large. Mesure après : **mêmes −326,3**. (Même famille que [[reference_frame_maxheight_is_a_flexible_frame_that_fills]].)
- Le carrousel posé en overlay d'une couche neutre : bon motif, **mauvaise couche** — le coupable était le sol.

**Le motif qui borne vraiment :**

```swift
Color.clear
    .overlay { /* la vue qui déborde */ }
    .clipped()
```

Un `overlay` **ne participe jamais** au calcul de taille de son hôte. `Color.clear` prend la place proposée, l'enfant la remplit, `clipped()` retire ce qui dépasse. Rien ne change à l'écran ; seul le cadre ANNONCÉ redevient celui de l'écran.

**Corollaire de témoin.** Le défaut ne change que la taille ANNONCÉE — à l'écran, l'image remplissait déjà correctement avant comme après. Un témoin de pixels serait resté vert des deux côtés ; celui qui l'attrape mesure `UIHostingController.sizeThatFits(in:)`. Contrôle joué : sans correctif 628,3 pt annoncés pour 402 proposés, trois témoins rouges ; avec, quatre verts.
