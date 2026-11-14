# K16 — MeeshyModeChrome (le cadre d'un mode plein écran)

Relevé sur `origin/dev` `19c98a6e30` le 2026-11-12. Chantier #17312, milestone 258 ; issue du lot : #17759. Dépend de K00, K01 (verre) et K02 (boutons posés dans l'en-tête ou la plaque). Lois 9 et 17 de `docs/product/composer-vue-finale.md` ; lois 4, 13, 15 et 18 lues. Planche : `modeHead(o)` (ligne 240), `plaque(body, o)` (ligne 241), `retouchHead()` (ligne 253), classes `.ctl`, `.ctl.white` (lignes 48 et 49) et `.plaque` (ligne 88). Vues qui appellent vraiment ces fonctions : A8, A10, A13, A19, S8, S9, I3, C1, C2. O4 à O9, citées au registre, sont dessinées par `head()` + `toolPanel()` : c'est la pilule agrandie (K10, K11), pas K16 (choix 1).

## 1. Rôle
Le cadre commun d'un mode plein écran : « Quitter » en capsule de verre au bord de début, un emplacement central optionnel, la validation en capsule blanche au bord de fin, et UNE plaque de verre basse pour les réglages de l'outil ; le contenu reste manipulable derrière.

Il ne fait pas :
- ce que Quitter défait et ce que Valider garde (« Quitter rend l'objet d'avant, Valider fait UN pas d'annulation », loi 9), ni la confirmation d'abandon : l'hôte ;
- le contenu de la plaque (K03, K04, K05, K07, K19, K22), le déclencheur, le rail et la capsule de réglages du viseur, la pilule de retouche (K10), la piste de coupe (K21), la feuille d'A19 (K15) ;
- le choix du ton (K01, posé par l'hôte), le retrait des rails et leur grisé sur grand écran (lois 13 et 15), l'état « en train de filmer » ;
- la barre du lecteur (`FullscreenTopBar`), l'en-tête de feuille (`MeeshySheetHeader`), la barre du clavier (K17).

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyModeChrome.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-mode-chrome.tsx` |
|---|---|---|---|
| Cadre | `MeeshyModeChrome(label:exit:confirm:…center:accessory:plate:)` | `MeeshyModeChrome(label, exit, modifier, confirm, …, center, accessory, plate)` | `<MeeshyModeChrome label exit confirm … center accessory>{plaque}</MeeshyModeChrome>` |
| En-tête seul | `MeeshyModeHeader(label:exit:confirm:center:accessory:)` | idem | `<MeeshyModeHeader>` |
| Plaque seule | `MeeshyModePlate(label:maxWidth:isScrollLocked:content:)` | idem | `<MeeshyModePlate>` |
| Capsule à libellé | `MeeshyModeCapsule(title:systemImage:kind:display:isBusy:hint:action:)` | `MeeshyModeCapsule(title, onClick, modifier, icon, kind, display, busy, enabled, hint)` | `<MeeshyModeCapsule title glyph kind display busy disabled hint onPress>` |
| Action | `MeeshyModeAction(title:systemImage:display:hint:isEnabled:isBusy:haptic:action:)` | `data class` identique | objet de même forme |
| Énumérés | `MeeshyModeCapsuleKind { glass, solid }`, `MeeshyModeCapsuleDisplay { title, glyph, glyphAndTitle }`, `MeeshyModeChromePresence { shown, stowed }` | `enum class` identiques | unions de chaînes |
| Lois pures | `MeeshyModeChromeRule` (loi 13), `MeeshyModeHeaderFit`, `MeeshyModePlateMetrics`, `MeeshyModeChromeRecipe` | `object` identiques | `meeshy-mode-chrome-recipe.ts` + `styles/kit-mode-chrome.css` |

Paramètres, tous opaques, mêmes défauts partout :
- `label` (obligatoire, non vide) : le nom du mode, dit et jamais peint (« Dessin », « Caméra », « Plan temps », « Retouche ») ;
- `exit` (obligatoire) : `title` (« Quitter »), `hint` optionnel ; `confirm: MeeshyModeAction? = nil` : `title` obligatoire même en coche (« Valider », « Terminé »), `display = title` ou `glyph` ;
- `presence = shown` ; `tone: MeeshyGlassTone? = nil` (celui de l'hôte, par K01) ; `headerInset = MeeshySpacing.mdPlus` (l'hôte passe `xxl` sur grand écran) ;
- `plateLabel: String?`, obligatoire dès que `plate` existe (« Réglages du dessin ») ; `plateMaxWidth: CGFloat? = nil` ; `isPlateScrollLocked = false` (un geste du contenu tient la plaque) ;
- `exitOnEscape = true` : Échap, retour matériel et geste d'échappement du lecteur d'écran appellent `exit.action` ; `confirmShortcut = true` : ⌘ ou Ctrl + Entrée appelle `confirm.action` ;
- `haptic: { light, none } = light` par action ; web seulement : `restoreFocusTo`, `backEntry = true`, `data` (sondes `data-*`).

Emplacements : `center` (au centre du cadre, pas de la place restante : la capsule « ⬇︎ Photos » de C1), `accessory` (juste avant la validation : « retirer la dernière prise », bouton K02), `plate` (le contenu de la plaque, en colonne). Le cadre se pose EN SURIMPRESSION du contenu de l'hôte, dans le cadre que l'hôte lui donne (la scène sur téléphone) ; sur grand écran l'hôte pose `MeeshyModeHeader` et `MeeshyModePlate` séparément (I3).

## 3. États
- Quitter · Valider en texte, avec plaque : A13 (Dessin), S8 (Frise).
- Plaque qui gagne une rangée d'actions quand un objet est choisi : S9.
- Quitter · coche, sans plaque : A8 (viseur) ; avec une feuille K15 par-dessus : A19.
- Quitter · coche, plaque de looks : A10.
- Quitter · centre · validation en texte, sans plaque, pilule K10 dessous : C1, C2 (« Terminé »).
- Grand écran : en-tête aux coins de la fenêtre, ton `plain`, plaque bornée posée sous la scène dans sa colonne : I3.
- Rangé (`stowed`) : rien de visible ni de touchable ; c'est l'état pendant qu'on filme (A9, A20), commandé par l'hôte.
- Sur scène claire : ton `onLight` (loi 4) ; aucune vue, tenu par K01.
- Conservés du code, sans vue : validation désactivée (rien à valider, `canFinish` d'iOS), validation ou capsule centrale occupée (rendu de « Terminé », écriture dans Photos), `accessory` présent (prises en attente), plaque plus haute que son plafond (elle défile), en-tête trop étroit (loi d'ajustement).
- Vide, chargement, erreur, hors ligne : ceux du contenu de la plaque ; la plaque garde sa largeur et suit la hauteur du contenu.

Loi 13 (`MeeshyModeChromeRule.resolve`, fonction pure) :
- pas de validation si `confirm` est nul ; pas de centre ni d'accessoire si l'emplacement est vide ;
- pas de plaque, donc aucun verre ni bande vide, si `plate` est vide ;
- pas de titre peint dans l'en-tête, pas de légende sous un bouton ;
- `stowed` : ni en-tête ni plaque, aucun toucher reçu ; la capsule centrale s'en va quand son action n'a plus d'objet (prise déjà dans Photos) : l'hôte vide l'emplacement ;
- en mode, l'hôte retire pilule, rails et en-tête du repos (grisés sur grand écran).

## 4. Gestes et retours
- Toucher Quitter, le centre ou la validation : l'action part une fois, au relâcher dans la cible ; rien si désactivé ou occupé.
- Hors des capsules et de la plaque, le cadre laisse passer tous les touchers : glisser, pincer, tourner l'objet, tracer (loi 9, #8535). La plaque garde les siens.
- Échap, retour matériel (Android, coque web par `useBackDismiss`), geste d'échappement : `exit.action`, le même chemin que le toucher. ⌘ ou Ctrl + Entrée : `confirm.action`.
- Réponse au toucher : celle de K01 sur les capsules de verre (interactive) ; la capsule pleine répond comme l'actif de K02 (opacité 94 → 78 %).
- Haptique : un `light` à l'action, par `HapticFeedback.light()`, `MeeshyHaptics.light()` ou `impact('light')` de `lib/view/haptics.ts` ; `none` laisse l'hôte jouer le sien.
- Animation : l'en-tête entre par le haut et la plaque par le bas (translation de 12 et opacité), 250 ms ; sortie 200 ms. Le contenu de la plaque qui change se fond en 150 ms ; la hauteur n'est pas animée image par image.
- « Réduire les animations » : fondu seul, 150 ms, sans déplacement ni ressort.

## 5. Accessibilité
- Nom : l'en-tête est un groupe nommé `label` ; la plaque un groupe nommé `plateLabel`. Quitter porte `exit.title` et son `hint` ; la validation porte `confirm.title` même réduite à la coche ; une capsule en glyphe seul garde son titre.
- Rôle : boutons ; web `role="group"` sur l'en-tête et `<section aria-label>` sur la plaque. Valeur : « en cours » quand `isBusy` (zone qui se met à jour) ; l'état désactivé est annoncé.
- Entrée dans le mode : le nom du mode est annoncé (changement d'écran sur iOS, `paneTitle` sur Android) ; sur le web le focus entre sur Quitter et revient à `restoreFocusTo` à la sortie.
- Ordre de lecture : Quitter, centre, accessoire, validation, puis le contenu de l'hôte, puis la plaque de haut en bas.
- Clavier (web, iPad) : Tab parcourt en-tête puis plaque ; Entrée et Espace activent ; anneau `:focus-visible` de K01 ; Échap et ⌘/Ctrl + Entrée comme au § 4.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : les libellés grandissent sur une ligne, la capsule garde 44 de haut au moins. Si l'en-tête ne tient plus, `MeeshyModeHeaderFit` réduit dans cet ordre : centre en glyphe seul, validation en coche (si elle a un glyphe), puis libellés à 80 % et troncature, Quitter en dernier. La plaque défile au-delà de son plafond. Mesures web en `rem`.
- Cibles : 44 pt, 48 dp (capsule visible de 44), 44 px.
- RTL : Quitter au bord de début, validation au bord de fin, par propriétés logiques ; la coche et la flèche ne se retournent pas.
- Contraste, calculé par le témoin depuis les recettes : libellé blanc sur verre `deep` dense 6,12:1 et sur `onLight` 5,07:1 (pire fond, flou coupé, valeurs de K01) ; encre `indigo950` sur la capsule pleine 15,99:1 ; la capsule pleine porte l'ombre de l'actif de K02, qui la détache d'une scène claire. « Réduire la transparence » : matière opaque de K01.

## 5 bis. Performance
- Ne se re-rend jamais : l'en-tête pendant un geste sur le contenu ou un réglage de la plaque (entrées primitives, `Equatable` et `.equatable()`, paramètres stables en Compose, `memo` sur le web) ; le conteneur de la plaque pendant qu'un curseur glisse (son contenu est un emplacement).
- La hauteur du contenu se mesure quand elle change, jamais à chaque image ; le plafond se calcule une fois par taille de fenêtre.
- S'anime : translation verticale et opacité, à l'entrée et au retrait. Jamais le flou, jamais la hauteur image par image.
- Un verre par surface, aucun verre sur du verre : les boutons posés dans la plaque sont des K02 emboîtés ; sur iOS 26 les capsules de l'en-tête vivent dans un `MeeshyGlassGroup`. Web : quatre `backdrop-filter` au plus.
- K16 n'échantillonne aucune image : le ton vient de l'hôte.
- Budget : aucune image perdue pendant un trait, un pincement ou le défilement de la frise sous le cadre ; cadre visible à la première image du mode. Rien de retenu après la sortie (écouteur d'Échap, entrée d'historique, observateur de taille). Web : poids mesuré par `measure-weight.mjs`, aucune dépendance ajoutée.

## 6. Jetons et mesures
Mesures de la planche (390 × 844, scène en x 16, y 70) :
- capsules à x 30 et y 84, soit 14 à l'intérieur du cadre de la scène ; grand écran : 24 des bords de la fenêtre ;
- capsule : hauteur 44, marge 16, rayon 22, texte 15 gras, écart glyphe-texte 6, glyphe 18, coche 20 ;
- validation : fond blanc, encre `#0E1117` ;
- plaque : bords à 12, bas à 28, rayon 28, marges 12 et 14, écart 12, verre `deep` à 66 % ; I3 : largeur 400.

Jetons :
- retrait `MeeshySpacing.mdPlus` (14) et `.xxl` (24) ; marge de capsule `.lg` (16) ; écart `.xsPlus` (6) ; hauteur `MeeshyControlSize.tapTarget`, `--target-min` ;
- texte `MeeshyFont.bodySize` (15) gras relatif ; glyphes `MeeshyIconSize.lg` (18) et `.xl` (20) ;
- verre : K01 `deep` + `dense` pour Quitter, le centre et la plaque ; encre `MeeshyColors.onMedia`, `MeeshyMediaChromeColors.OnMedia`, `--color-on-media` ;
- capsule pleine : fond, encre (`indigo950`, `--ios-indigo-950`) et ombre de l'actif de K02 ;
- plaque : bord `MeeshySpacing.md` (12), marges `.md` et `.mdPlus`, écart `.md`, rayon `MeeshyRadius.xxl` (24, `--radius-sheet`), bas `max(zone sûre + 12, 28)` comme K10.

Les valeurs propres (plafond 0,42 de la hauteur disponible, plancher 160, largeur 400, translation 12, durées 250, 200 et 150 ms, échelle minimale 0,8) vivent dans `MeeshyModeChromeRecipe`, nulle part ailleurs. Aucun appel à `glassEffect`, `adaptiveGlass`, `backdrop-filter` ni classe `.glass*` dans les fichiers de K16. Vecteurs communs : `docs/product/kit/K16-MeeshyModeChrome.vectors.json`.

## 7. Jumeaux
K16 ne rebranche ni ne supprime aucun jumeau (règle de K02 et K15) : il promeut le plus complet, l'écran change aux lots d'intégration.
- iOS. DEVIENT l'en-tête : les capsules de `ComposerSceneCameraBar` (`textControl`, `validateButton`, `doneButton`, `saveButton` et ses trois états), le centrage sur le cadre et `canFinish` de `MeeshySheetHeader`, le couple `onQuit` / `onValidate` de `ComposerSceneFriseFullScreen`. DEVIENT la plaque : `ComposerPropertiesSheetPlate` et `ComposerPropertiesSheetLayout` (épouse le contenu, plafond 42 %, plancher 160, défile, `holdsGesture`, ne renvoie pas le clavier). Réutilisé : `dismissOnEscape` (`MeeshyUI/Compatibility`).
- iOS, supprimés : par I4, les quatre capsules de `ComposerSceneCameraBar` (la loi `ComposerCaptureTopRow` reste à l'app), la sortie « OK » de `ComposerDrawingBar` et `ComposerTrailingOptionsPlate` côté dessin ; par I6, `ComposerSceneFriseFullScreen`, `enTetePleinEcran`, `friseAgrandie` ; par I5, `ComposerPropertiesSheetPlate`, `ComposerPropertiesSheetLayout`, `ComposerPropertiesHeader` et `ComposerTrailingOptionsPlate` (les options d'un objet passent dans la pilule, K11) ; par I9, « Terminé » et ⬇︎ de la retouche ; par I3 avec K17, `StoryTextEditTopBar`.
- iOS, hors K16 : `FullscreenTopBar` (barre du lecteur, autre grammaire) ; `MeeshySheetHeader` (reste dans les feuilles K15 ; I10 fait dessiner ses deux capsules par `MeeshyModeCapsule`) ; `MeeshyToolOptionsPanel` (un contenu, monté dans la plaque) ; `CallModeActionBar` (I1 arbitre).
- Android. DEVIENT : `SheetHeaderAction` et le centrage de `MeeshySheetHeader` (`:sdk-ui`, `chrome/`), l'état `finishing` de `RetouchTopRow`, la loi de `ScenePanelSurface` (`:feature:stories`, plafond puis défilement).
- Android, supprimés : par I9, `RetouchTopRow` ; par I4, les boutons ronds CLOSE et VALIDATE de `CaptureTopItem` (I4 réaligne aussi `CaptureTopRow` sur la disposition d'iOS) et l'accueil de `ComposerDrawingPanel` ; par I6, `ScenePanelSurface` et `PanelDone` (I6 construit le mode Frise, absent). Hors K16 : `FullscreenTopBar`, la barre de `CallMontagePicker` (I1).
- Web. DEVIENT l'en-tête : la rangée de `CallModeBar` (`call-mode-carousel.tsx`, grille `1fr auto 1fr`). DEVIENT la plaque : la coque de `StudioInlinePanel` (`routes/story-compose-inline-panel.tsx` : hauteur bornée, corps qui défile, `useBackDismiss` avec Échap), la largeur `STUDIO_PLATE` et l'entrée `.studio-plaque-rise` (`styles/app.css`).
- Web, supprimés : par I4, le ✕ rond de `story-compose-camera.tsx` (I4 construit le mode Dessin, absent) ; par I5, `StudioInlinePanel` ; par I6, les sections de verre de `story-compose-timeline.tsx` et `story-compose-effects.tsx`, `STUDIO_PLATE`, `.studio-plaque-rise` ; par I9, le ✕ `onCancel` de `StudioShell` et les « Terminé » de `story-compose.tsx` et `composer-audio-trim.tsx` ; par I1, `CallModeBar` et `GlassBar` si I1 retient K16 pour Montage.

## 8. Témoins exigés
Comportements (`MeeshyModeChromeTests`, `MeeshyModeChromeTest`, `meeshy-mode-chrome.test.tsx`) :
- loi 13 : ni validation, ni centre, ni accessoire, ni plaque hors de leurs conditions ; `stowed` ne rend rien et ne reçoit rien ;
- chaque action part une fois ; rien si désactivée ou occupée ; Échap, retour matériel et échappement appellent `exit.action` ; ⌘/Ctrl + Entrée appelle `confirm.action` ;
- un toucher hors capsules et plaque atteint le contenu de l'hôte ; un toucher sur la plaque ne l'atteint pas ;
- loi d'ajustement : chaque vecteur de largeurs rend la réduction attendue, dans l'ordre du § 5 ;
- plaque : épouse, plafonne, défile ; verrou de défilement ; bas selon la zone sûre ;
- haptique `light` par le site unique, aucune en `none` ;
- accessibilité : noms, rôle, valeur « en cours », ordre de lecture, annonce d'entrée ; web : focus à l'entrée et rendu à la sortie, anneau visible ;
- « réduire les animations » : aucune translation ; contraste calculé depuis les recettes de K01 et K02 ;
- non-re-rendu : l'en-tête n'est pas réévalué quand le contenu de la plaque change ;
- garde de source : aucun verre direct, aucune couleur en dur, aucun type du composer ni des appels ; web : `check-kit.mjs` vert ;
- parité : les vecteurs (loi 13, ajustement, hauteur et bas de plaque, mouvement) lus par les trois suites ; non-régression : le lot ne touche aucun jumeau ni aucun écran.

Instantanés (`MeeshyModeChrome/<id>.<variante>`) : `texte`, `coche`, `trois`, `accessoire`, `plaque`, `plaque-longue`, `sans-plaque`, `occupe`, `desactive`, `clair`, `large`, en `clair` et `sombre`, `presse` pour les capsules, planches `grande-police` et `rtl` ; iOS : suffixe `-iOS26` et `<id>-dessine`. Web : 390, 820 et 1440 px. Images enregistrées sur la branche du lot (`sdk-tests.yml` et `android.yml` avec `record_snapshots`, `CAPTURE_DIR=docs/product/kit/captures node scripts/check-kit.mjs`).

Catalogue : entrée K16, vide sur `dev` (`MeeshyKitCatalog+K16.swift`, `KitCatalogK16.kt`, `components/kit/catalog/k16.tsx`). Vues : `texte` et `plaque` A13, `coche` A8, `trois` C1, `large` I3, sur fond `media`, touchables.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Registre : O4 à O9 ne sont pas des modes (loi 6 révisée le 2026-11-09) ; A19 et I3 manquent ; `MeeshyToolOptionsPanel` et `FullscreenTopBar` ne sont pas des jumeaux.
- Quitter : capsule de verre à libellé (planche, viseur et frise iOS) ; ✕ rond (Android, web, appels).
- Valider : capsule blanche (planche, iOS) ; rond vert à coche (Android) ; absente (web). « Terminé » : blanc (planche), verre teinté indigo (iOS), bouton texte (Android).
- Hauteur visible : 44 (planche), 40 (viseur iOS), 32 (frise iOS).
- La planche pose Quitter sur un `deep` simple ; K01 réserve le `dense` à ce qui porte du texte (3,13:1 contre 6,12:1).
- La frise iOS peint « Plan temps » au centre ; la planche n'a pas de titre.
- Le code porte, sans vue : « retirer la dernière prise », les trois états d'enregistrement dans Photos, `canFinish`, le rendu en cours, la bascule de taille du viseur.
- Plaque : rayon 28 sans jeton ; verre teinté du plateau (iOS), surface opaque de 320 dp au plus (Android), verre de 20 ou 22 de rayon (web).
- Android n'a pas de mode Frise plein écran ; le web n'a ni mode Dessin ni en-tête Quitter · Valider.
- La planche ne montre aucun mode sur scène claire.

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. K16 couvre A8, A10, A13, A19, S8, S9, I3, C1, C2 ; O4 à O9 reviennent à K10 et K11. (Suivre le registre et doubler la pilule agrandie.)
2. Un cadre et trois pièces publiques (en-tête, plaque, capsule). (Un bloc unique, qui ne sert ni I3 ni C1.)
3. iOS : l'en-tête naît des capsules du viseur et du centrage de `MeeshySheetHeader`, la plaque de `ComposerPropertiesSheetPlate`. (Partir de la frise ; redessiner.)
4. `FullscreenTopBar`, `MeeshySheetHeader` et `MeeshyToolOptionsPanel` ne sont pas absorbés. (Tout fondre dans K16.)
5. Capsule visible de 44. (40 ou 32 du code.)
6. Quitter et le centre sur verre `deep` dense. (`deep` simple de la planche.)
7. La validation prend le fond, l'encre et l'ombre de l'actif de K02 ; coche ou texte au choix de l'hôte, le nom toujours dit. (Blanc sans ombre ; inversion sombre sur scène claire ; teinte de marque.)
8. Aucun titre peint ; le nom du mode vit dans l'accessibilité. (Titre centré comme la frise iOS.)
9. Ce que le code porte est conservé par les emplacements : `accessory`, capsule centrale occupée, validation désactivée ou occupée ; la bascule de taille reste dans le ⋯ de l'hôte. (Paramètres dédiés ; retrait.)
10. Plaque : loi de hauteur d'iOS (contenu, plafond 42 %, plancher 160, défilement), rayon `xxl`, bas de K10. (Rayon 28 en constante ; 320 dp d'Android ; hauteur libre.)
11. Échap, retour matériel et échappement valent Quitter ; ⌘/Ctrl + Entrée vaut Valider ; les deux se coupent. (Aucun raccourci ; Entrée seule.)
12. Un `light` sur chaque action, par le site unique. (`medium` de `StoryTextEditTopBar` ; aucune.)
13. Mouvement aux valeurs de K10 (250, 200, fondu de 150 en mouvement réduit). (Ressort de K15 ; immédiat.)
14. Présence à deux valeurs, commandée par l'hôte. (Retrait séparé de l'en-tête et de la plaque.)
15. Grand écran : l'hôte pose en-tête (retrait 24, ton `plain`) et plaque (400) lui-même. (Disposition large dans le cadre.)
16. Occupé : la roue du système à la place du glyphe, largeur gardée. (Anneau K09 ; libellé changé.)
17. La barre basse des modes d'appel reste à I1. (La migrer dans ce lot.)
18. Le lot ne rebranche aucun jumeau. (Rebrancher le viseur iOS dans le lot.)
