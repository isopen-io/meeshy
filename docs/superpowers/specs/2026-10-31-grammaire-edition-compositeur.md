# Grammaire d'édition du compositeur — arbre unique et lots

> **Statut.** Cadrage du 2026-10-31, fait à partir d'un inventaire en lecture seule des deux plateformes : 25 entrées d'édition sur Android, dont 21 non conformes, et 27 sur iOS, dont 26 non conformes.
>
> **Décisions.** Le porteur a fixé la règle : #13973 Android, #13974 iOS, spec `2026-10-31-un-seul-compositeur-design.md` R6. Le coordinateur a tranché les écarts du § 3 en suivant chaque recommandation. Ces choix sont réversibles par le porteur. Les points 10 et 11 lui restent soumis en `décision-produit`, sans bloquer les lots.


Spec R6 relue sur `origin/dev` (commit 4c685ff9d6). La pile de niveaux de #13956/#13957 n'est pas encore sur `origin/dev` : aucun type de pile n'y existe. Je l'appelle ici `EditLevelStack` (une pile de `EditLevel`, chacun portant une liste d'entrées, avec push, pop et reset). Tous les lots ci-dessous démarrent sur ce que ces deux lots auront fusionné.

## 1. L'arbre unique des niveaux

### Conventions

- **N0** : le rail canonique du bas est remplacé par les options de l'objet sélectionné. C'est le niveau posé par #13956/#13957.
- **N1, N2, N3** : des rails qui se posent par-dessus. La première puce de chaque rail est « ‹ Nom du parent ». La touche retour d'Android et cette puce descendent d'un niveau.
- **[F]** : une feuille basse, sans voile, la scène réduite au-dessus.
- **[B]** : une bande qui prend la place du rail (rognage, frise).
- Toucher la scène à vide ressort de tout.

Pendant N0 et au-delà, on cache l'audience, Publier, Annuler, les rails latéraux et la rangée d'outils. Chaque réglage s'écrit dans le modèle à chaque image, et la scène se repeint.

**Une seule source pour l'arbre.** Il vit dans `packages/shared/design/composer-edit-tree.json` : identifiants d'entrées, ordre, clé i18n, icône (SF Symbol et Material), et la condition d'offre. Le modèle est celui de `meesh-coin.json`. iOS le décode dans une loi pure `ComposerEditTree` (`apps/ios/Meeshy/Features/Composer/`), Android dans `:core:model` `composer/edit/ComposerEditTree.kt`. Sur chaque plateforme, un témoin vérifie que le fichier décodé est égal à la valeur compilée.

### Lexique tranché, identique sur les deux plateformes

| Mot retenu | Ce qu'il recouvre |
|---|---|
| Recadrer | l'espace (ratios) |
| Couper | le temps (rognage d'une vidéo ou d'un son) |
| Cadrage | Remplir / Ajuster et l'arrière-plan du fond |
| Filtres, Cadres | deux entrées distinctes |
| Réglages, Effets | inchangés |
| Pivoter, Description | inchangés |
| Mettre en fond / Remplacer le fond | pour un média posé |
| Mettre sur la scène | le fond ou le son devient un objet posé |
| Remplacer, Retirer | inchangés |
| Temps | le temps d'un objet |
| Diapo | la diapositive |
| Fond du texte | le fond d'un texte, à ne pas confondre avec le Fond de la scène |

### Sélection, N0 (rappel, posé par #13956/#13957)

Modifier · Dupliquer · Temps · Retirer.

Il n'y a pas d'action d'ordre : le toucher fait passer l'objet au premier plan (#13917/#13918). L'appui long fait la même chose que le toucher, pour toutes les familles.

### Fond média (image ou vidéo). Entrée : toucher, appui long, ou vignette de diapo › Fond

- **N0 « Fond »** : Modifier · Remplacer [F : Photothèque / Prendre une photo / Fichiers] · Mettre sur la scène · Retirer (avec confirmation).
  - Pas de Dupliquer ni de Temps : le fond dure toute la diapo.
- **N1 « Modifier », fond image** : Cadrage · Recadrer · Filtres · Cadres · Réglages · Effets · Pivoter · Description [F].
- **N1 « Modifier », fond vidéo** : Cadrage · Couper [B] · Filtres · Réglages · Son · Boucle (interrupteur) · Pivoter · Description [F].
- **N2**, selon l'entrée choisie :
  - Cadrage : Remplir · Ajuster · Flou · Noir · Blanc · Indigo.
  - Recadrer : Original · 9:16 · 4:5 · 1:1 · 16:9. Le cadre se règle par pincement et glissé sur l'objet, sans équerre dessinée.
  - Filtres : vignettes.
  - Cadres : vignettes.
  - Réglages : Exposition · Luminosité · Contraste · Saturation · Vibrance · Température · Netteté.
  - Effets : Flou · Vignette · Éclat · Grain.
  - Son : Volume · Muet.
- **N3** : un curseur seul, avec Comparer (maintenir) et Réinitialiser. Il sert pour un réglage, un effet, l'intensité d'un filtre et le volume.
- Le double toucher reste un raccourci Remplir ⇄ Ajuster.

### Fond couleur ou dégradé. Entrée : ⋯ › Fond, ou appui long sur une scène qui n'est pas vierge

- **N0 « Fond »** : Couleur · Dégradé · Image [F source] · Retirer.
- **N1** : les pastilles. Toucher une pastille l'applique sans fermer le niveau ; « ‹ » valide.
- Sur une scène vierge, le toucher et l'appui long restent au viseur.

### Image posée

- **N0** : sélection.
- **N1 « Modifier »** : Recadrer · Filtres · Cadres · Réglages · Effets · Pivoter · Description [F] · Mettre en fond (ou Remplacer le fond) · Faire un sticker.
- **N2 et N3** : comme pour le fond.

### Vidéo posée

- **N1 « Modifier »** : Couper [B] · Filtres · Réglages · Son · Pivoter · Description [F] · Mettre en fond.
- **N2 « Son »** : Volume (curseur dans le rail) · Muet.

### Texte

- **N1 « Modifier »** : lance la saisie sur la scène. Le rail se pose au-dessus du clavier : Police · Effet · Couleur · Alignement · Fond du texte · Cadre · Contour · Langue · OK.
- **N2** : chaque outil remplace le clavier par ses choix, une seule section à la fois.

### Sticker

- **N1 « Modifier »** : Remplacer [F grille] · Animation (stickers animés seulement).
- Le choix initial reste une feuille.

### Lieu

- **« Modifier »** ouvre directement [F Lieu] tant qu'aucun Style n'existe.
- Quand un Style existera, N1 deviendra : Changer de lieu [F] · Style.

### Pastille de son

- **N1 « Modifier »** : Couper [B, avec la forme d'onde] · Volume · Rôle · Langue · Transcription [F] · Réenregistrer [F Création audio].
  - Mettre en fond reste dans « Modifier ».
- **N2** :
  - Volume : un curseur.
  - Rôle : Voix · Musique · Ambiance.
  - Langue : la liste dans le rail, ou une feuille au-delà de 7 langues.

### Son de fond (capsule en tête de scène, ou ligne d'ambiance)

- **N0 « Son de fond »** : Modifier · Mettre sur la scène · Retirer.
- **N1** : Couper · Volume · Rôle · Langue · Transcription · Réenregistrer. C'est la même branche que la pastille.

### Dessin (mode)

- **N0 « Dessin »** : Pinceau · Couleur · Épaisseur · Lissage · Défaire · Terminé.
- **N1** :
  - Pinceau : Stylo · Marqueur · Gomme.
  - Couleur : pastilles.
  - Épaisseur : curseur.
  - Lissage : Brut · Courbe · Droite.
- **Trait sélectionné, N0** : Couleur · Épaisseur · Retirer.

### Temps d'un objet (Sélection › Temps)

- **N1** : Début · Fin · Toute la durée.
- La frise de l'objet prend la place du rail [B]. La scène se cale sur la borne pendant le geste.

### Diapo. Entrée : appui long sur une vignette sans glisser, ou toucher sur la diapo courante

- **N0 « Diapo »** : Fond (mène à la branche Fond) · Durée · Animation · Dupliquer · Retirer (avec confirmation).
- La corbeille en coin et le glisser pour réordonner restent.

### Rail canonique au repos et ⋯

- **Rail canonique au repos** : Texte · Média · Sticker · Son · Dessin · ⋯.
- **N0 « ⋯ »** : Fond · Mention [F] · Hashtag [F] · Lieu [F] · Durée · Animation, puis, après un séparateur, Exporter · Tout effacer.
- **N1** :
  - Durée : Auto · 5 s · 10 s · 15 s · 30 s.
  - Animation : Activée (interrupteur) · Frise [B] · Ouverture · Fermeture.
    - Ouverture et Fermeture ouvrent un rail de vignettes, avec répétition de la transition sur la scène.
    - La Frise porte au N2 : Lecture · Entrée · Sortie.
  - Exporter : Aperçu · Enregistrer · Partager.
- **Appui long sur Média** : N0 « Ajouter un média » : Photothèque · Prendre une photo · Fichiers.

### Ce qui disparaît

- Les menus flottants ou contextuels sur les objets, le fond et la vignette de diapo.
- Le menu en haut à droite.
- La colonne droite d'édition et la plaque flottante de ses réglages.
- La retouche plein écran pour « Modifier » (elle ne reste que pour la capture caméra).
- Les bascules « Cadre » et « Animé » du rail gauche, et le « Temps » isolé.
- L'« Effet visuel » de la scène : il devient Fond › Modifier › Filtres.
- La section « Plan » des Modifier.
- Les doublons de Description, de filtre de scène et d'ouverture.

## 2. Lots d'implémentation

Règles communes à chaque lot :

- **Témoins d'abord.** Une loi pure (« quelle entrée est offerte, à quel niveau ») et un témoin de rendu.
- **Une garde de source cumulative**, `ComposerEditGrammarGuard`, que chaque lot étend : elle interdit pour sa famille `ComposerSceneContextMenu`, `ComposerTrailingOptionsPlate`, `DropdownMenu` et `Menu` dans la barre haute.
- **Moins de 1 200 lignes de diff.**
- **Rapatrier `dev` avant chaque lot.**

### Chaîne iOS (#13974)

**I-E1. Fond : l'appui long sélectionne et ouvre N0 « Fond »**
- Fichiers :
  - `StoryCanvasBackgroundLongPress.swift` : le résultat `.presentBackgroundMenu` devient `.selectBackground`.
  - `StoryCanvasUIView+Gestures.swift`.
  - `MeeshyComposerHost+BackgroundMenu.swift` et `+SceneMenu.swift` : le chemin du fond est retiré.
  - `ComposerBackgroundMenu.swift` : `ComposerBackgroundMenuAction` est supprimé.
  - `MeeshyComposerHost+Surfaces.swift`, et l'arbre JSON avec sa loi `ComposerEditTree`.
  - La branche Fond est posée dans `EditLevelStack`.
- Témoins :
  - `ComposerEditTreeTests` : le JSON décodé est égal à la valeur compilée, N0 du fond média, et pas de Dupliquer ni de Temps.
  - `StoryCanvasBackgroundLongPressTests` : l'appui long sélectionne.
  - Garde : plus aucune référence au menu de fond.
- Recette au simulateur Meeshy-iOS26 :
  - Un appui long sur une photo de fond pose N0 en bas, et l'audience comme Publier disparaissent.
  - Retirer demande une confirmation, et Mettre sur la scène pose l'objet tout de suite.

**I-E2. Fond : « Modifier » ouvre N1 et N2 dans le bas, en direct**
- Le contenu de l'édition en place (`ComposerInlineEditing.sections` pour `.background`) sort de `ComposerTrailingColumn` et de `ComposerTrailingOptionsPlate`, et se rend en rails N1 et N2 :
  - `StoryFilterGridView` et `ComposerMediaAdjustPanel` se rendent en rail ou en curseur.
  - Le niveau Cadrage est la `ComposerFrameBand` existante, recâblée.
  - Recadrer est servi au fond, avec `setMediaCrop` et le geste sur l'objet.
  - Boucle et Son sont servis pour la vidéo.
- `requestSceneMediaRetouch` n'est plus appelé pour le fond.
- Fichiers : `ComposerInlineEdit.swift`, `MeeshyComposerHost+InlineEdit.swift`, `ComposerInlineToolPanel.swift`, `ComposerFrameBand.swift`, `MeeshyComposerHost+Frame.swift`, `MeeshyComposerHost+MediaRetouch.swift` (garde), `ComposerSceneColumns.swift`.
- Témoins :
  - Arbre N1 pour l'image et pour la vidéo.
  - « Le fond n'ouvre jamais la retouche plein écran. »
  - « Un réglage N2 écrit le viewModel à chaque valeur. »
- Recette au simulateur : glisser Contraste repeint le fond pendant le geste, aucun bouton n'apparaît en haut, « ‹ » descend d'un niveau.

**I-E3. Image posée : N1 Modifier**
- Recadrer en rail, plus `ComposerMediaCropPads` dans le bas.
- Mettre au premier plan et Mettre à l'arrière sont retirés.
- Description passe en feuille.
- `editSceneItem(.media)` cesse d'ouvrir `ComposerSceneMediaRetouchCover` (celui-ci reste pour la caméra).
- Recette : retoucher une image posée sans jamais quitter la scène.

**I-E4. Vidéo posée : Couper en bande, Son › Volume (curseur, nouveau setter), Muet**
- Recette : le volume s'entend à 30 % à la lecture.

**I-E5. L'appui long sur les objets égale le toucher**
- `StoryCanvasUIView+ContextMenu.swift` : la sélection remplace l'appel au menu de l'hôte.
- `ComposerSceneContextMenu` est supprimé.
- `ComposerSceneSoundChips.onItemMenu`.
- `ComposerSceneSoundHeader` et `ComposerSoundActionsMenu` donnent N0 « Son de fond ».
- Accessibilité : actions nommées.

**I-E6. Texte : rail N1 au-dessus du clavier, à partir de `TextEditTool`**
- La colonne droite et la plaque sont retirées.
- « Fond » est renommé « Fond du texte ».

**I-E7. Sticker (Remplacer), Lieu (feuille), pastille et son de fond**
- La pastille et le son de fond ont leur branche N1 : Couper, Volume, Rôle, Langue, Transcription, Réenregistrer. Le volume reçoit un nouveau setter.

**I-E8. Dessin : `ComposerRailMode.tool` sort de la colonne droite vers N0 « Dessin »**
- La sélection d'un trait est incluse.

**I-E9. ⋯ en rail et rail canonique à six outils**
- La porte Fond couleur ou dégradé et la palette restent ouvertes après un choix.
- La Durée est un nouveau réglage.
- Animation est un niveau ; les bascules du rail gauche et le Temps isolé sont retirés.
- L'Effet visuel est retiré.
- Le ⋯ du haut est vidé (`ComposerOverflowPolicy`).
- Mention, Hashtag et Lieu deviennent des entrées du ⋯.

**I-E10. Diapo : appui long → N0 « Diapo »**
- La garde finale couvre toutes les familles.
- Dépendance : l'atelier du SDK et `ComposerObjectEditorView` tombent avec I1 (#13864). Ce lot ne les réécrit pas, il les garde hors des ouvertures routées vers la scène.

Chaque lot iOS se prouve par `./apps/ios/meeshy.sh test` ciblé, sous le verrou `.git/ios-build.lock`, puis par une recette sur Meeshy-iOS26 : la scène se repeint pendant le geste, et rien n'apparaît en haut à droite.

### Chaîne Android (#13973)

Base de travail : `origin/dev`, pas le worktree principal, qui a environ 25 commits de retard sur le compositeur.

**A-E1. Fond : l'appui long et le toucher (fond média) sélectionnent et ouvrent N0 « Fond »**
- Fichiers :
  - `ComposerCanvasSurface.kt` : `onSceneBackgroundTap` sélectionne le fond quand il est un média.
  - `StoryComposerStageSlots.kt` : `backgroundMenuOpen` est retiré.
  - `ComposerBackgroundMenu.kt` est supprimé, et `ComposerBackgroundMenuAction` aussi.
  - `StoryObjectControllers.kt`.
  - `:core:model` `ComposerEditTree` et le décodeur JSON.
- Témoins :
  - `ComposerEditTreeTest` (JVM) : égalité avec le fichier partagé, N0 du fond, sans Dupliquer ni Temps.
  - Robolectric : l'appui long pose N0 et cache l'audience et Publier.
- Recette sur le S8 : même geste et même rendu que sur iOS.

**A-E2. Fond : Modifier N1 et N2 en rails**
- `ServedBackgroundSections` est rendu en rail au lieu des `FilterChip` d'`OBJECT_EDIT`.
- Cadrage : `ComposerFramePanel` est réutilisé, et quitte « ⋯ › Cadre ».
- La Boucle quitte `SlideMediaRows`.
- Le Couper du fond vidéo réutilise `MediaTrimStrip`.

**A-E3. Lecture en direct dans le compositeur**
- Un lecteur Media3 est piloté par la sélection, pour le Couper d'une vidéo ou d'un son et pour le volume.
- Sans ce lot, le « temps réel » de R6 est faux pour le son et la vidéo.
- Recette : rogner une vidéo de fond rejoue la plage pendant le geste.

**A-E4. Image et vidéo posées**
- La feuille `OBJECT_EDIT` à pastilles devient des rails N1 et N2.
- Recadrer : la miniature de 220 dp (`PlacedCropSection`) est remplacée par le geste sur l'objet de la scène.
- « Plan » est retiré.
- Vidéo : Volume, et Filtres conservés.

**A-E5. Appui long sur les objets**
- `SceneObjectMenuPopup` est retiré (texte, sticker), et l'appui long sélectionne.
- Les actions d'accessibilité sont nommées.
- Le `DropdownMenu` de `SoundShelfRow` devient des actions de rangée.

**A-E6. Texte**
- `ComposerTypingOptions`, empilé, devient un rail N1 au-dessus du clavier, avec une section N2 à la fois.
- Ordre et mots d'iOS.

**A-E7. Pastille de son, son d'ambiance, sticker et lieu**
- Le Modifier de la pastille porte Volume, Rôle, Langue et Transcription.
- `StorySoundSheet` ne sert plus qu'à ajouter.
- Les dialogues `TranscriptionDialog` et `LanguagePickerDialog` deviennent des feuilles ou des rails.
- Sticker : Remplacer. Lieu : déjà conforme une fois #13956 posé.

**A-E8. ⋯ en rail**
- `ComposerMoreMenu`, `DropdownMenu` au petit écran comme au grand, est remplacé.
- `ComposerToolPanel(TEXTURE)`, à poignée, devient N0 « Fond » couleur ou dégradé.
- Durée et Animation, avec l'interrupteur dans le rail.
- La frise de la diapo devient « ⋯ › Animation › Frise ».
- L'Effet visuel est retiré.
- La Légende passe au socle.
- Ajouter une diapo passe au « + » du rail des diapos.

**A-E9. Diapo, Média et références**
- Diapo : N0 « Diapo ». Le rail des diapos est visible dès 1 diapo, avec son « + ». Le `DropdownMenu` des vignettes est retiré.
- Média : l'appui long pose N0 « Ajouter un média » à la place de `MediaSourcesAnchor`.
- `ReferenceModeMenu` devient un choix segmenté.

**A-E10. Dessin et garde finale**
- Dessin : N0 « Dessin », avec Pinceau et Lissage ajoutés et la sélection d'un trait. Ce lot peut être scindé si le diff dépasse le budget.
- La garde finale couvre toutes les familles.

Chaque lot Android se prouve, sur une copie isolée, par :

- `:core:model:testDebugUnitTest`, `:feature:stories:testDebugUnitTest` et `:app:assembleDebug` avec `--max-workers=3` ;
- `xcstrings_to_android.py --check` dès qu'une clé bouge ;
- une recette sur le S8.

## 3. Écarts iOS ↔ Android à trancher

1. **N0 du fond.** iOS propose « Au premier plan », Android « Mettre sur la scène ». Je recommande « Mettre sur la scène » : « premier plan » relève de l'ordre, qui n'existe plus comme action, et le même mot sert déjà au son de fond.
2. **Le vocabulaire espace et temps.** iOS dit Rogner (espace) et Couper (temps), Android Recadrer et Rognage. Je recommande Recadrer et Couper, qui ne se confondent pas. Les deux plateformes renomment.
3. **« Filtres et cadres » sur Android, retouche caméra sur iOS.** Je recommande deux entrées, Filtres et Cadres, servies sur les deux plateformes.
4. **Les listes de Réglages et d'Effets divergent** (Lumière ou Exposition, Chaleur ou Température, Bloom ou Éclat, Vibrance absente d'Android). Je recommande les paramètres d'iOS comme référence, et le mot « Éclat » au lieu de « Bloom ». Une issue doit d'abord vérifier que les moteurs de rendu appliquent les mêmes grandeurs.
5. **Filtre sur une vidéo.** Android le sert, iOS non. Je recommande de le servir partout : une issue iOS sur la composition vidéo, sans retirer celui d'Android.
6. **Pivoter.** Il existe sur iOS et pas sur Android. Je recommande de l'ajouter sur Android dans A-E4.
7. **Volume.** Il manque sur les deux plateformes pour la vidéo posée, et sur iOS pour la pastille de son. Je recommande un seul modèle de volume par objet (0 à 200 %, comme le `ComposerSoundTrack` d'iOS), servi dans le rail, sur les deux plateformes.
8. **Lecture pendant l'édition.** Android n'a aucun lecteur dans le compositeur. Je le traite comme un défaut de temps réel, pas comme une option : le lot A-E3 est prioritaire avant le son et la vidéo.
9. **Rôle et Placement du son.** Android porte le Rôle (Voix, Musique, Ambiance), iOS le Placement (Fond ou Scène). Je recommande de garder les deux concepts : Rôle dans Modifier, et Placement exprimé par l'action Mettre sur la scène ou Mettre en fond. iOS reçoit Rôle et Langue.
10. **Lieu « Style ».** Il n'existe que dans la cible iOS. Je recommande que « Modifier » ouvre directement la feuille tant qu'aucun style n'existe, avec une issue `décision-produit` pour le style.
11. **Le contenu du ⋯ au-delà de R6** (Aperçu, Enregistrer, Partager, Tout effacer, Légende, Ajouter une diapo). Je recommande :
    - Exporter et Tout effacer en fin de ⋯, après un séparateur ;
    - la Légende au socle, comme le « Texte du post » ;
    - « + » au rail des diapos.

    C'est une décision porteur, à ouvrir en issue `décision-produit`, puisque R6 n'énumère que six entrées.
12. **Le rail des diapos.** Android ne l'affiche qu'à partir de 2 diapos. Je recommande de l'afficher dès 1 diapo, comme iOS, pour que « + » et l'appui long existent toujours.
13. **Défaire en mode Dessin**, et la sélection d'un trait (Android). Je recommande l'union des deux : N0 Dessin avec Défaire sur iOS, et la sélection d'un trait sur Android, en lot séparé.
14. **Fond couleur sur une scène qui n'est pas vierge.** iOS ouvre le viseur à l'appui long, Android filme. Je recommande que l'appui long ouvre N0 « Fond » dès que la scène contient quelque chose. Le viseur ne reste que sur une scène vierge, sur les deux plateformes.
15. **La source de l'arbre.** Aujourd'hui, chaque plateforme a ses listes en dur. Je recommande `packages/shared/design/composer-edit-tree.json`, décodé des deux côtés avec un témoin d'égalité : c'est la seule façon de tenir « mêmes mots, même ordre » dans la durée.