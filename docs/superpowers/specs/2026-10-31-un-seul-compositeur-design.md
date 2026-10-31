# Un seul compositeur pour la story, le post et le réel (iOS et Android)

Issues : #13863 (Android), #13864 (iOS). Directive du porteur, 2026-10-31 : « on doit avoir l'interface de la story réutilisée TOUT LE TEMPS, avec des options et un visuel qui varient un peu uniquement ». Il demande aussi : « lorsqu'on ajoute un élément, le chargement doit s'afficher correctement et rendre le reste inactif », et « sur la scène, montrer l'audio, la vidéo et l'image comme les smileys et les stickers ». Enfin : « la publication et la lecture des posts, des stories et des réels doivent être excellentes et complètes », avec une sémantique identique sur iOS et Android.

Cette spec prolonge `2026-10-30-composer-scene-d-abord-design.md` (Android) et `2026-10-30-composer-scene-d-abord-ios.md` (iOS). La maquette validée reste la référence de la disposition.

## 1. Constat (relevé du 2026-10-31 sur origin/dev)
- **Android : le mode post change d'écran.** Dans `ComposerHostScreen.kt:78-115`, le format `POST` ou `REEL` monte `FeedComposerSheet`, par `FeedComposerPlateau`. Cet écran n'a aucune scène d'objets : ni sticker, ni texte posé, ni dessin, ni son. Les médias n'y sont que des vignettes de rail, avec un autre bouton Publier. Au changement de format, les objets de la story ne suivent pas, et des médias peuvent rester derrière.
- **iOS : l'écran dépend de la porte d'entrée.** Depuis le fil, un post vide s'ouvre en `ComposerDocumentSurface`, une autre vue que la scène. Choisir « Story » au chevron n'y change rien. Le socle lit le format armé, mais les rails et la garde de publication lisent le format de la porte.
- **Chargement.** Côté iOS, l'hôte n'affiche rien, ne bloque rien, et laisse ajouter deux fois ou publier pendant la préparation. `selectedSceneItemPreUpload` est calculé mais n'est jamais affiché. Côté Android, la progression est cachée dans le panneau Média, et le reste de l'écran reste actif.
- **Médias sur la scène.** iOS pose d'office un média en premier plan quand la slide a déjà un fond. Android laisse les médias suivants hors scène tant qu'on ne les a pas posés à la main. L'audio n'a aucune présence sur la scène du compositeur Android.

## 2. Règles communes (les mêmes sur les deux plateformes)

### R1. Une seule vue
La vue est la scène de la story, pour la story, le post et le réel, quelle que soit la porte d'entrée : fil, tuile story, humeur, partage, reprise d'un non-envoyé, modification. Le chevron de « Publier » change le **format**, et c'est le seul état de format : il n'y a plus de « format de la porte » à côté d'un « format armé ». Le contenu de la scène ne bouge jamais au changement de format.

### R2. Ce qui varie selon le format (table unique, une source par plateforme)
| | Story | Post | Réel |
|---|---|---|---|
| Libellé du bouton | Publier la story | Publier le post | Publier le réel |
| Texte du post (légende hors scène) | — | bouton « Texte du post » au socle | idem |
| Disposition des scènes (≥ 2 scènes) | — | dans le menu du chevron | — |
| Contraintes | 2 h max, plafonds de la story | — | une vidéo principale requise, ou la scène entière comme réel |
| Audience | pastille du socle | idem | idem |

Tout le reste est identique : outils, rails, barre de frappe, sélection, feuilles et ⋯.

Un format refusé reste dans le menu, grisé, avec sa raison, comme aujourd'hui sur Android.

**Le choix du format est composite, jamais exclusif** (décision porteur du 2026-10-31, #13919 Android, #13920 iOS) : au moment de publier, l'auteur coche un ou plusieurs formats parmi Story, Post et Réel, au moins un, et un seul geste les publie tous ; chaque format garde ses refus motivés. Quand le post est coché et qu'il porte plusieurs images ou scènes, le menu propose leur disposition comme iOS (`ComposerMosaicChoice`, #13921). La scène affichée suit le premier format coché ; le contenu ne bouge pas.

### R3. Post sans scène
Un post qui ne porte que du texte, et aucun objet ni fond, se publie comme un post texte ordinaire, comme aujourd'hui sur le fil : la charge envoyée est rétrocompatible. Dès qu'un objet ou un fond existe, il se publie en scène. C'est le compositeur qui fait ce choix : l'utilisateur n'a rien à décider.

### R4. Les médias sont des objets de la scène
- Le premier média d'une slide vide devient son **fond**. Les suivants se posent **en premier plan, sur la scène, tout de suite**, comme un sticker : on les déplace, on les pince, on les tourne et on les sélectionne.
- Un choix de plusieurs médias crée une slide par média, chacun en fond de sa slide.
- **L'audio posé est une pastille sur la scène**, qui se déplace et se sélectionne comme un sticker. Le son de fond s'affiche en badge près de l'avatar, et dans le ⋯.
- Sur le fil comme dans le lecteur, ce qui est publié est exactement ce qui est vu (loi 6).

### R5. Ajouter un élément montre son chargement et bloque le reste
- Dès le choix, l'élément apparaît **à sa place sur la scène**, sous forme d'espace réservé : la vignette si on l'a déjà, sinon une forme neutre, avec un anneau de progression (préparation, puis téléversement).
- Pendant ce temps, **le reste de l'écran est inactif** : un voile léger couvre les outils et le socle, Publier est désactivé, et un second ajout est impossible. L'élément lui-même porte un ✕ pour **annuler**.
- La fin du chargement libère tout dans la même image. Un échec retire l'espace réservé et l'explique dans une ligne discrète, avec « Réessayer ».
- Hors ligne : l'élément se pose comme espace réservé « en attente », et l'écran reste utilisable. Il part avec la publication, par la file hors ligne. Un hors-ligne n'est pas un chargement bloquant.
- Le téléversement en arrière-plan d'un élément déjà posé (pré-téléversement) ne bloque rien. Il se lit sur l'élément sélectionné (« envoi 40 % »), et la publication l'attend ou le reprend.

### R6. Le même vocabulaire
Les six outils de la maquette : Texte, Média, Sticker, Son, Dessin, ⋯. Le ⋯ contient fond, mention, hashtag, lieu, durée et animation. La sélection affiche Modifier, Dupliquer, Temps et Retirer. Il n'y a pas d'action « Ordre » : toucher un objet posé le fait passer au premier plan, tout naturellement ; pour envoyer un objet au dernier rang, on touche les autres, du plus profond au plus haut (décision porteur du 2026-10-31, #13917 Android, #13918 iOS). Le fond n'entre jamais dans cet ordre. Tant qu'un objet est sélectionné, le compositeur n'affiche ni l'audience, ni le bouton de publication, ni Annuler : le rail canonique cède sa place, au même endroit, aux options d'édition de l'objet, et toucher une option ouvre ses propriétés en bas, la scène se réduisant au-dessus ; désélectionner rend le rail, l'audience, Publier et Annuler (décision porteur du 2026-10-31, #13956 Android, #13957 iOS). Les mots et les icônes sont identiques sur iOS et Android, et sur grand écran les mêmes outils deviennent des rails libellés.

### R7. Lecture
- Post, story et réel composés se lisent dans le moteur unique de la scène : `MeeshyScenePlayer` sur iOS, `StoryScenePlayer` sur Android, dans les modes reader, card et reel.
- Un post sans scène garde son rendu de fil (carrousel ou mosaïque).
- Ce qu'on compose s'y relit à l'identique, avec les mêmes calques, le même ordre et la même pastille audio.

## 3. Rétrocompatibilité
- La charge du post sans scène ne change pas. La charge du post en scène est celle que le fil iOS lit déjà (`PostSceneMosaic`, document v3), et Android la lit par `StoryScenePlayer`.
- Les brouillons existants du `FeedComposerSheet` Android et du document iOS sont relus et convertis en scène à l'ouverture : texte → texte du post, médias → slides, son → pastille. Le témoin vérifie qu'un ancien brouillon se rouvre sans perte.
- La citation (`QuoteComposerSheet`/`FeedComposerSheet` en citation) et la modification d'un post publié (`EditPostSheet`) restent hors périmètre de ce lot. Chacune a son issue de suite.

## 4. Lots
**Android (#13863)**
1. **A1. Une vue.** `ComposerHostScreen` monte `StoryComposerContent` pour story, post et réel. La table R2 vit dans `:core:model`. Le menu du chevron reste sur la capsule. `FeedComposerSheet` cesse d'être monté par l'hôte, et ses portes (fil, non-envoyés, snackbar, repli) ouvrent l'hôte. Le passage d'un ancien brouillon en scène est couvert. La publication d'un post et d'un réel passe par le chemin de publication du fil (texte seul, puis scène).
2. **A2. Les médias et l'audio sur la scène (R4).** Pose immédiate en premier plan, et pastille audio dans le compositeur.
3. **A3. Le chargement (R5).** Espace réservé sur la scène, voile, annulation, échec et Réessayer.
4. **A4. Recette S8 et témoins de lecture (R7).**

**iOS (#13864)**
1. **I1. Une vue.** `ComposerSurfaceRouting` rend `.scene` pour toutes les portes, sauf l'humeur. `ComposerDocumentSurface` n'est plus monté pour un post. Il n'y a plus qu'un seul état de format : `selectedFormat` devient le format armé.
2. **I2.** R4, alignée sur la règle commune.
3. **I3.** R5 : voile, espace réservé et annulation dans l'hôte, puis branchement de `selectedSceneItemPreUpload`.
4. **I4. Recette au simulateur.**

Ordre : A1 démarre après la partie A de #13841, qui écrit les mêmes fichiers. I1 démarre après la fin de la refonte iOS (lots L6 et recette).
