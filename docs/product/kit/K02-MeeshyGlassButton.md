# K02 — MeeshyGlassButton (le bouton rond de verre)

Relevé sur `origin/dev` `3790d3e23e` le 2026-11-11. Issue du lot : #17466 (chantier #17312, milestone 258). Dépend de K00 (#17335) et K01 (#17400). Lois 1 et 13 de `docs/product/composer-vue-finale.md`, loi 1 de `docs/product/appels-vue-finale.md` (#17323). Planche : `B(k,label,cls,size)` et `.btn`, `.btn.glass`, `.btn.on`, `.btn.red`, `.btn.soft`, employés par `head`, `pillItems`, `rail`, `camRail`, `camTop`, `xpill`, `sheet`, `kbar`, `toolBtn`, `objItems`, `retouchPill`, `timeline` et les vues A13, S9, O9, O10, I2, I4, C3, C4. Parité : `docs/product/kit/K02-MeeshyGlassButton.vectors.json`, lu par les trois suites.

## 1. Rôle
Un disque qui porte un glyphe seul, se touche, dit son nom à l'accessibilité et montre un des quatre états : normal, actif, destructif, doux.

Il ne fait pas :
- le verre, le ton ni la réponse du verre au toucher : K01 ;
- le conteneur, l'espacement, l'ordre et le choix de l'outil affiché : K10, K12, K16, K17 et l'app ;
- la légende : aucun texte visible, le nom vit dans l'accessibilité ;
- le libellé traduit, l'état métier, la confirmation d'un geste destructif, le menu ouvert : l'app ;
- Coller sur iOS (`PasteButton` du système, loi 19), Publier (K13), « + » de la rangée des scènes (K20), les cibles du glisser (K25), les rangées libellées des rails larges (K12), les grands boutons Accepter et Refuser d'un appel entrant.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyGlassButton.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-glass-button.tsx` |
|---|---|---|---|
| Bouton | `MeeshyGlassButton(systemImage:label:…action:)` | `MeeshyGlassButton(icon, label, onClick, modifier, …)` | `<MeeshyGlassButton label glyph onPress … />` |
| Disque seul | `MeeshyGlassButtonFace` (libellé d'un `Menu`) | `MeeshyGlassButtonFace` | `<MeeshyGlassButtonFace>` (`span`) |
| État visuel | `MeeshyGlassButtonKind { normal, active, destructive, soft }` | `enum class` identique | `'normal' \| 'active' \| 'destructive' \| 'soft'` |
| Taille | `MeeshyGlassButtonSize { s36, s40, s44, s48 }` | idem | `36 \| 40 \| 44 \| 48` |
| État dit | `MeeshyGlassButtonActivation { none, toggle(Bool), selected(Bool), expanded(Bool) }` | `sealed interface` identique | `{ toggle } \| { selected } \| { expanded, controls?, popup? }` |
| Recette en valeurs | `MeeshyGlassButtonRecipe.resolve(kind:size:tone:material:isNested:isPressed:isHovered:isEnabled:)` | idem | `meeshyGlassButtonRecipe(...)` : classes et attributs |

Paramètres, tous opaques, mêmes défauts partout :
- `label` (obligatoire, non vide) ; `hint: String? = nil` ; `value: String? = nil` (ce que le contrôle porte déjà : « AirPods », « 3 textes ») ;
- `kind = nil` : déduit de `activation` (vrai ⇒ `active`, sinon `normal`) ; se passe pour `destructive`, `soft` ou pour forcer ;
- `size = s44` ; `activation = none` ; `tone: MeeshyGlassTone? = nil` (celui de l'hôte, par K01) ; `tint: Color? = nil` (remis à K01) ; `glyphTint: Color? = nil` (encre du glyphe en `normal` et `soft` : l'ambre d'une pause) ;
- `haptic: MeeshyGlassButtonHaptic { light, none } = light` ; `onPressChange: ((Bool) -> Void)? = nil` ; `onLongPress` et `longPressLabel`, absents par défaut ;
- désactivé : `.disabled(_:)` sur iOS, `enabled = true` sur Android, `disabled` sur le web ; le web ajoute `data` (sondes `data-*` des gates).

Emplacements : `glyph` (à la place de `systemImage` / `icon`, il reçoit l'encre : le « Aa », la pastille de couleur, un drapeau) et `badge` (coin haut de fin : point « porte déjà », compteur, glyphe). Aucun emplacement de texte.

## 3. États
Matière selon l'état, K02 ne dessinant que des fonds pleins :
| | Liquid Glass (iOS 26+) | Verre dessiné, seul | Verre dessiné, dans un conteneur | Opaque |
|---|---|---|---|---|
| `normal` | verre interactif du système, fondu au groupe | verre de K01 au ton de l'hôte | rien : seul le glyphe | fond plein de K01, rien si emboîté |
| `active` | blanc plein sous le verre interactif | blanc plein, sans matière | idem | blanc plein |
| `destructive` | verre teinté rouge | rouge plein, sans matière | idem | rouge plein |
| `soft` | comme `normal` | voile blanc, sans flou | idem | voile blanc |

Un état par ligne :
- normal dans un conteneur : R1, R2 (Texte, Média en 48 ; ↶ ↷ en 40), R3 (rails), A8 (rail et réglages du viseur), O1, O4, O14, O15 (outils de l'objet), C1, C2, A13 (Marqueur, Gomme), S8 (Lire).
- normal seul, ton `plain` : R1, I1, I4 (✕), C4 (retour, 40) ; ton `deep` : R2 (✕) ; ton `onLight` : R13 (✕).
- actif : R3 et O2 ((…) ouvert), A2, A3, A4 (outil du clavier), O5 à O8 (outil courant), A13 (Stylo), C2 (Couper).
- destructif : S9 (Retirer, 40).
- doux : R7 à R9, S1 à S5, P5, O9, O10 (‹ et ✕ de la pilule agrandie, 40), R11, A14, A15, A19 (✕ de feuille, 36), A13 (annuler le trait), S9 (quatre actions), I2 (↶ ↷ du pied), C4 (Ajouter).
- glyphe de texte ou de couleur (emplacement `glyph`) : A1 à A4, O14.
- pressé, survolé, focus clavier, désactivé (contenu à 40 %, ni action ni haptique), teinté, ton `theme` (encre du thème ; actif = disque à l'encre du thème, glyphe inversé) : aucune vue, conservés du code.

Loi 13 :
- aucun bouton dans R4, A9, A20, O3, O12, S10 : l'hôte le retire, K02 n'a pas d'état « caché » ;
- pas de légende, pas de fond sous un bouton normal en conteneur dessiné, pas de rouge au repos dans la pilule d'objet (O1) ;
- pas de pastille sans valeur, pas de voile d'appui sur un bouton désactivé, pas d'anneau de focus au doigt.

## 4. Gestes et retours
- Toucher : `action` part une fois, au relâcher dans la cible. Appui long : seulement si `onLongPress` existe ; il est aussi une action nommée d'accessibilité.
- Réponse visuelle : celle de K01, sans échelle ajoutée par K02 (système sur iOS 26+, agrandissement 1,04 et reflet ailleurs). Là où K01 ne pose pas de matière (emboîté, fonds pleins), K02 pose un voile d'appui blanc. Il part au toucher, en moins d'une image, sans attendre l'action.
- « Réduire les animations » : pas d'échelle ni de ressort, le voile d'appui reste (l'appui se voit toujours, #8735).
- Haptique : un `light` à l'action, par `HapticFeedback.light()`, `MeeshyHaptics.light()` ou `impact('light')` de `lib/view/haptics.ts` ; `none` laisse l'hôte jouer le sien ; rien si désactivé.
- `onPressChange(true)` au doigt posé, `(false)` au doigt levé, et `(false)` si le bouton disparaît doigt posé.
- Changement d'état (normal ↔ actif) : fondu du fond et de l'encre, 200 ms, immédiat sous « réduire les animations ».
- Survol au pointeur (web, iPad) : reflet intermédiaire de K01, ou demi-voile sur un fond plein ; pas d'échelle.

## 5. Accessibilité
- Nom : `label`, jamais le nom du symbole. Rôle : bouton. Le glyphe et la pastille sont masqués.
- Valeur : `toggle` ⇒ trait `.isToggle` et « Activé / Désactivé » (iOS), `toggleableState` (Android), `aria-pressed` (web) ; `selected` ⇒ `.isSelected`, `selected`, `aria-pressed` ; `expanded` ⇒ `aria-expanded`, `aria-controls`, `aria-haspopup` sur le web, le nom qui change ailleurs (« Afficher les actions » / « Ranger les actions ») ; `value` s'y ajoute. Désactivé : annoncé, non activable.
- Ordre de lecture : un seul élément, nom, valeur, rôle, aide ; l'ordre entre boutons est celui de l'hôte.
- Cible : 44 pt, 48 dp, 44 px au moins pour les quatre tailles. Elle déborde le disque sans changer l'encombrement, qui reste le diamètre dessiné.
- Dynamic Type, `fontScale`, zoom : glyphe figé dans son disque. iOS ajoute le Large Content Viewer (glyphe et nom) ; le web mesure en `rem` et tient à 200 %.
- Web, clavier : `<button type="button">`, Tab, Entrée et Espace, anneau `:focus-visible` de K01 visible aussi sur blanc et sur rouge, `title` égal au nom. Android et iPad au clavier : même anneau.
- RTL : rien à refléter dans le disque ; la pastille suit le bord de fin ; un glyphe directionnel est l'affaire de l'hôte.
- Contraste, calculé depuis la recette : encre sombre sur blanc 15,99:1 ; glyphe blanc sur rouge 3,76:1 ; glyphe blanc sur doux 5,34:1 (verre dense) et 4,68:1 (`onLight`) au repos, 4,19:1 et 3,76:1 appuyé (relevé du 2026-11-11 : la recette de K01 composée en sRGB encodé sur le pire fond, blanc ; la première rédaction disait 4,63 et 3,96) ; normal : valeurs de K01. Le doux se pose sur un verre dense ou un fond sombre : sur `deep` simple et image blanche il tombe à 2,89:1.
- « Réduire la transparence » : K01 rend opaque ; les fonds pleins ne changent pas.

## 5 bis. Performance
- Ne se re-rend jamais : les voisins d'un bouton pressé, ni son hôte. iOS : `Face` est `Equatable`, l'appui vit dans le style du bouton. Android : paramètres stables, appui lu en phase de dessin. Web : `:active`, `:hover`, `:focus-visible` en CSS, aucun état ni écouteur tant que `onPressChange` et `onLongPress` sont absents.
- S'anime : l'échelle (K01), l'opacité du voile d'appui, l'opacité du fond au changement d'état. Jamais le flou, l'ombre ni la mise en page.
- Un flou par groupe : K02 n'en ajoute aucun, et un fond plein ne garde aucun flou dessous.
- Budget : dix-huit boutons à l'écran (pilule et deux rails, R3) sans image perdue à l'appui ni à la sortie des rails ; rien de retenu une fois l'écran quitté. Web : poids mesuré par `measure-weight.mjs`, première peinture sous son plafond.

## 6. Jetons et mesures
Mesures de la planche :
- diamètres 36, 40, 44 (défaut), 48 ; glyphe à 46 % du diamètre (17, 18, 20, 22), trait 1,8 ;
- actif : blanc 94 %, ombre y 4, flou 14, noir 22 % ; destructif : rouge 94 % ; doux : blanc 12 % ;
- pilule : boutons de 48, écart 6, marge 8, hauteur 64 ; rail : 44, écart 6, marge 5 ; ↶ ↷ : deux 40 accolés.

Jetons :
- diamètres : `MeeshyControlSize.regular` (36), `.large` (40), `.tapTarget` (44) ; 48 : jeton à ajouter, `MeeshyControlSize.xLarge`, sur iOS et Android (`size-12` sur le web) ;
- glyphes : `MeeshyIconSize.lg` (36 et 40), `.xl` (44), `.xxl` (48), graisse semi-grasse ;
- encre : `MeeshyColors.onMedia`, `MeeshyMediaChromeColors.OnMedia`, `--color-on-media` ; encre de l'actif : `indigo950`, `Indigo950`, `--ios-indigo-950` ;
- rouge : `MeeshyColors.errorStrong`, `MeeshyPalette.ErrorStrong`, `--ios-error-strong` ;
- cible : `MeeshyControlSize.tapTarget`, `.minTouchTarget`, `--target-min` ; ressort : `MeeshyAnimation.springFast`, `MeeshyMotion.springFast()`.

Les valeurs propres (fonds 94 %, voile 12 %, voile d'appui 22 %, survol 11 %, désactivé 40 %, ombre de l'actif) vivent dans `MeeshyGlassButtonRecipe`, nulle part ailleurs. Aucun appel à `glassEffect`, `adaptiveGlass`, `backdrop-filter` ni classe `.glass*` dans les fichiers de K02.

## 7. Jumeaux
K02 ne rebranche et ne supprime aucun jumeau : le rendu des appels (verre par bouton au ton `theme`, enfoncement à 0,88, tic au doigt posé, légendes, rouge clair) ne se reproduit pas par le kit sans changer l'écran. L'extraction est une promotion du code et des témoins du jumeau dans le kit ; le rebranchement est le travail des lots d'intégration, avec captures.
- iOS. DEVIENT le composant : `CallPillButton`, `CallPillGlyph`, `CallPillButtonKind`, `CallButtonGlassRule` (`Features/Call`, 17 appels) : la grammaire, la loi pure et ses témoins. Réutilisés : `.meeshyGlass`, `MeeshyGlassPressStyle`, `HapticFeedback`.
- iOS, supprimés : par I1, les quatre ci-dessus, `CallPillButtonLabel`, `CallButtonGlassModifier`, `CallButtonFill`, `CallPressButtonStyle` et ses aides, `callControlGlass`, `endCallGlass` ; par I2, `ComposerSceneRoundGlyph` et `roundButton` ; par I4, `glassControl` et `glassGlyph` de `ComposerSceneCameraBar` ; par I10, `FullscreenChromeDisc`, `FullscreenChromeButton`, `FullscreenCloseButton` (15 sites), les 52 appels directs de verre sur `Circle()` (37 fichiers), `toggleStateAccessibility` de l'app, et `MeeshyIconButton` s'il reste sans appelant.
- Android. DEVIENT : `CallPillButton`, `CallPillGlyph`, `CallPillKind`, `CallButtonFill`, `CallGlassButtonSurface` (`:feature:calls`, internes, 16 appels).
- Android, supprimés : par I1, ceux-là et `CallButtonGlassRule` ; par I2, `SceneRoundButton`, `SCENE_VEIL`, `ComposerRailButton` ; par I10, `FullscreenChromeDisc`, `FullscreenChromeButton`, le disque de `StoryRailButton` et de `FloatingDisc` (leurs gestes restent à l'app), 9 `MeeshyGlassSurface` ronds.
- Web. DEVIENT : `CallButton` (`components/call-glass-button.tsx`) et sa loi `lib/calls/call-button-glass.ts`.
- Web, supprimés : par I1, ces deux fichiers, `.glass-call-disc`, le ton `plain` de `RoundButton` (`call-round-button.tsx`), les ronds de `call-moderation-menu.tsx` et `call-screen.tsx` ; par I2, `StudioTile`, `StudioAnimatedToggle`, `ROUND_GLASS`, `PRESSED_TILE` (`routes/story-compose-chrome.tsx`) ; par I4, les ronds de `story-compose-camera.tsx` et `story-compose-parts.tsx` ; par I10, `GlassBack`, les disques `VIEWER_GLASS`, les ronds de `mood-page.tsx` et `conversation-preview-sheet.tsx`.

## 8. Témoins exigés
Comportements (`MeeshyGlassButtonTests`, `MeeshyGlassButtonTest`, `meeshy-glass-button.test.tsx`) :
- recette : chaque état × matière × emboîtement rend le fond, l'encre et la demande faite à K01 du tableau du § 3 ;
- quatre tailles : diamètre, glyphe, cible d'au moins 44 pt, 48 dp, 44 px ;
- nom, rôle, valeur pour `none`, `toggle`, `selected`, `expanded` ; `kind` déduit de `activation` ; désactivé : ni action ni haptique ;
- l'action part une fois ; un seul `light` par le site unique, aucun avec `none` ;
- repos ≠ pressé pour chaque état ; sous « réduire les animations », échelle 1 et voile présent ;
- `onPressChange` : vrai, faux, et faux à la disparition ; appui long exposé en action nommée ;
- contraste des quatre états calculé depuis la recette ; aucun texte visible rendu ;
- garde de source : aucun verre dessiné dans les fichiers de K02 ; web : `glass-site.mjs` et `check-kit.mjs` verts ;
- parité : `docs/product/kit/K02-MeeshyGlassButton.vectors.json`, lu par les trois suites ;
- non-régression : le lot ne touche aucun jumeau ni aucun écran.

Instantanés (`MeeshyGlassButton/<id>.<variante>`) : `normal`, `seul`, `seul-clair`, `actif`, `destructif`, `doux`, `texte`, `pastille`, `teinte`, `theme`, `desactive` en `clair` et `sombre`, `presse` pour ceux qui se touchent, planches `tailles`, `grande-police`, `rtl`. iOS : `-iOS26` et `-dessine` ; web : 390, 820 et 1440 px.

Catalogue : entrée K02 (`MeeshyKitCatalog+K02.swift`, `KitCatalogK02.kt`, `components/kit/catalog/k02.tsx`, vides aujourd'hui). Vues : `normal` R2 sur `media`, `seul` R1 sur `dark`, `seul-clair` R13 sur `light`, `actif` R3, `destructif` S9, `doux` S1, `texte` A2.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Les deux planches se contredisent : le composer dit « un inactif n'a pas de fond, jamais de verre sur du verre », les appels (#17323) donnent un verre à chaque bouton.
- L'actif du composer est teinté de marque (iOS `ComposerSceneRoundGlyph`, Android accent 55 %, web `PRESSED_TILE`) ; celui des appels est déjà le disque blanc.
- Fin est en `error` (#F87171, 2,77:1 sous un glyphe blanc) sur iOS et Android, en `error-strong` sur le web ; la planche dessine #E5484D.
- Les jumeaux RÉTRÉCISSENT à l'appui (0,88, `active:scale-95`) ; K01 agrandit.
- L'haptique des appels part au doigt posé (Android par `LocalHapticFeedback`, hors du site unique) ; ailleurs à l'action ; le web n'en joue pas.
- Le glyphe est figé dans les appels et le plein écran, relatif au Dynamic Type dans la caméra du composer.
- Les appels portent encore des légendes sous leurs boutons, sur les trois plateformes.
- La planche écrit `B('play','Lire','white',40)` : la classe `.btn.white` n'existe pas, la capture montre un bouton normal. Elle emploie aussi 42 px (C2).
- Registre : `CallSelfTileControlButton` n'existe plus (une garde interdit son retour) ; « environ 45 fichiers » se mesure à 37 fichiers et 52 lignes ; `MeeshyIconButton` n'a ni verre ni appelant.
- Aucun jeton de 48 sur iOS ; `MeeshyFont.fixedGlyph`, `toggleStateAccessibility` et ses deux mots vivent dans l'app.
- Tailles hors des quatre dans le code : 50 (Sortie), 28, et 56 à 76 pour l'appel entrant.
- K00 et K01 ne sont fusionnés que sur iOS : K01 Android est sur `claude/kit-k01-android`, K00 web sur `claude/kit-k00-web`, K01 web n'a pas de branche.

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. Normal en conteneur : Liquid Glass interactif par bouton sur iOS 26+, aucun fond en verre dessiné ; les appels prennent `soft` à I1. (Jamais de fond, même sur iOS 26 ; toujours un disque.)
2. Doux : voile blanc 12 % sans flou ni liseré, là où le verre est dessiné ; rendu du normal sous Liquid Glass. (Voile aussi sous Liquid Glass ; liseré du web.)
3. Actif : disque blanc à encre `indigo950` partout, la teinte de marque du composer part à I2 ; ton `theme` : disque à l'encre du thème. (Fond de marque.)
4. Destructif : `errorStrong`, 3,76:1 ; Fin change de rouge sur iOS et Android à I1. (`error` ; nouveau jeton #E5484D.)
5. Quatre tailles, pas de diamètre libre : 42 devient 44, 50 devient 48 à I1, « Lire » est normal, les boutons de 56 à 76 restent hors de K02. (Diamètre libre.)
6. L'encombrement est le diamètre dessiné, la cible déborde. (Encombrement égal à la cible.)
7. Glyphe figé et Large Content Viewer. (Glyphe et disque qui grandissent.)
8. Réponse au toucher de K01 seule, plus un voile d'appui là où K01 n'a pas de matière, gardé sous « réduire les animations ». (Garder le rétrécissement.)
9. Un `light` à l'action par le site unique ; le tic au doigt posé des appels passe par `onPressChange` à I1. (Tic au doigt posé par défaut.)
10. Aucune légende dans K02 : celles des appels sont composées par l'app autour de `MeeshyGlassButtonFace` jusqu'à I1. (Paramètre `caption`.)
11. L'état dit est `activation`, d'où `kind` se déduit ; « Activé / Désactivé » entre au catalogue de MeeshyUI. (Mots passés par l'app.)
12. L'ambre d'une pause est `glyphTint`, pas un cinquième état. (État `warning`.)
13. Coller sur Android et le web : K02 normal teinté de marque par `tint` ; `PasteButton` sur iOS. (Composant à part.)
14. Appui long optionnel, doublé d'une action nommée ; les menus iOS prennent `Face` pour libellé. (Pas d'appui long.)
15. `MeeshyIconButton` n'est pas un jumeau : intact, retiré par I10 s'il reste sans appelant. (L'absorber.)
16. Aucun jumeau rebranché dans K02 : le rebranchement change l'écran et revient à I1, I2, I4 et I10. (Faire de `CallPillButton` un renvoi dès K02.)

## 10. Livraison iOS (lot K02-ios) : décisions de mise en œuvre
- Fichiers : `Kit/MeeshyGlassButtonRecipe.swift` (valeurs : tenues, tailles, états dits, recette, mots du lecteur d'écran), `Kit/MeeshyGlassButton.swift` (`MeeshyGlassButtonFace`, `MeeshyGlassButton`, loi d'activation), `Kit/Catalog/MeeshyKitCatalog+K02.swift`. Deux chaînes entrent au catalogue de MeeshyUI : `kit.glass_button.toggle.on` et `.off`.
- Les jumeaux (`CallPill*`, `CallButtonGlassRule`, `ComposerSceneRoundGlyph`, `glassControl`, `FullscreenChromeDisc`/`FullscreenChromeButton`) restent en place, intacts : le lot ne change aucun écran (§ 7). La grammaire de `CallPillButton` (actif = disque blanc à encre sombre, Fin = rouge, ambre par l'encre, bascule dite) et la loi de `CallButtonGlassRule` (Liquid Glass interactif quand l'OS le permet, rouge teinté de Fin, voile d'appui dessiné avant iOS 26) sont reprises dans `MeeshyGlassButtonRecipe.resolve`, qui les teste en valeurs. Le rebranchement est le lot I1.
- Glyphe : les jetons `MeeshyIconSize` (`lg` 18 pour 36 et 40, `xl` 20, `xxl` 22), soit 18 au lieu des 17 de la planche pour le 36, à un point près.
- 48 : le jeton `MeeshyControlSize.xLarge` n'est pas ajouté par ce lot iOS seul, car `MeeshyScalesParityTest` (Android) exige que les deux tables portent les mêmes jetons ; il entre avec son miroir Android, à la constante `MeeshyGlassButtonSize.extraLargeDiameter` près.
- Appui visible sur un fond plein : le voile blanc de 22 % ne se voit pas sur le blanc de l'actif ; l'actif s'éclaircit donc vers 78 % d'opacité de fond sous le doigt (86 % au survol). Les autres fonds pleins prennent le voile blanc de 22 % (11 % au survol), le doux passe de 12 % à 22 % (17 % au survol).
- Sous le Liquid Glass la recette ne bouge ni à l'appui ni au survol : le système répond.
- Le ton `theme` : l'encre est `MeeshyColors.textPrimary(isDark:)`, l'actif y est le disque de cette encre et le glyphe `backgroundPrimary(isDark:)`.
- Pas d'état occupé : la fiche du 2026-11-11 ne le porte pas (un état de plus sans vue).
- Relecture du 2026-11-11 :
  - le fondu normal ↔ actif se pose AU-DESSUS de la demande faite à K01 : sur le verre dessiné, passer de « verre » à « fond plein » change l'identité du disque, et le fondu posé dessous ne jouait pas (bascule sèche) ; c'est désormais un fondu enchaîné de 200 ms, immédiat sous « réduire les animations », l'ombre de l'actif restant hors animation ;
  - l'appui long garde son action nommée sans `longPressLabel` (elle prend le nom du bouton) : sans cela, il était hors d'atteinte du lecteur d'écran ;
  - `.disabled` ne change plus l'identité du bouton (le geste d'appui long ne dépend que de sa présence ; désactivé, il ne fait rien) ;
  - `onPressChange` suit une loi pure, `MeeshyGlassPressReport`, lue dans les vecteurs (`pressReport`) ;
  - l'échantillon `normal` (R2) du catalogue ne pose plus de verre de pilule sous le Liquid Glass : les verres des boutons s'y fondent en groupe, jamais de verre sur du verre ; le verre de la pilule n'existe que dessiné (K10 en héritera).
