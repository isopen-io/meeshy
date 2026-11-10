# K02 — MeeshyGlassButton (le bouton rond de verre)

Relevé sur `origin/dev` `6e7f37fc2b` le 2026-11-10. Registre : `.claude/workflows/meeshy-kit-planche.lots.json`. Lois 1 et 13 de `docs/product/composer-vue-finale.md` (loi 1 des appels, #17323). Planche : `B(k, label, cls, size)` et `.btn`, employés par `head`, `pillItems`, `rail`, `camRail`, `camTop`, `xpill`, `sheet`, `kbar`, `toolBtn`, `objItems`, `retouchPill`, `timeline`, et en direct par A13, O9, O10, S9, I2, I4, C3, C4. Dépend de K00 et K01.

Issue du lot : #17466. Parité : `docs/product/kit/K02-MeeshyGlassButton.vectors.json`, lu par les trois suites.

## 1. Rôle
Un disque à icône seule qui déclenche une action, dans quatre tenues (normal, actif, destructif, doux) et quatre tailles, nommé par l'accessibilité.

Il ne fait pas :
- le verre ni la réponse au toucher : K01 (`.meeshyGlass(in: Circle(), isInteractive: true)`) ; K02 ne dessine que les fonds pleins (blanc, rouge, voile doux) ;
- la légende : jamais. Une unité « disque + légende » (rangées d'un appel de groupe, appel entrant) se compose côté app autour de `MeeshyGlassDisc` ;
- le choix d'offrir ou non un outil, l'ordre, l'espacement, le conteneur (K10, K12, K16) ;
- Coller (bouton système, loi 19), le déclencheur (I4), le « + » et la croix de la rangée des scènes (K20), Publier (K13) ;
- le glisser d'un disque flottant, le balayage du rail des stories, le menu d'un appui long : l'app.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyGlassButton.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-glass-button.tsx` |
|---|---|---|---|
| Tenue | `enum MeeshyGlassButtonKind { normal, active, destructive, soft }` | `enum class MeeshyGlassButtonKind` | `'normal' \| 'active' \| 'destructive' \| 'soft'` |
| Taille | `enum MeeshyGlassButtonSize { small, compact, regular, large }` (36, 40, 44, 48) | idem, en dp | `'small' \| 'compact' \| 'regular' \| 'large'` (rem) |
| Recette en valeurs | `MeeshyGlassButtonRecipe.resolve(kind:size:ink:isEnabled:isBusy:)` | idem | `meeshyGlassButtonRecipe(...)` (classes et attributs) |
| Ce qu'on voit | `MeeshyGlassDisc(systemImage:kind:size:ink:tone:isPressed:)` | `MeeshyGlassDisc(icon, modifier, kind, size, ink, tone, pressed)` | `<MeeshyGlassDisc glyph kind size ink tone>` |
| Le bouton | `MeeshyGlassButton(systemImage:label:kind:size:isOn:hint:value:ink:tone:isBusy:haptic:onLongPress:longPressLabel:onPressChange:action:)` | `MeeshyGlassButton(icon, label, onClick, modifier, kind, size, isOn, hint, value, ink, tone, enabled, busy, haptic, onLongPress, longPressLabel, interactionSource)` | `<MeeshyGlassButton label glyph onPress kind size pressed hint value ink tone disabled busy haptic onLongPress longPressLabel expanded controls popup data buttonRef>` |

- Défauts : `kind = normal`, `size = regular`, `isOn = nil` (pas une bascule), `hint`, `value`, `ink`, `tone` absents (`tone` absent ⇒ celui de l'hôte, K01), `isBusy = false`, `haptic = .light` (`none`, `light`, `medium`), pas d'appui long. iOS se désactive par `.disabled(_:)`.
- Emplacements : `glyph` (remplace l'icône : « Aa », pastille de couleur, drapeau ; reçoit l'encre) et `badge` (coin haut de fin, muet pour le lecteur d'écran ; son sens passe par `value`).
- `ink` : encre du glyphe hors tenue active (ambre de la pause automatique, teinte d'un état du lecteur). Types opaques : aucune notion d'appel ni de composer.
- `onPressChange` (iOS) et `interactionSource` (Android) : l'hôte apprend le doigt posé et levé (maintien du chrome des appels).
- Web seulement : `expanded`, `controls`, `popup` (ARIA), `data` (prises de mesure), `title` = `label`.

## 3. États
- Normal dans un conteneur de verre : R2 (pilule, 48 ; ↶ ↷, 40), R3 (rails, 44), A8 (viseur). Verre dessiné : aucun fond. iOS 26+ : Liquid Glass interactif, fondu dans le groupe.
- Normal seul (son propre verre, ton de K01) : R1 (`plain`), R2 (`deep`), R13 (`onLight`), I1, C4 (retour, 40).
- Actif, disque blanc plein à icône sombre : R3 ((…) ouvert), A2 à A4 (barre du clavier), A13 (Stylo), O2, O5 à O8 (outil courant).
- Destructif, rouge plein : S9 (Retirer, 40) ; Fin des appels.
- Doux, voile blanc sans flou : R7 à R9 et S1 à S5 (‹ et ✕ de la pilule agrandie, 40), A11 (✕ de feuille, 36), A13 (↶), S9, I2 (↶ ↷).
- Glyphe propre : A1 à A5, O14 (« Aa », ●).
- Désactivé (opacité 0,4), occupé (indicateur à la place du glyphe), avec pastille, pressé, focus clavier, survol : aucune vue ; conservés du code.

Loi 13 :
- jamais de légende, jamais de second verre dans un conteneur dessiné ;
- un outil que le contexte n'offre pas est ABSENT (l'hôte le retire) ; « désactivé » ne sert qu'à un refus passager (↷ sans futur, pendant une prise) ;
- pas de rouge au repos dans la pilule ; pas de pastille pour une valeur vide ou nulle ;
- désactivé ou occupé : ni réponse au toucher, ni haptique, ni action ;
- pas d'ombre, sauf l'actif (et celle du verre seul, que K01 porte).

## 4. Gestes et retours
- Toucher : l'action part au relâcher. Réponse visuelle : celle de K01, au premier contact (système sous iOS 26+, dessinée ailleurs). Les rétrécissements des jumeaux (0,88, 0,93, 0,95) disparaissent à l'adoption : les deux ne s'empilent pas.
- Appui long, seulement si `onLongPress` : 500 ms, annulé au-delà de 10 pt de déplacement, sans déclencher l'action. Lecteur d'écran : action nommée `longPressLabel`. Web : aussi `contextmenu` (clic droit, touche Menu).
- Haptique : un impact à l'activation, par `HapticFeedback`, `rememberMeeshyHaptics()` ou `impact()` de `lib/view/haptics.ts`. `haptic: none` quand l'hôte joue le sien.
- Changement de tenue : fondu du fond et de l'encre, 200 ms (durée du fondu de ton de K01), sans mise en page. « Réduire les animations » : immédiat, et K01 coupe l'échelle.

## 5. Accessibilité
- Nom : `label`, obligatoire, traduit par l'hôte ; il dit l'action (« Ranger les actions » quand (…) est ouvert). Rôle : bouton. Glyphe et pastille masqués.
- Valeur : `isOn` ⇒ bascule (`aria-pressed`, `toggleableState`, trait de bascule) ; `isOn` absent et tenue active ⇒ « sélectionné » ; `value` ⇒ ce que l'option porte ; occupé ⇒ `aria-busy` et son pendant ; `hint` ⇒ l'effet.
- Ordre de lecture : celui de l'hôte ; un seul élément par bouton.
- Texte agrandi : le glyphe reste à sa taille dans le disque. iOS : `accessibilityShowsLargeContentViewer` (glyphe et nom). Android : `fontScale` 2,0 sans effet sur le disque. Web : tailles en rem, zoom 200 % sans rognage.
- Cible : 44 pt, 48 dp, 44 px au moins, quelle que soit la taille dessinée ; elle occupe sa place dans la mise en page.
- Web : `<button type="button">`, Entrée et Espace, anneau `:focus-visible` de K01 visible sur les quatre tenues, `disabled` natif.
- RTL : disque symétrique ; pastille au coin de fin (propriétés logiques) ; le sens d'un glyphe directionnel revient à l'hôte.
- Contraste : glyphe ≥ 3:1. Normal et doux : garanti par le ton de K01. Actif : encre sombre sur blanc, plus de 15:1. Destructif : blanc sur rouge, 3,8:1.

## 5 bis. Performance
- Ne se re-rend jamais : les voisins d'un bouton pressé ou qui change de tenue ; le bouton quand son hôte se re-rend à paramètres égaux (`Equatable` sur les valeurs, fermetures hors comparaison ; lambdas stables sur Android ; `memo` sur le web).
- L'appui ne passe par aucun état de l'hôte : environnement du libellé (iOS), `graphicsLayer` en phase de dessin (Android), `:active` (web, ni écouteur ni état ; la minuterie d'appui long n'existe que si `onLongPress`).
- S'anime : `transform` et opacité (appui, K01), opacité du fond et couleur de l'encre (tenue). Jamais la taille, le flou ni l'ombre.
- Un flou par groupe : un bouton dans un conteneur n'en pose aucun.
- Budget : aucune image perdue pendant l'appui ; un rail de huit boutons ne redessine que celui qui change ; rien de retenu une fois l'écran quitté.

## 6. Jetons et mesures
Mesures de la planche :
- diamètres 36, 40, 44, 48 ; glyphe = 46 % du diamètre (17, 18, 20, 22), trait 1,8 sur une grille de 24 ;
- actif : blanc 94 %, ombre y 4, flou 14, noir 22 % ; destructif : rouge 94 % ; doux : blanc 12 % (22 % sous le doigt, valeur du web).

Jetons :
- encre : `MeeshyColors.onMedia`, `MeeshyMediaChromeColors.OnMedia`, `--color-on-media` ;
- encre de l'actif : `MeeshyColors.indigo950`, `MeeshyPalette.Indigo950`, `--ios-indigo-950` ;
- rouge : `MeeshyColors.error`, `MeeshyPalette.Error`, `--ios-error-strong` ;
- cible : `MeeshyControlSize.tapTarget` ; 48 dp ; `size-11` ;
- désactivé 0,4 ; fondu : `MeeshyGlassRecipe.toneFadeDuration`.

Toute valeur chiffrée vit dans `MeeshyGlassButtonRecipe` (web : les classes du composant, le voile doux restant dans `glass.css`).

## 7. Jumeaux
- iOS. DEVIENT : `CallPillGlyph`, `CallPillButton`, `CallPillButtonKind` et la loi `CallButtonGlassRule` (`Features/Call`), remontés au SDK ; la forme disque / bouton, `hint` et la pastille viennent de `FullscreenChromeDisc` / `FullscreenChromeButton`.
- iOS, supprimés : par I1, les cinq ci-dessus, `CallButtonGlassModifier`, `CallButtonFill`, l'échelle de `CallPressButtonStyle` (`callChromeInteraction` passe par `onPressChange`, `CallPillButtonLabel` devient la composition légendée de l'app) ; par I2, `ComposerSceneRoundGlyph` et `roundButton` ; par I4, `glassControl` et `glassGlyph` de `ComposerSceneCameraBar` ; par I10, `FullscreenChromeDisc` et `FullscreenChromeButton` (renvois d'ici là) et les appels directs restants. Mesuré : 50 appels de verre sur `Circle()` dans 41 fichiers, dont 42 hors tests (Main 18, SDK 12, Composer 8, Call 2, Stories 1, Links 1).
- iOS, non absorbé : `MeeshyIconButton` (icône nue, sans disque).
- Android. DEVIENT : `CallPillButton`, `CallPillGlyph`, `CallPillKind`, `CallButtonFill` (`:feature:calls`), avec la pastille de `ComposerRailButton`.
- Android, supprimés : par I1, ces quatre et `CallGlassButtonSurface` en disque ; par I2, `SceneRoundButton` (15 sites) et `ComposerRailButton` ; par I10, `FullscreenChromeDisc` / `FullscreenChromeButton` (16 sites). `StoryRailButton` et `FloatingDisc` gardent leurs gestes et prennent `MeeshyGlassDisc` (I10).
- Web. DEVIENT : `CallButton` (`call-glass-button.tsx`) et sa loi `lib/calls/call-button-glass.ts`.
- Web, supprimés : par I1, `CallButton`, la loi, `RoundButton` (`call-round-button.tsx`) ; par I2, `StudioTile`, `ROUND_GLASS`, `PRESSED_TILE` (`routes/story-compose-chrome.tsx`, 16 emplois) ; par I10, `GlassBack` et les disques `VIEWER_GLASS viewer-disc` (13 emplois : `viewer-chrome`, `media-transport`, `viewer-scene-page`, `story-action-rail`, `viewer-chrome-menu`). `ChromeActionDisc` (disque teinté de 28, pas du verre) reste.
- K02 ne supprime rien et ne change aucun écran.

## 8. Témoins exigés
Comportements (`MeeshyGlassButtonTests`, `MeeshyGlassButtonTest`, `meeshy-glass-button.test.tsx`) :
- recette par tenue et par taille : diamètre, glyphe, fond, encre, cible ≥ 44 / 48 ;
- actif sans `isOn` ⇒ « sélectionné » ; `isOn` ⇒ bascule ; le nom est toujours présent, la légende jamais ;
- désactivé et occupé : pas d'action, pas d'haptique, pas d'appui ;
- un seul retour haptique par activation, aucun avec `none` ; appui long : son action, pas celle du toucher ; clavier (Entrée, Espace, touche Menu) sur le web ;
- dans un verre dessiné, le normal ne porte aucune matière et garde sa réponse ; « réduire les animations » ⇒ aucune échelle, tenue immédiate ;
- contraste de chaque tenue, calculé depuis la recette ;
- parité : `docs/product/kit/K02-MeeshyGlassButton.vectors.json`, lu par les trois suites ;
- un voisin ne se re-rend pas quand un bouton change de tenue.

Instantanés (`MeeshyGlassButton/<id>.<variante>`) : `normal-groupe`, `seul-plain`, `seul-deep`, `seul-onlight`, `actif`, `destructif`, `doux`, `glyphe-propre`, `desactive`, `occupe`, `pastille`, `tailles` ; variantes `clair`, `sombre`, `presse` ; planches `grande-police` et `rtl` ; iOS en `-iOS26` et `-dessine` ; web à 390, 820 et 1440 px.

Catalogue : entrée K02 (`MeeshyKitCatalog+K02.swift` et `KitCatalogK02.kt`, vides sur `dev` ; `catalog/k02.tsx` à créer). Vues : `normal-groupe` R2, `seul-plain` R1, `seul-deep` R2, `seul-onlight` R13 sur fond `light`, `actif` R3, `destructif` S9, `doux` R7, `glyphe-propre` A2.

## 9. Écarts connus et choix retenus
Écarts :
- Seul le lot iOS peut partir : K00 et K01 sont fusionnés sur iOS ; Android n'a que K00 (K01 sur `claude/kit-k01-android`) ; le web n'a ni `components/kit/`, ni `/kit`, ni `check-kit.mjs`.
- Registre : `CallSelfTileControlButton` n'existe plus (`CallViewGlassGuardTests` le liste comme retiré) ; le web a cinq familles de boutons ronds, pas une ; la planche compte 73 vues.
- Diamètres du code : appels 48, composer 44, caméra et lecteur 40 dans 44, Android 40 dans 48. Glyphe : 40 % (appels iOS), 45 % (appels Android), 46 % (planche).
- L'actif du composer est teinté à la marque (iOS, Android 55 % et 22 %, web `PRESSED_TILE`) ; la planche le veut blanc.
- L'haptique part avant l'action (lecteur), après (composer) ou au doigt posé (appels ; Android l'appelle hors du site unique).
- `MeeshyFont.fixedGlyph` est côté app : le SDK fixe la taille du glyphe lui-même.
- Planche : `B('play','Lire','white',40)` (S8) emploie une classe `.btn.white` qui n'existe pas ; C2 dessine des boutons de 42.
- La loi 1 des appels (#17323) donne un verre à chaque bouton, celle du composer aucun fond au bouton inactif.

Choix retenus (mode autonome ; alternatives dans le rendu du lot) :
1. Pas de légende dans K02 ; l'unité légendée des appels se compose côté app autour de `MeeshyGlassDisc`.
2. K02 demande toujours un verre interactif à K01, qui tranche : Liquid Glass par bouton sous iOS 26+, aucune matière dans un conteneur dessiné. Aucun paramètre.
3. Doux = voile 12 % en verre dessiné (le disque actuel des appels sur le web), Liquid Glass sous iOS 26+.
4. La réponse au toucher est celle de K01 ; les rétrécissements partent à l'adoption.
5. Un impact léger à l'activation ; le choc au doigt posé des appels reste à l'app, par `onPressChange`.
6. Quatre tailles fermées ; C2 prend 44 (sept boutons tiennent : 360 sur 390).
7. La cible occupe sa place ; l'hôte espace des cibles.
8. Glyphe fixe ; grand afficheur de contenu sur iOS, rem sur le web.
9. L'actif est blanc partout ; la teinte de marque part aux lots I2 et I4, sur captures.
10. `ink` garde l'ambre et les teintes d'état ; pas de cinquième tenue.
11. « Lire » de S8 est un bouton normal, comme la capture le montre.
12. Actif sans `isOn` s'annonce « sélectionné ».
13. L'appui long reste offert (source du média, sortie audio) : la loi 6 ne vise que les objets.
14. `MeeshyIconButton`, `ChromeActionDisc`, le glisser de `FloatingDisc` et le balayage de `StoryRailButton` ne sont pas absorbés.
15. Encre de l'actif et rouge : les jetons existants, pas les valeurs de la planche.

## 10. Livraison iOS (lot K02-ios) et décisions de mise en œuvre
- Fichiers : `Kit/MeeshyGlassButtonRecipe.swift` (valeurs), `Kit/MeeshyGlassButton.swift` (`MeeshyGlassDisc`, `MeeshyGlassButton`), `Kit/Catalog/MeeshyKitCatalog+K02.swift`.
- Rouge du destructif : `MeeshyColors.errorStrong` (`EF4444`, le `--ios-error-strong` que la fiche cite pour le web). `MeeshyColors.error` (`F87171`) donne 2,8:1 avec l'encre blanche ; seul `errorStrong` tient les 3,8:1 que la fiche promet. Le témoin de contraste le garde.
- Les jumeaux (`CallPill*`, `CallButtonGlass*`, `ComposerSceneRoundGlyph`, `glassControl`, `FullscreenChromeDisc` et `FullscreenChromeButton`) restent en place, intacts : « K02 ne supprime rien et ne change aucun écran » (§ 7). Leurs remplacements par un renvoi ou une suppression sont les lots I1, I2, I4 et I10.
- La légende des Call reste `CallPillButtonLabel` côté app (composition légendée autour de `MeeshyGlassDisc`, I1).
- Le comportement « actif sans `isOn` ⇒ sélectionné » passe par le trait système `isSelected` (sans nouvelle chaîne à traduire) ; la bascule ajoute `isToggle` (iOS 17+).
