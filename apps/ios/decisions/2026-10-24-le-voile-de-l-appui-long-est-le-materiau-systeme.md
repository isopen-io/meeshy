## 2026-10-24 : Le voile de l'appui long est le matériau système (#11222)

**Contexte.** Trois surfaces d'appui long voilaient le fond de trois façons. Le menu d'un message floutait la conversation à 6 (`ConversationOverlayBackdrop`) sous un noir de 40 % en clair et 50 % en sombre. L'aperçu d'une pièce posait un noir de 62 % sans flou. L'aperçu d'une conversation, dans la liste, posait `.ultraThinMaterial` sous un noir de 15 %. Le web floutait à 16 px sous 50 %.

**Décision (porteur, 2026-10-24).** Le voile est le MATÉRIAU SYSTÈME, une seule loi pour iOS et le web :

- un atome SDK, `LongPressVeil` (`packages/MeeshySDK/Sources/MeeshyUI/Theme/LongPressVeil.swift`), pose `.ultraThinMaterial` plein écran sous un assombrissement de 30 % (`LongPressVeilLaw.dimOpacity`), le même en clair et en sombre ;
- sous Réduire la transparence, la matière devient OPAQUE (`LongPressVeilLaw.matter`, qui lit `MeeshySurface`) : un gris presque noir en sombre, presque blanc en clair, sous le même assombrissement ;
- un toucher le ferme ; il est caché des technologies d'assistance, puisque le menu porte sa propre fermeture ;
- le menu d'un message (`MessageOverlayMenu`), l'aperçu d'une pièce (`MessagePieceOverlay`) et l'aperçu d'une conversation (`ConversationListView+Overlays`) le posent. L'hôte du menu (`ConversationBodyOverlayMenu`) ne floute plus la conversation.

Le web porte la même valeur, flou de 20 px saturé sous 30 % de noir, dans un seul jeton (`apps/web/decisions.md` § D-226).

**Conséquences.**
- La lueur radiale de l'accent du menu d'un message reste, posée au-dessus du voile sans capter le toucher : elle teinte la scène, elle n'est pas le voile.
- Sur iOS 26, le verre de la pastille et du menu échantillonne désormais une matière floue et non plus le fil net assombri. C'est l'arbitrage du porteur, au profit d'une seule loi sur toutes les surfaces.
- Garde : `ConversationLongPressMenuGuardTests.test_longPressVeils_passThroughTheSystemMaterial_withoutLiteralBlur` (aucun `.blur(radius:)` chez l'hôte ni sur les voiles, aucun assombrissement propre, `LongPressVeil(visibility:` sur les trois surfaces) et `LongPressVeilTests` (SDK) pour la loi.
- Hors de la loi, et nommé pour ne pas passer pour un oubli : le sélecteur de réaction posé SUR une tuile (`AttachmentReactionPickerOverlay`, monté par `BubbleStandardLayout+Media` et `FocalAttachmentBlock`). Il n'est pas un voile d'appui long : depuis #9907 l'appui long d'une pièce ouvre son aperçu (`MessagePieceOverlay`, qui pose `LongPressVeil`), et ce sélecteur s'ouvre au DOUBLE TOUCHER. Il ne voile pas l'écran mais sa seule tuile, qui le rogne ; une matière plein écran (`LongPressVeil` ignore les zones sûres) n'y a pas de sens. Il garde son assombrissement de tuile, comme le web garde le sien sur `conversation-preview-sheet.tsx` (D-226).
- Le miroir Kotlin n'a rien reçu.
