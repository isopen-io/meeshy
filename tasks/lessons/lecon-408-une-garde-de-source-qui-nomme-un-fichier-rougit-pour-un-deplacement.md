## Leçon 408 — Une garde de source qui nomme un FICHIER rougit pour un déplacement, et le rouge accuse le comportement

**Le lot.** L'extraction préalable (#4715) puis le découpage de la palette
(#4579) ont déplacé la section « Mes stickers » de `StickerPickerView.swift`
vers `StickerPickerView+Emoji.swift`, en la renommant `libraryTab`.

**Le symptôme.** `StoryComposerStickerImagePoseTests
.test_theLibraryThumbnails_areTappable` : `XCTUnwrap failed: expected non-nil
value of type "String"`. Le message n'accuse ni le fichier ni le déplacement —
il ressemble à une régression de comportement.

> **Une garde qui NOMME un chemin mesure deux choses et n'en dit qu'une.** Elle
> vérifie le comportement, mais elle échoue aussi sur la géographie — et son
> message ne distingue pas les deux.

**La forme du correctif.** `ComposerSourceGuard.allStorySources()` existait déjà
et son doc-comment disait exactement pourquoi (« une garde nommant ses fichiers
un par un laisse toujours passer le prochain doublon »). La garde balaie
désormais et cherche le BLOC (`var libraryTab`) où qu'il soit.

**Le rappel de méthode qui l'aurait évitée** : *avant d'extraire, `grep` le nom
du fichier ET des symboles déplacés dans les tests — la liste EST le lot de
repointage.* Il était en mémoire ; il n'a pas été appliqué.
