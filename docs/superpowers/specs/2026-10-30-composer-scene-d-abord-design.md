# Compositeur Android : la scène d'abord, les contrôles posés dessus

Date : 2026-10-30 · Milestone : « Le compositeur Android laisse la scène occuper l'écran » · Issues : #13834, #13838, #13835, #13836, #13837 · iOS jumelle : #13839 (hors de ce lot).
Cible : `docs/product/composer-scene-d-abord/maquette.html`, validée par le porteur le 2026-10-30. Elle fait foi pour la DISPOSITION, la HIÉRARCHIE, les ÉTATS et les GESTES. Les polices, couleurs, rayons et icônes viennent du design system Android (`MeeshyIcons`, `MeeshyTheme`, `ComposerPlateauInk`, `MeeshySpacing`, `MeeshyRadius`).

## 1. Intention

Sur le S8 (360 × 740 dp), la scène occupe aujourd'hui 58 % de la largeur au repos et 32 % quand un outil est ouvert. Elle est entourée de deux rails d'icônes sans libellé (7 à gauche, jusqu'à 12 à droite), d'une carte blanche, d'une rangée de vignettes et d'un pied chargé : légende, compteur « 5000 », puces d'état, Audience et Publier. Les captures de référence sont `and/*.png`, relevées sur S8 le 2026-10-30.

Le compositeur devient un écran où **la scène est la page**. On voit en grand ce qu'on publie. Les seuls contrôles affichés sont ceux du geste en cours, posés en surimpression sur la scène. Quand le clavier ou une feuille monte, la scène se réduit en restant entière ; elle n'est jamais couverte.

## 2. Règles du porteur (2026-10-30, citées)

1. « simplifier, afficher UNIQUEMENT ce qu'il faut à un instant T, préférer l'overlay au-dessus de la scène, réduire la scène quand le clavier ou une feuille s'affiche ».
2. « les détails nombre de caractères, nombre max… sont inutiles : on l'indique quand on atteint la limite ».
3. Le type de publication (story, post ou réel) se choisit par le **chevron du bouton Publier**, en bas.
4. Sur grand écran, les icônes vont dans des **rails libellés**.
5. **Aucune feature n'est supprimée.** Ce qui existe et que la maquette ne montre pas (diapos multiples, son, dessin, animation, cadre, filtres, mentions, hashtags, lieu, export…) reste accessible. Il est rangé dans « ⋯ » ou dans l'état où il sert.
6. Diapos, choix par défaut : une **rangée compacte de vignettes en surimpression en haut de la scène**, affichée seulement à partir de 2 diapos. « Ajouter une diapo » est dans « ⋯ ».

## 3. Décision de géographie

**Cette spec remplace, pour le compositeur de story Android, la géographie « aucun contrôle sur le canvas, les rails vivent dans les couloirs du plateau » de #4561 et #4633** (fermées le 2026-08-31, reprise dans `apps/ios/CLAUDE.md` § 1 et dans les doc-comments de `ComposerPlateau`, `ComposerStage`, `StoryCanvasSurface`, `StoryComposerPlateau` et `StoryComposerFooter`). La directive du 2026-10-30 est postérieure. D'après la règle de préséance du `CLAUDE.md` racine, c'est elle qui l'emporte, et les issues #13834 à #13838 l'écrivent.

Conséquences :
- Les doc-comments qui disent « nothing is laid on the scene » sont réécrits dans le lot qui change le comportement qu'ils décrivent.
- Le témoin `ComposerStageLayoutTest.opening a tool panel leaves the scene at its size` garde l'ancienne loi. Il est remplacé dans L2 par le témoin inverse : une feuille qui monte réduit la scène, qui reste entière. On ne le supprime pas sans remplaçant.
- La crainte de #4561 (« un contrôle sur la scène fait mentir l'aperçu ») est traitée ainsi : les surimpressions sont du chrome de l'éditeur. Elles ne participent ni à la capture d'export (`sceneExport.capture` n'enregistre que `StoryCanvasSurface`) ni au rendu publié. Un toucher sur une surimpression n'atteint jamais la scène, et un toucher hors surimpression garde les gestes de la scène.
- iOS garde sa géographie actuelle jusqu'à #13839. L'écart est temporaire et consigné dans cette issue ; il n'est pas « assumé ».

## 4. Les états

Les mesures sont en dp, calées sur le S8 portrait (360 × 740, barres système déduites). Le vocabulaire est identique sur petit et grand écran.

### 4.1 Petit écran, état 1 : au repos (#13834)

- **Scène** : le plus grand 9:16 qui tient dans la fenêtre, barres système déduites, sur toute la largeur et sans carte blanche autour. Sur le S8, cela donne 360 × 640 sous la barre d'état, et la bande restante est de la couleur sombre du plateau. Les coins arrondis viennent de `MeeshyRadius`.
- **Haut, en surimpression** : à gauche, ✕ (Fermer) ; à droite, ↶ (Annuler) et ↷ (Rétablir). Ces deux boutons ne paraissent qu'avec un historique non vide, selon la loi 4 : un contrôle qui n'a pas d'effet n'est pas affiché. Ce sont des boutons ronds translucides (voile sombre de 38 % et flou si l'API le permet), avec une cible de 48 dp.
- **Colonne droite, en surimpression**, sous la barre du haut : six boutons ronds, dans cet ordre : **Texte (Aa), Média, Sticker, Son, Dessin, ⋯**. Les boutons n'ont pas de libellé visible ; chacun a un `contentDescription`. Aucun badge de compte : c'est la règle 2, l'objet est visible sur la scène.
- **Rangée des diapos** : avec 2 diapos ou plus, une rangée compacte de vignettes en surimpression en haut de la scène, entre ✕ et ↶↷ (ou juste dessous si la place manque). Elle sert à changer de diapo d'un toucher, à réordonner par appui long puis glissé (comportement actuel de `ComposerSlideRail`) et à supprimer avec confirmation (#13616). Chaque vignette a une cible de 48 dp, même si l'image est plus petite. Avec une seule diapo, la rangée n'existe pas.
- **Bas, en surimpression** : la pastille **« 🌐 Public »** (audience), puis le bouton **« Publier la story ▾ »**, qui prend le reste de la largeur. Le libellé vient de `publishTitle`. Toucher le corps publie. Toucher le chevron ouvre le menu « Publier comme » (Story ✓ / Post / Réel), où chaque format refusé est grisé avec sa raison (`ComposerFormatMenu`, #4030). Sans autre format possible (route autonome : republication, modification, onboarding), il n'y a pas de chevron.
- **« ⋯ »** ouvre un menu dont les entrées sont, dans l'ordre : Ajouter une diapo · Fond · Durée de la diapo · Animation · Cadre (si un média de fond existe) · Légende · Enregistrer · Transférer. Chaque entrée n'est servie que si elle a un effet, comme pour l'export aujourd'hui.
- **Disparaissent** : la carte blanche, le rail gauche de 7 portes, la colonne droite au repos, la ligne « Story ▾ » du haut, le « + » du haut, la rangée de vignettes à une diapo, le champ Légende permanent et son compteur, la trace du son sous la scène et la rangée des médias sous la scène.

### 4.2 Petit écran, état 2 : on écrit (#13835)

- Le clavier monte. **La scène se réduit mais reste entière** : c'est le plus grand 9:16 qui tient entre le haut de la fenêtre et le haut de la barre de style. Elle est centrée horizontalement. Sur le S8, avec un clavier d'environ 280 dp et une barre de 44 dp, la scène mesure environ 142 × 252 dp, comme dans la maquette. Le texte en cours y est lisible, curseur compris, et c'est le champ en place `ComposerInlineTextField` qui le porte.
- **Barre fine collée au clavier** (44 dp) : **Aa** (police) · **●** (couleur) · **≡** (alignement) · **▣** (fond du texte) · **OK**. OK ferme l'édition sans rien supprimer. Le mot « Terminé » de la barre actuelle devient OK.
- **Clavier OU options, jamais les deux** (règle iOS #6156). Toucher une icône remplace le clavier par ses seuls choix, dans un panneau de la hauteur du clavier. La barre reste à sa place et la scène ne bouge pas. Toucher le texte sur la scène rend le clavier.
- Ce que montre chaque panneau :
  - Aa : polices, puis taille et effet.
  - ● : couleur, puis contour.
  - ≡ : alignement.
  - ▣ : fond du texte, puis cadre.
  - La langue du texte, aujourd'hui section « Langue » de la colonne droite, va en dernière rangée du panneau Aa, sous le titre « Langue du texte ». *Ce rangement est à valider en recette ; il ne retire rien.*
- Pendant la frappe, **aucune surimpression** n'est affichée : ni ✕, ni outils, ni Publier. **Aucune puce d'état** (« STYLE · GRAS », « TAILLE 96 », `SceneInspectorRow`).
- Le même état sert pour la **légende**, ouverte depuis « ⋯ › Légende » : la scène se réduit et le champ de légende est collé au clavier, avec OK. On n'affiche aucun compteur avant la limite.

### 4.3 Petit écran, état 3 : un élément sélectionné (#13836)

- Toucher un texte, un sticker ou un média posé le sélectionne. **Un cadre visible** (pointillé blanc, décalé de 3 dp) entoure l'élément, aux bornes de son calque.
- **Les outils se retirent** : la colonne droite disparaît. ✕ et ↶↷ restent en haut, Public et Publier restent en bas.
- **Une seule barre d'actions libellées** en surimpression, juste au-dessus de Public et Publier : **Modifier · Ordre · Dupliquer · Temps · Retirer**, chacune avec une icône et un mot. Une action sans effet pour l'élément n'est pas servie (loi 4). Par exemple, « Temps » n'est servi que pour une scène animée, comme aujourd'hui.
  - **Modifier** : pour un texte, on entre dans l'état 2. Pour un média, une feuille monte avec ses sections actuelles (filtre, réglages, rognage vidéo, description et texte alternatif, cadre) et la scène se réduit au-dessus. Pour un sticker, la feuille de stickers remplace l'emoji.
  - **Ordre** : premier plan ou arrière-plan (`ZOrderButton`, actions actuelles de l'objet).
  - **Dupliquer** : action actuelle.
  - **Temps** : départ et durée de l'objet, avec la frise du plan (`TimingCycleButtons`, `StoryPlanFrise`), dans une feuille qui réduit la scène.
  - **Retirer** : supprime l'élément, en rouge. L'historique ↶ permet d'annuler.
- **Toucher la scène à vide** désélectionne et ferme la barre. Les outils reviennent.
- Le menu contextuel de l'appui long (`SceneObjectMenuPopup`) reste un raccourci des mêmes actions. Il ne propose jamais une action que la barre n'a pas.

### 4.4 Grand écran : deux rails libellés (#13837)

- La scène est le plus grand 9:16 qui tient en **hauteur**, Publier compris. Publier est posé **sous la scène**, à sa largeur ou au moins à 300 dp.
- **Rail gauche** (environ 112 dp) : Fermer · **Texte · Média · Sticker · Son · Dessin · Fond**, puis les entrées de « ⋯ » qui tiennent (Animation, Durée, Diapo…). Le reste va dans un « ⋯ Plus » en bas du rail. Chaque entrée a une icône et un libellé, l'outil ouvert est surligné, et la cible fait 48 dp.
- **Rail droit** : le titre « SÉLECTION », puis les actions de l'état 3 (Modifier, Ordre, Dupliquer, Temps, Retirer), libellées. Le rail est **vide sans sélection**. Au pied du rail : ↶ ↷.
- Les états 2 (frappe) et les feuilles fonctionnent comme sur petit écran. Les feuilles et le panneau d'options se posent sous la scène ou dans un rail ; la scène se réduit, sans jamais être couverte.
- La rangée des diapos se pose au-dessus de la scène, dès 2 diapos.

### 4.5 Règle de bascule : la place libre, jamais le modèle d'appareil

C'est une loi pure dans `:core:model`, nommée par exemple `ComposerSceneArrangement.resolve(windowWidthDp, windowHeightDp)`, avec un témoin JVM local (`meeshy.sh jvm-check`) :

```
H_scène = hauteur utile − hauteur de Publier sous la scène − marges
L_scène = H_scène × 9/16
libre   = largeur utile − L_scène
RAILS        si libre ≥ 2 × LARGEUR_RAIL_LIBELLÉ + 2 × marge (≈ 2 × 112 + 2 × 16 = 256 dp)
SURIMPRESSION sinon
```

- Valeurs de référence pour les témoins :
  - S8 portrait (360 × 692) : surimpression.
  - S8 paysage (740 × 330) : rails.
  - Tablette 10" portrait (800 × 1232) : surimpression, car la largeur limite la scène.
  - Tablette 10" paysage (1280 × 752) : rails.
  - Pliable ouvert (≈ 840 × 900) : rails.
- On lit la taille de fenêtre, jamais `Configuration.smallestScreenWidthDp` ni un modèle d'appareil. La bascule se rejoue quand la fenêtre change (rotation, multi-fenêtre, pliage), sans perdre l'état : le ViewModel est inchangé et seule la disposition change.
- **Hystérésis** de 16 dp autour du seuil, pour qu'un redimensionnement en multi-fenêtre ne fasse pas clignoter la disposition.

### 4.6 Feuilles, limites, audience, fermeture (#13838)

- **Toute feuille qui monte** (stickers, son, audience, média, temps, fond, durée, animation) **réduit la scène, entière, au-dessus d'elle** : c'est le solveur `StoryCanvasFraming.CARDED`, alimenté par la hauteur réelle de la feuille, avec une animation fluide de l'échelle et du décalage (`graphicsLayer`, sans relayout de la scène). Une feuille ne grise plus la scène et ne la couvre pas. Cela suppose de remplacer, dans le compositeur, les `ModalBottomSheet` à voile (`StickerPickerDialog`, `SoundShelfSheet`, `StoryAudienceSheet`) par une présentation ancrée en bas, sans voile, dont on mesure la hauteur.
- **Limites** : aucun compteur ni plafond n'est visible avant que la limite soit atteinte. Disparaissent ainsi le « 5000 » de la légende, les « 0:00 / 0:06 » au repos et la phrase « L'audience appartient à la publication… ». À la limite, un message bref et poli (`liveRegion`) s'affiche, accompagné d'un retour haptique : par exemple « 50 stickers au plus par scène », par le chemin actuel `rememberGuardedAddition`, ou « Légende trop longue » au moment où on la dépasse. `publishBlock` ne s'affiche que s'il est non nul, comme aujourd'hui.
- **Audience** : un toucher sur un mode l'applique et ferme la feuille. Il n'y a plus de bouton « Appliquer · PUBLIC ». Les modes à liste (« Sauf… », « Seulement… ») ouvrent leur sélecteur, et le choix s'applique en le quittant. La republication (`my_stories_repost`) garde son bouton, parce que c'est une ACTION et pas un réglage.
- **Fermer** : ✕, retour système, et glissé vers le bas du haut de l'écran. Sur un brouillon **non vide**, une confirmation s'affiche, comme pour une diapo (#13616) : « Fermer le brouillon ? » avec « Garder le brouillon » et « Abandonner ». Le brouillon est sauvegardé automatiquement, donc le premier choix ferme et garde, et le second ferme et purge. Un brouillon vide se ferme sans question.

## 5. Où va chaque fonction existante

| Fonction (Android actuel) | Source actuelle | Nouvelle place |
|---|---|---|
| Fermer ✕ | couloir haut `StoryComposerPlateau` | surimpression en haut à gauche (+ confirmation L2) ; rail gauche « Fermer » sur grand écran |
| Format « Story ▾ » | `ComposerFormatMenu` dans `titleContent` (couloir haut) | chevron de Publier, en bas |
| Nouvelle diapo « + » | couloir haut, `ComposerSlideRail.showsAdd` | « ⋯ › Ajouter une diapo » ; rail gauche sur grand écran |
| Vignettes de diapos | `ComposerSlideRail` dans la carte | rangée compacte en surimpression en haut, dès 2 diapos |
| Enregistrer / Transférer | `ComposerOverflowMenu` | même menu « ⋯ », sous les entrées de scène |
| Portes Média, Son, Texte, Fond, Dessin, Sticker | rail gauche `StoryPlateauDoors` | colonne de 6 boutons (Texte, Média, Sticker, Son, Dessin, ⋯) ; Fond dans « ⋯ » sur petit écran, libellé dans le rail sur grand écran |
| Animé (éclair) | `ComposerLeadingSceneToggles.ANIMATED` | « ⋯ › Animation » (bascule ; la frise s'ouvre en feuille qui réduit la scène) |
| Cadre (Crop) | `ComposerLeadingSceneToggles.FRAME` | « ⋯ › Cadre » si un média de fond existe ; et « Modifier » du média de fond |
| Durée de la diapo | panneau TEXTURE (`ComposerToolPanel`) | « ⋯ › Durée de la diapo » (feuille courte) |
| Couleurs de fond, filtres, transitions | panneau TEXTURE, `SceneEffectsDock`, `ComposerSceneEffectCarousel` | « ⋯ › Fond » (feuille : couleurs puis transitions) ; filtre d'un média dans « Modifier » du média |
| Colonne droite, sections du texte | `StoryTrailingColumn`, `TextSectionToolbar`, `TextStackedSection` | barre clavier (Aa, ●, ≡, ▣) et ses panneaux (§ 4.2) |
| Colonne droite, actions d'objet | `StoryTrailingColumn` | barre d'actions libellées (§ 4.3), rail droit sur grand écran |
| Temps / Plan d'un objet | sections Temps et Plan | action « Temps » |
| Annuler / Rétablir | pied de la colonne droite | surimpression en haut à droite ; pied du rail droit sur grand écran |
| Inspecteur à puces | `SceneInspectorRow` | **supprimé** (information visible sur la scène) |
| Légende + compteur | `OutlinedTextField` du footer | « ⋯ › Légende » (état 2), compteur seulement à la limite |
| Rangée des médias et description | `MediaPreviewRow`, `ComposerMediaDescription` | feuille « Média » quand la diapo en porte déjà (liste, fond, posé, boucle, ajout) ; texte alternatif dans « Modifier » du média |
| Son de fond (trace, muet, retirer, rogner) | `SoundTraceRow`, `SoundSectionContent` | feuille « Son » : son actuel puis étagère `SoundShelfSheet` |
| Dessin | `StoryDrawingToolbar` dans le footer | état Dessin : scène pleine, barre en surimpression en bas (couleurs, épaisseur, défaire, OK) ; ✕ et outils masqués |
| Stickers | `StickerPickerDialog` (feuille à voile) | feuille ancrée qui réduit la scène |
| Audience, mentions, hashtags | `StoryAudienceSheet` | pastille « Public » ; feuille ancrée, sans « Appliquer » |
| Lieu (refus de localisation des médias) | message du footer | message bref à la limite ou au refus, rien au repos |
| Menu de l'appui long d'un objet ou du fond | `SceneObjectMenuPopup`, `ComposerBackgroundMenu` | inchangés, raccourcis des mêmes actions |
| Publier | socle `MeeshyPrimaryButton` | « Publier la story ▾ » en surimpression en bas ; sous la scène sur grand écran |
| Blocage de publication | `publishBlock` sous la pastille | message bref au-dessus de Publier, seulement s'il existe |

## 6. Ce qui disparaît

- **La carte blanche** : `ComposerPlateau` pose `backgroundPrimary` et un rayon de 24 dp autour du contenu.
- **Les rails non libellés** : 7 portes à gauche et jusqu'à 12 sections à droite.
- **Les puces d'état** (`SceneInspectorRow`), **les compteurs et les plafonds au repos**, les badges de compte sur les portes, la phrase sur la portée de l'audience et « Appliquer · … ».
- **Le panneau qui se pose sur la scène ou la pousse** (`ComposerToolPanel` + `ComposerBandHandle` sous la carte).
- La présentation autonome (`Scaffold` + `StoryComposerTopBar`) adopte la même disposition. Il n'y a plus deux géographies.

## 7. Architecture et principes de mise en œuvre

- La **logique** (bascule, tailles de scène, entrées servies de « ⋯ », actions servies par famille d'objet, règle « limite visible seulement si atteinte », garde de fermeture) va dans `:core:model`. Elle est prouvée en TDD local (`meeshy.sh jvm-check`). L'écran reste mince.
- `ComposerPlateau` (`sdk-ui`) est **partagé** avec les compositeurs de post et de mood (`FeedComposerPlateau`, `StatusComposerSheet`). La story le quitte pour une disposition qui lui est propre, dans `feature/stories`, par exemple `StorySceneFirstLayout`. Il n'y a **aucune régression** pour le post ni le mood.
- La scène reste **un seul** `StoryCanvasSurface`. Sa taille change par `graphicsLayer` (échelle et décalage) : pas de recomposition du contenu, pas de relayout par image. Les surimpressions sont des enfants légers qui reçoivent des valeurs primitives.
- Chaque fichier reste sous 1 200 lignes et chaque fonction sous 80. `StoryComposerViewModel` (801 lignes) ne reçoit que des appels vers les réducteurs.
- Les chaînes passent par `feature/stories/src/main/res/values{,-fr,-es,-de,-it,-pt,-ar}/strings_<sujet>_<issue>.xml`, écrits à la main dans les 7 langues comme `strings_plafonds_13535.xml`. Les clés iOS adoptées passent par `i18n/manifest/stories.d/*.json` et `./apps/android/meeshy.sh i18n`. Les chaînes de `ComposerFormatMenu` sont dans `app/src/main/res`.
- Accessibilité : cibles de 48 dp ; un `contentDescription` pour chaque bouton rond ; la barre d'actions et les rails sont lus avec leurs libellés ; une sélection est annoncée par `stateDescription` ; un message de limite est lu en `liveRegion = Polite`.

## 8. Non-objectifs

- **iOS** : #13839 porte la même refonte. Rien n'est touché sous `apps/ios` ni `packages/MeeshySDK`.
- **Aucune feature retirée** : tout le tableau § 5 reste accessible.
- Les compositeurs de post, de réel et de mood gardent leur plateau actuel. Ce que « Publier ▾ » y deviendrait relève d'une issue de suivi à ouvrir.
- Ne sont pas dans ce lot : un trait de dessin sélectionnable, le viseur au toucher sur la scène vide, la reprise « Reprendre / Recommencer » d'un brouillon restauré.
- La coque Capacitor `apps/web/android` n'est pas concernée.

## 9. Les cinq lots

| Lot | Issue | Contenu |
|---|---|---|
| L1 | #13834 | fondation : scène plein écran, surimpressions (✕ ↶↷, six boutons, « ⋯ », Public, Publier ▾), rangée des diapos à partir de 2, retrait de la carte blanche et des rails |
| L2 | #13838 | feuilles ancrées qui réduisent la scène ; limites montrées seulement à la limite ; audience sans « Appliquer » ; confirmation de fermeture |
| L3 | #13835 | état de frappe : scène réduite entière, barre de style collée au clavier, clavier OU options, aucune puce |
| L4 | #13836 | sélection : cadre visible, barre d'actions libellées, toucher à vide qui referme |
| L5 | #13837 | grand écran : loi de bascule par la place libre, deux rails libellés, Publier sous la scène |

Chaque lot se prouve par ses témoins (JVM ou Robolectric/Compose), `testDebugUnitTest` des modules touchés, `:app:compileDebugKotlin` et une capture S8 de l'état visé. Pour L5, la capture se fait sur le S8 en résolution tablette (`wm size` / `wm density`).

## Addendum porteur du 2026-10-30 : rien n'est aplati avant la publication (#13841, jumelle iOS #13840)

> « Tant qu'on n'a pas envoyé notre scène ou image/vidéo en édition, on peut toujours bouger les textes, filtres, cadres, etc. »

- Filtre, cadre, recadrage, réglages, textes, stickers, dessin, son et découpe d'une image ou d'une vidéo restent des RÉGLAGES et des CALQUES séparés jusqu'à la publication. On les retouche dans n'importe quel ordre, autant de fois qu'on veut, et l'annulation les couvre.
- Ouvrir l'édition d'un média (depuis le rail des pièces, la sélection ou « Modifier ») ne le cuit jamais. Revenir sur la scène rend tous les calques manipulables : déplacer un texte, poser un son sur une image ou une vidéo.
- L'aplatissement n'a lieu qu'à l'export ou à la publication, ou pour un enregistrement dans la galerie explicitement demandé.
- Aucune option existante ne disparaît dans la refonte. Chaque sous-menu, chaque option et chaque éditeur (média, texte, sticker, son, dessin, fond, durée, animation, audience, type de publication) reste accessible depuis l'état où il sert.
- Un inventaire exhaustif des options iOS et des écarts Android arrive dans un lot de parité dédié, après les cinq lots.
