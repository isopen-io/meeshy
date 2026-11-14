# K02 — MeeshyGlassButton (le bouton rond de verre)

Relevé sur `origin/dev` `fe780f4b1a` le 2026-11-11. Issue du lot : #17466 (chantier #17312, milestone 258). Dépend de K00 (#17335) et de K01 (#17400). Lois 1 et 13 de `docs/product/composer-vue-finale.md` ; loi 1 des appels (#17323). Planche : `B(k,label,cls,size)` (ligne 172) et `.btn`, `.btn.glass`, `.btn.on`, `.btn.red`, `.btn.soft` (lignes 30 à 37), employés par `head`, `pillItems`, `rail`, `camRail`, `camTop`, `xpill`, `sheet`, `kbar`, `toolBtn`, `objItems`, `retouchPill`, `ipadL` et, en direct, par A13, S8, S9, O9, O10, I2 à I4, C4. La planche compte 73 vues sur `dev` (le registre en dit 70) ; 65 portent au moins un bouton de K02.

Reprise. Le composant iOS a été écrit, fusionné (PR #17474) puis retiré de `dev` par `fe780f4b1a` : ses images de référence `__Snapshots__/MeeshyGlassButton/*` n'avaient jamais été enregistrées, et la suite d'instantanés comme la garde du registre rougissaient. Le code complet vit à `fdc6f439ad` (composant, recette, catalogue, chaînes, deux suites, vecteurs `K02-MeeshyGlassButton.vectors.json`). Le lot iOS le REPREND tel quel, sans changer un nom, et sa PR porte ses images. Socles : K00 est fusionné sur les trois plateformes ; K01 l'est sur iOS, a été retiré de `dev` sur Android (`8b881d23d7`, mêmes images manquantes) et attend sur le web (PR #17515).

## 1. Rôle
Un disque qui porte un glyphe seul, se touche, dit son nom à l'accessibilité et montre un des quatre états : normal, actif, destructif, doux.

Il ne fait pas :
- le verre, le ton ni la réponse du verre au toucher : K01 ;
- le conteneur, l'espacement, l'ordre et le choix de l'outil affiché : K10, K12, K16, K17 et l'app ;
- la légende : aucun texte visible ;
- le libellé traduit, l'état métier, la confirmation d'un geste destructif, le menu ouvert : l'app ;
- les autres `.btn` de la planche : Coller sur iOS (`PasteButton`, loi 19), Publier (K13), « + » et la croix de la rangée des scènes (K20), les cibles du glisser (K25), le déclencheur de 72 et 84 (I4), les rangées libellées `.rl .it` (K12), Envoyer de C4, Accepter et Refuser d'un appel entrant (56 à 76).

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyGlassButton.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-glass-button.tsx` |
|---|---|---|---|
| Bouton | `MeeshyGlassButton(systemImage:label:…action:)` | `MeeshyGlassButton(icon, label, onClick, modifier, …)` | `<MeeshyGlassButton label glyph onPress … />` |
| Disque seul | `MeeshyGlassButtonFace` (libellé d'un `Menu`) | `MeeshyGlassButtonFace` | `<MeeshyGlassButtonFace>` (`span`) |
| État visuel | `MeeshyGlassButtonKind { normal, active, destructive, soft }` | `enum class` identique | `'normal' \| 'active' \| 'destructive' \| 'soft'` |
| Taille | `MeeshyGlassButtonSize { s36, s40, s44, s48 }` | idem | `36 \| 40 \| 44 \| 48` |
| État dit | `MeeshyGlassButtonActivation { none, toggle(Bool), selected(Bool), expanded(Bool) }` | `sealed interface` identique | `{ toggle } \| { selected } \| { expanded, controls?, popup? }` |
| Recette en valeurs | `MeeshyGlassButtonRecipe.resolve(kind:size:tone:material:isNested:isPressed:isHovered:isEnabled:glyphTint:)` | idem | `meeshyGlassButtonRecipe(...)` : classes et attributs |

Paramètres, tous opaques, mêmes défauts partout :
- `label` (obligatoire, non vide) ; `hint: String? = nil` ; `value: String? = nil` (ce que le contrôle porte déjà : « AirPods », « 3 textes ») ;
- `kind = nil` : déduit de `activation` (vrai ⇒ `active`, sinon `normal`) ; se passe pour `destructive`, `soft` ou pour forcer ;
- `size = s44` ; `activation = none` ; `tone: MeeshyGlassTone? = nil` (celui de l'hôte, par K01) ; `tint: Color? = nil` (remis à K01) ; `glyphTint: Color? = nil` (encre du glyphe en `normal` et `soft`) ;
- `haptic: MeeshyGlassButtonHaptic { light, none } = light` ; `onPressChange: ((Bool) -> Void)? = nil` ; `onLongPress` et `longPressLabel`, absents par défaut ;
- désactivé : `.disabled(_:)` (iOS), `enabled = true` (Android), `disabled` (web) ; le web ajoute `data` (sondes `data-*` des gates).

Emplacements : `glyph` (à la place de `systemImage` / `icon` ; il reçoit l'encre : le « Aa », la pastille de couleur, un drapeau) et `badge` (coin haut de fin : point « porte déjà », compteur). Aucun emplacement de texte.

## 3. États
K02 ne dessine que des fonds pleins ; la matière est demandée à K01 :
| | Liquid Glass (iOS 26+) | Verre dessiné, seul | Verre dessiné, dans un conteneur | Opaque |
|---|---|---|---|---|
| `normal` | verre interactif du système, fondu au groupe | verre de K01 au ton de l'hôte | rien : le glyphe seul | fond plein de K01, rien si emboîté |
| `active` | blanc plein sous le verre interactif | blanc plein, sans matière | idem | blanc plein |
| `destructive` | verre teinté rouge | rouge plein, sans matière | idem | rouge plein |
| `soft` | comme `normal` | voile blanc, sans flou | idem | voile blanc |

Un état par ligne, avec ses vues :
- normal dans un conteneur : pilule en 48 (R1 à R3, R5 à R8, R10, R13, A7, A21, S1 à S5, P1 à P3, P5, P6) ; ↶ ↷ en 40 (R2, O1, C3 et toutes les vues à historique) ; rails en 44 (R3) ; viseur (A8, A19) ; barre du clavier (A1, A5, O11, S6, S7) ; outils de l'objet en 48 (O1, O4, O13 à O15, C3) ; retouche (C1, C2) ; plaque (A13 Marqueur et Gomme ; S8, S9, I3 Lire en 40) ; iPad (I1, I4, ↶ ↷ en 44).
- normal seul : ✕ en 44, ton `plain` (R1, I1, I2, I4), ton `deep` (R2 et les vues de repos), ton `onLight` (R13) ; retour en 40 (C4).
- actif : R3 ((…) ouvert), O2 ((…) de l'objet), A2, A3, A4 (outil du clavier), O5 à O8 (outil courant), A13 (Stylo), C2 (Couper).
- destructif : S9 (Retirer, 40).
- doux : ‹ et ✕ de la pilule agrandie en 40 (R7 à R9, S1 à S5, P5, O9, O10) ; ✕ de feuille en 36 (R11, A11, A12, A14, A16 à A19) ; A13 (annuler le trait) ; S9 (quatre actions) ; I2 (↶ ↷ du pied) ; C4 (Ajouter).
- glyphe de texte ou de couleur (emplacement `glyph`) : A1 à A5, O11, O14, S6.
- pressé, survolé, focus clavier, désactivé (contenu à 40 %, ni action ni haptique), teinté, pastille, ton `theme` (encre du thème ; actif = disque à l'encre du thème, glyphe inversé) : aucune vue, conservés du code.

Loi 13 :
- aucun bouton dans R4, A6, A9, A15, A20, O3, O12, S10 : l'hôte le retire ; K02 n'a pas d'état « caché » ni de ligne grisée « à venir » ;
- pas de légende ; pas de fond sous un bouton normal dans un conteneur dessiné ; pas de rouge au repos dans la pilule d'objet (O1) ;
- pas de pastille sans valeur, pas de voile d'appui sur un bouton désactivé, pas d'anneau de focus au doigt.

## 4. Gestes et retours
- Toucher : `action` part une fois, au relâcher dans la cible. Appui long : seulement si `onLongPress` existe (0,5 s, 10 pt de jeu).
- Réponse visuelle : celle de K01, sans échelle ajoutée par K02 (système sur iOS 26+ ; agrandissement 1,04 et reflet ailleurs). Là où K01 ne pose pas de matière, K02 répond lui-même : voile blanc 22 % (rouge, emboîté), doux de 12 à 22 %, actif de 94 à 78 % d'opacité. La réponse part au toucher, en moins d'une image, sans attendre l'action.
- « Réduire les animations » : ni échelle ni ressort ; le voile d'appui reste (#8735).
- Haptique : un `light` à l'action, par `HapticFeedback.light()`, `MeeshyHaptics.light()` ou `impact('light')` de `lib/view/haptics.ts` ; `none` laisse l'hôte jouer le sien ; rien si désactivé.
- `onPressChange(true)` au doigt posé, `(false)` au doigt levé, et `(false)` si le bouton disparaît doigt posé (loi pure `MeeshyGlassPressReport`).
- Changement d'état (normal ↔ actif) : fondu enchaîné du fond et de l'encre, 200 ms, immédiat sous « réduire les animations ».
- Survol au pointeur (web, iPad) : reflet intermédiaire de K01, ou demi-voile sur un fond plein ; pas d'échelle.

## 5. Accessibilité
- Nom : `label`, jamais le nom du symbole. Rôle : bouton. Glyphe et pastille masqués.
- Valeur : `toggle` ⇒ `.isToggle` et « Activé / Désactivé » (iOS), `toggleableState` (Android), `aria-pressed` (web) ; `selected` ⇒ `.isSelected`, `selected`, `aria-pressed` ; `expanded` ⇒ `aria-expanded`, `aria-controls`, `aria-haspopup` sur le web, le nom qui change ailleurs (« Afficher les actions » / « Ranger les actions ») ; `value` s'y ajoute. Désactivé : annoncé, non activable.
- Appui long : toujours une action nommée ; sans `longPressLabel`, elle prend le nom du bouton (#17497).
- Ordre de lecture : un seul élément (nom, valeur, rôle, aide) ; l'ordre entre boutons est celui de l'hôte.
- Cible : 44 pt, 48 dp, 44 px au moins pour les quatre tailles ; elle déborde le disque sans changer l'encombrement. Deux 40 accolés (↶ ↷) se partagent le débord : 42 de large chacun.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : glyphe figé dans son disque. iOS ajoute le Large Content Viewer (glyphe et nom) ; le web mesure en `rem`.
- Web, clavier : `<button type="button">`, Tab, Entrée et Espace, anneau `:focus-visible` de K01 visible aussi sur blanc et sur rouge, `title` égal au nom, `hint` en `aria-description`. Android et iPad au clavier : même anneau.
- RTL : rien à refléter dans le disque ; la pastille suit le bord de fin ; un glyphe directionnel (‹) est l'affaire de l'hôte.
- Contraste, calculé depuis la recette : encre `indigo950` sur blanc 15,99:1 ; glyphe blanc sur rouge 3,76:1 plein, 3,53:1 à 94 % sur blanc pur ; doux sur verre dense 4,63:1 avec le sombre de la planche (5,34:1 avec le noir d'iOS), sur `onLight` 3,96:1 (4,68:1), 3,27:1 au pire appuyé ; normal : valeurs de K01. Le doux se pose sur un verre dense, une feuille opaque ou un fond sombre : sur `deep` simple et image blanche il tombe à 2,66:1.
- « Réduire la transparence » : K01 rend opaque ; les fonds pleins ne changent pas.

## 5 bis. Performance
- Ne se re-rend jamais : les voisins d'un bouton pressé, ni son hôte. iOS : `Face` est `Equatable`, l'appui vit dans le style du bouton. Android : paramètres stables, appui lu en phase de dessin. Web : `:active`, `:hover`, `:focus-visible` en CSS, aucun état ni écouteur tant que `onPressChange` et `onLongPress` sont absents.
- S'anime : l'échelle (K01), l'opacité du voile d'appui, l'opacité du fond au changement d'état. Jamais le flou, l'ombre ni la mise en page.
- Un flou par groupe : K02 n'en ajoute aucun, et un fond plein ne garde aucun flou dessous.
- Budget : vingt boutons à l'écran (R3 : en-tête, pilule et deux rails) sans image perdue à l'appui ni à la sortie des rails ; rien de retenu une fois l'écran quitté. Web : poids mesuré par `measure-weight.mjs`, première peinture sous son plafond.

## 6. Jetons et mesures
Mesures de la planche :
- diamètres 36, 40, 44 (défaut), 48 ; glyphe à 46 % du diamètre (17, 18, 20, 22), trait 1,8 ;
- actif : blanc 94 %, glyphe `#0E1117`, ombre y 4, flou 14, noir 22 % ; destructif : `#E5484D` à 94 % ; doux : blanc 12 % ;
- pilule : boutons de 48, écart 6, marge 8, hauteur 64 ; rail : 44, écart 6, marge 5 ; ↶ ↷ : deux 40 accolés ; réglages du viseur : 44, écart 4, marge 2 ; barre du clavier : 44, hauteur 52.

Le flou d'une ombre de la planche est celui de CSS : les vecteurs le portent tel quel (`shadowActive.blur`), et chaque plateforme le convertit comme K01 le fait pour le verre (iOS : rayon SwiftUI = flou / 2, soit 7 pour l'actif, comme 28 → 14 pour le verre).

Jetons :
- diamètres : `MeeshyControlSize.regular` (36), `.large` (40), `.tapTarget` (44) ; 48 : constante de la recette (`extraLargeDiameter`) tant que le jeton `xLarge` n'entre pas sur iOS et Android ENSEMBLE (`MeeshyScalesParityTest`) ; `size-12` sur le web ;
- glyphes : `MeeshyIconSize.lg` (18, pour 36 et 40), `.xl` (20), `.xxl` (22), graisse semi-grasse ;
- encre : `MeeshyColors.onMedia`, `MeeshyMediaChromeColors.OnMedia`, `--color-on-media` ; encre de l'actif : `indigo950`, `MeeshyPalette.Indigo950`, `--ios-indigo-950` ;
- rouge : `MeeshyColors.errorStrong`, `MeeshyPalette.ErrorStrong`, `--ios-error-strong` (EF4444) ;
- cible : `MeeshyControlSize.tapTarget`, `.minTouchTarget`, `--target-min` ; ressort : `MeeshyAnimation.springFast` et son pendant.

Les valeurs propres (fonds 94 %, doux 12 / 17 / 22 %, voile d'appui 22 %, survol 11 %, actif pressé 78 %, désactivé 40 %, ombre de l'actif) vivent dans `MeeshyGlassButtonRecipe`, nulle part ailleurs. Aucun appel à `glassEffect`, `adaptiveGlass`, `backdrop-filter` ni classe `.glass*` dans les fichiers de K02.

## 7. Jumeaux
K02 ne rebranche et ne supprime aucun jumeau : il promeut la grammaire, la loi pure et les témoins du plus complet ; le rebranchement change l'écran et revient aux lots d'intégration (#17508).
- iOS. DEVIENT le composant : `CallPillButton`, `CallPillGlyph`, `CallPillButtonKind`, `CallButtonGlassRule` (`Features/Call`, 17 appels, 7 fichiers). Réutilisés : `.meeshyGlass`, `MeeshyGlassPressStyle`, `HapticFeedback`.
- iOS, supprimés : par I1, ces quatre, `CallPillButtonLabel`, `CallButtonGlassModifier`, `CallButtonFill`, `CallPressButtonStyle`, `callControlGlass`, `endCallGlass` ; par I2, `ComposerSceneRoundGlyph` (5 emplois) et `roundButton` de `ComposerSceneOverlayChrome` ; par I4, `glassControl` et `glassGlyph` de `ComposerSceneCameraBar` ; par I10, `FullscreenChromeDisc`, `FullscreenChromeButton`, `FullscreenCloseButton` (12 appels, 10 fichiers), `ConversationHeaderGlassGlyph` (5), les verres directs sur un cercle (43 lignes, 35 fichiers, dont 21 interactifs), `toggleStateAccessibility` de l'app, et `MeeshyIconButton` (0 appelant).
- Android. DEVIENT : `CallPillButton`, `CallPillGlyph`, `CallPillKind`, `CallButtonFill`, `CallGlassButtonSurface` (`:feature:calls`, internes ; 17 et 9 appels).
- Android, supprimés : par I1, ceux-là et `CallButtonGlassRule` (`:core:model`) ; par I2, `SceneRoundButton` (7), `SCENE_VEIL`, `ComposerRailButton` (2) ; par I10, `FullscreenChromeDisc`, `FullscreenChromeButton` (14 appels, 12 fichiers), le disque de `StoryRailButton` (11) et de `FloatingDisc` (4) — leurs gestes (frottement, contour, légende) restent à l'app —, et les `MeeshyGlassSurface` ronds que compte `KitGlassRatchetTest`.
- Web. DEVIENT : `CallButton` (`components/call-glass-button.tsx`, 10 emplois dans `call-control-pill`, `call-screen-header`, `call-grid`, `call-stage`) et sa loi `lib/calls/call-button-glass.ts`.
- Web, supprimés : par I1, ces deux fichiers, `.glass-call-disc`, le ton `plain` de `RoundButton` (`call-round-button.tsx`, 11 emplois), les ronds de `call-control-actions`, `call-control-overlays`, `call-screen`, `call-self-camera`, `call-preview`, `call-capture-studio` ; par I2, `StudioTile`, `StudioAnimatedToggle`, `ROUND_GLASS` (13 lignes), `PRESSED_TILE` (`routes/story-compose-chrome.tsx`) ; par I4, les ronds de `story-compose-camera.tsx`, `story-compose-camera-flash.tsx`, `story-compose-parts.tsx` ; par I10, `GlassBack` (`glass-surface.tsx`), les disques `VIEWER_GLASS viewer-disc` (`viewer-chrome`, `story-action-rail`, `media-transport`), les ronds de `mood-page`, `conversation-preview-sheet`, `floating-menus`, `thread-export-sheet`. Le ✕ et le retour de `sheet.tsx` (carrés, sans fond) deviennent un K02 doux de 36 avec K15 ; `composer-*` et `scene-*` ne portent aucun bouton rond de verre.

## 8. Témoins exigés
Comportements (`MeeshyGlassButtonTests`, `MeeshyGlassButtonTest`, `meeshy-glass-button.test.tsx`) :
- recette : chaque état × matière × emboîtement rend le fond, l'encre et la demande faite à K01 du tableau du § 3 ;
- quatre tailles : diamètre, glyphe, cible d'au moins 44 pt, 48 dp, 44 px ;
- nom, rôle, valeur pour `none`, `toggle`, `selected`, `expanded` ; `kind` déduit de `activation` ; désactivé : ni action ni haptique ;
- l'action part une fois ; un seul `light` par le site unique, aucun avec `none` ;
- repos ≠ pressé pour chaque état ; sous « réduire les animations », échelle 1 et voile présent ;
- `onPressChange` : vrai, faux, et faux à la disparition ; appui long toujours exposé en action nommée ;
- contraste des quatre états calculé depuis la recette ; aucun texte visible rendu ;
- garde de source : aucun verre dessiné dans les fichiers de K02 ; web : `glass-site.mjs` et `check-kit.mjs` verts ;
- parité : `K02-MeeshyGlassButton.vectors.json`, lu par les trois suites ; non-régression : le lot ne touche aucun jumeau ni aucun écran.

Instantanés (`MeeshyGlassButton/<id>.<variante>`) : `normal`, `seul`, `seul-clair`, `actif`, `destructif`, `doux`, `texte`, `pastille`, `teinte`, `theme`, `desactive`, `tailles` en `clair` et `sombre`, `presse` pour ceux qui se touchent, planches `grande-police` et `rtl`. iOS : suffixe `-iOS26` et `<id>-dessine` (forçage de #17334 ; le Liquid Glass du système n'apparaît pas hors écran, la matière se juge sur `-dessine`) ; web : 390, 820 et 1440 px.

Un lot n'est fusionnable qu'avec ses images au dépôt, enregistrées sur sa branche de travail puis comparées au vert : `sdk-tests.yml` (entrée `record_snapshots`) sur iOS, `android.yml` (`record_snapshots`) sur Android, `CAPTURE_DIR=docs/product/kit/captures node scripts/check-kit.mjs` sur le web. Android : aucun nom de test avec « ; » ni « . » (la cause du retrait de K01).

Catalogue : entrée K02, vide sur `dev` sur les trois plateformes (`MeeshyKitCatalog+K02.swift`, `KitCatalogK02.kt`, `components/kit/catalog/k02.tsx`). Vues : `normal` R2 sur `media`, `seul` R1 sur `dark`, `seul-clair` R13 sur `light`, `actif` R3, `destructif` S9, `doux` S1, `texte` A2.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Les deux planches se contredisent : le composer dit « un inactif n'a pas de fond, jamais de verre sur du verre », les appels (#17323) donnent un verre à chaque bouton.
- L'actif du composer est teinté de marque (iOS `ComposerSceneRoundGlyph`, Android accent 55 %, web `PRESSED_TILE`) ; celui des appels est déjà le disque blanc.
- Fin est en `error` (F87171, 2,77:1 sous un glyphe blanc) sur iOS et Android, en `error-strong` sur le web ; la planche dessine E5484D (3,91:1).
- Les jumeaux RÉTRÉCISSENT à l'appui (0,88 ; 18 `active:scale-95` sur le web) ; K01 agrandit.
- L'haptique des appels part au doigt posé (iOS `sensoryFeedback`, Android `LocalHapticFeedback`, hors du site unique) ; ailleurs à l'action ; le web n'en joue pas.
- Les appels portent encore des légendes sous leurs boutons, sur les trois plateformes.
- La planche écrit `B('play','Lire','white',40)` : la classe `.btn.white` n'existe pas, la capture montre un bouton normal. Elle emploie aussi 42 px (C2).
- Le sombre du verre a trois jetons (question 4 de K01) : le contraste du doux diffère donc d'une plateforme à l'autre.
- Registre : `CallSelfTileControlButton` n'existe plus (une garde interdit son retour) ; « environ 45 fichiers » se mesure à 35 ; `MeeshyIconButton` n'a ni verre ni appelant ; le web a bien plus qu'un jumeau.
- Aucun jeton de 48 ; `MeeshyFont.fixedGlyph` et `toggleStateAccessibility` vivent dans l'app iOS. Tailles hors des quatre dans le code : 50 (Sortie), 28, 32, et 56 à 76.
- iOS, relecture du 2026-11-11 : la recette posait l'ombre de l'actif au rayon 14, le DOUBLE du flou de la planche une fois converti comme K01 ; elle est à 7, et les vecteurs portent le flou de la planche (`blur`), plus aucun rayon propre à SwiftUI.
- iOS : la cible symétrique de 44 donne à deux 40 accolés 44 et 40, non 42 et 42 ; le partage du débord revient à l'hôte de la paire ↶ ↷ (K16), qui pose sa propre forme de toucher (#17531).

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. Le lot iOS reprend le code de `fdc6f439ad` sans changer un nom d'API, et sa PR porte ses images enregistrées par la CI. (Réécrire le composant ; assouplir la garde.)
2. Normal en conteneur : Liquid Glass interactif par bouton sur iOS 26+, aucun fond en verre dessiné ; les appels prennent `soft` à I1. (Jamais de fond ; toujours un disque.)
3. Doux : voile blanc 12 % sans flou ni liseré — la recette de `.glass-call-disc` moins son liseré — ; rendu du normal sous Liquid Glass. (Voile aussi sous Liquid Glass ; liseré du web.)
4. Actif : disque blanc à encre `indigo950` partout ; la teinte de marque du composer part à I2. (Fond de marque ; nouveau jeton `0E1117`.)
5. Destructif : `errorStrong`, 3,76:1 ; Fin change de rouge sur iOS et Android à I1 (#17467). (`error` ; nouveau jeton E5484D.)
6. Quatre tailles, pas de diamètre libre : 42 devient 44, 50 devient 48 à I1, « Lire » est normal, 56 à 84 restent hors de K02. (Diamètre libre.)
7. L'encombrement est le diamètre dessiné, la cible déborde. (Encombrement égal à la cible.)
8. Glyphe figé, aux jetons d'icône (18 pour le 36, à un point de la planche), Large Content Viewer, et 48 en constante locale (#17489). (Glyphe qui grandit ; 17 en dur ; jeton iOS seul.)
9. Réponse au toucher de K01 seule ; là où K01 n'a pas de matière, un voile, et l'actif s'éclaircit (#17489). (Garder le rétrécissement.)
10. Un `light` à l'action par le site unique ; le tic au doigt posé des appels passe par `onPressChange` à I1. (Tic au doigt posé par défaut.)
11. Aucune légende dans K02 : celles des appels sont composées par l'app autour de `MeeshyGlassButtonFace` jusqu'à I1 ; l'ambre d'une pause est `glyphTint`. (Paramètre `caption` ; état `warning`.)
12. L'état dit est `activation`, d'où `kind` se déduit ; « Activé / Désactivé » entrent au catalogue de chaînes de MeeshyUI. (Mots passés par l'app.)
13. Coller : `PasteButton` sur iOS ; sur Android et le web, K02 normal teinté de marque par `tint`. Envoyer (C4) reste le bouton de la conversation. (Composant à part.)
14. Appui long optionnel, toujours doublé d'une action nommée (#17497) ; les menus iOS prennent `Face` pour libellé. (Pas d'appui long.)
15. `MeeshyIconButton` n'est pas un jumeau : intact, retiré par I10. (L'absorber.)
16. Aucun jumeau rebranché dans K02 : I1, I2, I4 et I10 s'en chargent, avec captures (#17508). (Faire de `CallPillButton` un renvoi dès K02.)
17. Le contraste du doux se vérifie au plancher commun de 3:1 ; chaque plateforme inscrit sa valeur mesurée dans les vecteurs, tant que le sombre du verre n'a pas un seul jeton. (Une seule valeur imposée aux trois.)
18. K02 Android et K02 web partent de `dev` une fois leur K01 fusionné, jamais empilés sur sa branche. (Empiler sur la branche de K01.)

## 10. Android : ce que la reprise fixe (2026-11-11, issue #17466)
Le composant vit à `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit/` : `MeeshyGlassButtonRecipe.kt` (les types et la recette en valeurs, JVM pure) et `MeeshyGlassButton.kt` (`MeeshyGlassButton`, `MeeshyGlassButtonFace`, avec une surcharge `icon: ImageVector`). Témoins : `MeeshyGlassButtonTest` (recette, lecteur d'écran, loi du doigt, gardes de source ; lit `K02-MeeshyGlassButton.vectors.json`) et `MeeshyGlassButtonBehaviorTest` (Robolectric : nom, rôle, valeur, cible tactile, appui long, `onPressChange`, aucune recomposition à l'appui). Catalogue : `KitCatalogK02.kt`, les douze états d'iOS.

Ce qu'Android transpose, et pourquoi :
- Pas de Liquid Glass : les lignes `liquid` des vecteurs ne s'appliquent pas, la recette ne dépend pas de la matière (verre dessiné et fond plein de « réduire la transparence » rendent les mêmes valeurs), et le destructif est toujours le rouge plein `ErrorStrong` (3,76:1), jamais un verre teinté.
- Cible de 48 dp (Material, TalkBack), débord de 6, 4, 2, 0 dp pour 36, 40, 44, 48. Le débord est celui de Compose pour un nœud de pointeur plus petit que sa cible minimale : l'encombrement reste le diamètre.
- Le nom est le `contentDescription` d'un nœud fusionné, rôle `Button` ; la bascule pose `toggleableState` ET `stateDescription` (« Activé / Désactivé » des chaînes existantes `a11y_kit_toggle_on` et `a11y_kit_toggle_off`, suivies de `value`) ; la sélection pose `selected` ; l'aide est le libellé de l'action ; l'appui long est toujours une action nommée (`onLongClickLabel`).
- L'appui long dure 500 ms avec 10 dp de jeu : le bouton qui en porte un fournit à son sous-arbre un `ViewConfiguration` à ces deux valeurs.
- Le fondu de 200 ms est celui de K01 (`TONE_FADE_MILLIS`), sec sous « réduire les animations ». Le fond plein, son voile d'appui et le survol se lisent en phase de dessin ; l'ombre de l'actif a pour rayon la moitié du flou de la planche (7 dp).
- Le doigt posé, levé, et levé à la disparition passe par un collecteur de la source d'interaction qui n'existe que si l'hôte donne `onPressChange`.
- Contraste du doux, calculé depuis la recette de K01 au pire (une image blanche dessous) : 5,34:1 sur verre dense, 4,68:1 sur `onLight` ; ce sont les valeurs des vecteurs.
- Le glyphe reçoit sa taille en paramètre (`glyph: @Composable (Dp) -> Unit`) : le « Aa » la prend en `sp` équivalent, le glyphe ne grandit pas avec la police.
- Les chaînes réutilisent le catalogue de l'app (`a11y_kit_toggle_*`) : K02 n'ajoute aucune chaîne à `:sdk-ui`.
- Partage du débord de deux 40 accolés (↶ ↷) : reste à l'hôte (K16), comme sur iOS.

Relecture du 2026-11-11 (corrigé sur la branche du lot) :
- Focus clavier : `indication = null` laissait le bouton sans aucun anneau au clavier, alors que le § 5 le demande. K01 Android n'en dessine pas (il n'en a pas besoin : sa surface ne prend pas le focus) ; K02 trace donc l'anneau lui-même, en phase de dessin, à la règle du `:focus-visible` de K01 web : 2 dp décalés de 2 dp, blanc des médias sur `plain` et dans un verre, sombre du verre sur `deep` et `onLight`, encre du thème sur `theme` (`MeeshyGlassButtonFocusRing`, dans la recette). Le `clickable` de Compose ne prend le focus qu'au clavier : jamais d'anneau au doigt.
- Fondu enchaîné : passer du normal à l'actif (ou au destructif, au doux) faisait disparaître le verre de K01 d'un coup sous un fond qui partait de zéro. Le verre qui part s'efface désormais en 200 ms sous le fond qui arrive (sec sous « réduire les animations »), comme le changement d'identité du disque sur iOS ; il reste à la même place de la composition, donc K01 garde son flou pendant le fondu.
- Stabilité : `MeeshyGlassButtonActivation` est `@Immutable`. Sans la marque, Compose (saut fort, Kotlin 2.1) comparait l'interface par identité, et un hôte qui écrit `Toggle(isOn)` en ligne recomposait le bouton à valeur égale.

## 11. Web (2026-11-11, lot K02 web, #17466)
Fichiers : `components/kit/meeshy-glass-button.tsx` (le disque, le bouton, le disque seul), `meeshy-glass-button-recipe.ts` (la recette en valeurs, les lois pures, la loi d'accessibilité), `styles/kit-glass-button.css` (le fond plein, le voile d'appui, la réponse au toucher), `components/kit/catalog/k02.tsx`, témoin `meeshy-glass-button.test.tsx` (lit `K02-MeeshyGlassButton.vectors.json`), instantanés `captures/web/MeeshyGlassButton/` (390, 820 et 1440 px, clair, sombre, pressé, `grande-police`, `rtl`). Aucun jumeau n'est rebranché (I1 reprendra `CallButton`) et aucun écran ne change.

Transpositions que la plateforme impose, et choix retenus (mode autonome) :
1. Matière. Le web n'a jamais de Liquid Glass : la recette ne lit que `drawn` et `opaque` (les lignes `liquid` des vecteurs ne sont pas lues). Le `normal` demande son verre à K01 par `meeshyGlassRecipe` (interactif, au ton de l'hôte), l'`actif`, le `destructif` et le `doux` ne demandent aucun verre. Le bouton n'écrit aucun `backdrop-filter` ni aucune classe de verre : le témoin le garde dans ses trois fichiers. (Appeler le composant `MeeshyGlass` aurait remplacé l'élément du bouton à chaque changement de tenue et fait perdre le focus clavier d'une bascule : la recette de K01 est consommée directement, l'élément reste le même.) K01 exporte pour cela `useMeeshyGlassHost` (ton, emboîtement, matière pleine de l'hôte), seul ajout à son fichier.
2. Nom du fond. Le fond `white` des vecteurs s'appelle `light` côté web : le gate d'harmonie refuse le mot « white » dans une chaîne. Le témoin traduit la valeur des vecteurs.
3. Réponse au toucher, sans état. L'appui, le survol (`@media (hover: hover)`) et le focus clavier sont `:active`, `:hover` et `:focus-visible` ; le bouton ne porte ni état ni écouteur tant que `onPressChange` et `onLongPress` sont absents. Les valeurs (fonds au repos, pressé et survolé, voile) sont posées par la recette en propriétés `--kit-btn-*`, en un objet mémorisé par état : un hôte qui se re-rend ne fait rien repeindre. Un disque posé dans un bouton hôte (`MeeshyGlassButtonFace` comme libellé) répond à l'appui de l'hôte par la même règle que K01. Seuls l'opacité, la couleur et la transformation s'animent ; sous « réduire les animations » les fondus partent, le voile reste.
4. Valeur et aide. Un `button` n'a pas de valeur ARIA : `value` et `hint` forment `aria-description` (« AirPods. Choisit le haut-parleur »), le nom reste l'étiquette, doublée de `title`. `toggle` et `selected` disent `aria-pressed` (vrai ou faux), `expanded` dit `aria-expanded`, `aria-controls` et `aria-haspopup`.
5. Appui long. Le doigt tenu 500 ms et ramené sous 10 px fait l'appui long, sans activer l'action au relâcher ; la souris et le clavier l'offrent par le menu contextuel (clic droit, touche Menu, Maj+F10), qui joue la même action, et `aria-keyshortcuts` et `data-long-press-action` (l'étiquette dédiée, sinon le nom du bouton) la nomment. Sans `onLongPress`, le menu contextuel du navigateur reste.
6. Doigt posé. `onPressChange(true)` au `pointerdown` ou à Espace et Entrée, `(false)` au relâcher, à la sortie, à la perte du focus, et à la disparition du bouton doigt posé (rien au repos).
7. Cible. 44 px de côté au moins pour les quatre tailles : le débord est un pseudo-élément du bouton (`--kit-btn-slack`), l'encombrement reste le diamètre ; deux boutons accolés se disputent le débord, c'est l'affaire de K16.
8. Glyphe. `font-size` en pixels (18, 18, 20, 22) : figé dans son disque, un SVG en `1em` ou un texte (« Aa ») reçoivent l'encre `color` du glyphe, jamais une couleur propre.
9. Contraste (calculé depuis la recette et les jetons, comme sur les autres plateformes) : actif 15,99:1, destructif 3,76:1, doux au plancher commun de 3:1 sur le verre dense (`deep` dense) et sur `onLight`, pire cas flou coupé.
10. Catalogue. Douze états (mêmes identifiants et mêmes vues que sur iOS), la tuile « pressé » est le disque seul figé (`pressed`), comme iOS ; la pastille et le disque seul n'ont pas de bouton à toucher.
11. Relecture du 2026-11-11. Le disque seul prend `disabled`, à la place de l'`isEnabled` que SwiftUI lit dans l'environnement : libellé d'un hôte désactivé, il s'éteint à 40 % et ne répond plus. Un bouton désactivé ne demande plus à K01 un verre interactif (ni reflet au survol ni agrandissement). Doigt posé, le menu contextuel que le système ouvre de lui-même (Chrome Android) fait l'appui long et le relâcher n'active plus l'action ; ouvert au clavier, il ne retient pas l'activation suivante d'un lecteur d'écran. La mémoire des styles est bornée (64 tenues) et ne dépend que de la tenue résolue, plus de l'`activation` qui l'a déduite.
