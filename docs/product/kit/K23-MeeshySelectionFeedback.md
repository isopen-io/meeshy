# K23 — MeeshySelectionFeedback (le halo de sélection et les repères d'aimantation)

Relevé sur `origin/dev` `0d3d396c05` le 2026-11-14. Chantier #17312, milestone 258 ; l'issue du lot reste à ouvrir avant la première ligne. Dépend de K00 ; lit le ton de K01. Lois 6 et 13 de `docs/product/composer-vue-finale.md`, loi 4 pour le ton. Planche : le halo de `MEE({halo})` (ligne 190) et de `TXT({shadow})` (324), `finger(x,y)` (260), la ligne jaune de O3 (328) ; vues O1, O14, O15, O3, O11.

## 1. Rôle
Un objet choisi se reconnaît à un halo, sans cadre ni poignée, et pendant qu'on le déplace les lignes sur lesquelles il s'accroche se tracent de la même façon partout.

Il ne fait pas :
- le geste (toucher, glisser, pincer, tourner) ni le passage au premier plan : `StoryCanvasUIView+Gestures`, `sceneManipulationGestures`, `story-compose-stage.tsx` ;
- la loi d'aimantation (cibles 0,18 / 0,25 / 0,5 / 0,75 / 0,82, portée 0,02 ; fond 0 / 0,5 / 1, portée 0,035) : `StoryCanvasUIView.snap`, `StorySnapResolver`, `lib/stories/studio-snap.ts` restent la source ; K23 reçoit des fractions ;
- la pilule d'outils (K10), le menu (K18), les cibles de dépôt (K25), le retrait de l'en-tête et des rails (app) ;
- le badge d'envoi du canvas iOS, l'alerte de zone sûre (Android `warnBorder`), les poignées de recadrage (O7) ;
- le doigt et l'arc pointillé de O3 et O11, qui sont des annotations de la planche.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshySelectionFeedback.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-selection-feedback.tsx` |
|---|---|---|---|
| Halo | `.meeshySelectionHalo(_ isSelected: Bool, shape: = .content, scale: CGFloat = 1, tone: MeeshyGlassTone? = nil)` | `Modifier.meeshySelectionHalo(selected, shape, scale, tone = LocalMeeshyGlassTone.current)` | `<MeeshySelectionHalo selected shape scale tone>{objet}</MeeshySelectionHalo>` et `meeshySelectionHaloAttributes(...)` pour un élément rendu par le moteur |
| Forme | `MeeshySelectionHaloShape { content, rounded(CGFloat) }` | `sealed interface` | `'content' \| { rounded: number }` |
| Repères | `MeeshySnapGuides(isActive:engaged:candidates:showsBounds:cornerRadius:haptic:)` | `MeeshySnapGuides(active, engaged, candidates, showsBounds, cornerRadius, haptic, modifier)` | `<MeeshySnapGuides active engaged candidates showsBounds haptic />` |
| Lignes | `MeeshySnapLines(vertical: [CGFloat], horizontal: [CGFloat])`, `.none` | `@Immutable data class MeeshySnapLines` | `{ vertical: readonly number[]; horizontal: readonly number[] }` |
| Recette en valeurs | `MeeshySelectionFeedbackRecipe.halo(...)`, `.guides(...)` | idem | `meeshy-selection-feedback-recipe.ts` ; styles `styles/kit-selection-feedback.css` |

Paramètres opaques, mêmes défauts : `shape = content` (le halo suit la silhouette : sticker, texte, dessin) ou `rounded(rayon)` (boîte arrondie d'un média opaque) ; `scale = 1` (l'échelle que l'hôte applique à l'objet, pour garder le rayon du halo en points d'écran) ; `tone` (celui de l'hôte) ; `engaged` et `candidates` en fractions 0…1 du calque, hors bornes ignorées, `candidates = none` ; `showsBounds = false` ; `cornerRadius = 0` ; `haptic = light` (`none` laisse l'hôte jouer le sien).

Un seul emplacement : le contenu du halo (l'objet). Les repères n'en ont pas : le calque remplit ce que l'hôte lui donne, au-dessus des objets, sous les cibles de K25 et sous tout le chrome.

## 3. États
- Repos, aucun objet choisi : R2. Rien ne se peint.
- Choisi, silhouette : O1 (sticker), O14 (texte).
- Choisi, boîte arrondie : O15 (vidéo), O4 (photo).
- Texte en écriture, clavier ouvert : O11. Pas de halo, le curseur le dit ; l'hôte passe `false`.
- Glissé, une ligne engagée : O3 (centre vertical), halo gardé.
- Glissé, deux lignes engagées (croix) ; glissé libre (halo seul) : sans vue.
- Deux doigts : O11. Halo au rayon constant, repères seulement si l'hôte les passe.
- Avec contour et lignes candidates : sans vue (ce que le code trace aujourd'hui, conservé).
- Ton `onLight` : scène claire de R13. Encre sombre.
- Contraste accru ; « réduire les animations ».

Loi 13 : pas de halo sans sélection, ni pendant la frappe ; aucun cadre, poignée, ni badge dans K23 ; aucun repère au repos ; ni contour ni lignes candidates si l'hôte ne les passe pas ; une ligne engagée ne se double pas de sa candidate ; pas d'étiquette sur la ligne (celle de la frise est à K22).

## 4. Gestes et retours
- K23 ne prend aucun toucher (`allowsHitTesting(false)`, aucun `pointerInput`, `pointer-events: none`) ; le halo n'agrandit pas la cible.
- Haptique : un `light` à l'entrée de chaque NOUVELLE ligne dans `engaged`, jamais en continu ni à la sortie, par le site unique (`HapticFeedback.light()`, `rememberMeeshyHaptics().light()`, `impact('light')` de `lib/view/haptics.ts`). Aucun à la sélection.
- Halo : fondu de l'alpha de sa couleur, 150 ms à l'apparition, 100 ms au retrait. Repères : immédiats, sans fondu (une accroche est un fait instantané).
- « Réduire les animations » (`MeeshyMotion.shouldReduce`, `LocalReduceMotion`, `prefers-reduced-motion`) : le halo apparaît d'un coup ; le site web se tait déjà.

## 5. Accessibilité
- Nom et rôle : ceux de l'objet, inchangés. Valeur : le modificateur pose l'état « sélectionné » (`.isSelected` ; `selected = true` ; `aria-selected` seulement si l'hôte donne un rôle qui l'accepte, sinon `data-kit-selected`). La sélection ne repose jamais sur le halo seul : la pilule (K10) et l'état la disent.
- Repères : décoratifs, masqués aux lecteurs d'écran ; l'aimantation n'est pas annoncée par K23.
- Ordre de lecture : inchangé, K23 n'ajoute aucun élément.
- Dynamic Type, fontScale : rayons et traits en points, figés. Zoom du navigateur : ils suivent la page.
- Clavier et focus (web, iPad) : K23 n'est pas focalisable. L'anneau `:focus-visible` de l'objet reste à l'hôte et se voit en même temps que le halo, qui n'est pas un indicateur de focus. Un déplacement aux flèches (hôte) allume les mêmes lignes.
- RTL : fractions comptées depuis la gauche physique, sans miroir (une scène est un média).
- Contraste, calculé depuis la recette : ligne jaune 12,6:1 sur noir ; 1,7:1 seulement sur blanc, d'où un liseré `scrim` de 0,5 pt de chaque côté (3,9:1 sur blanc). Halo blanc sur scène sombre ou moyenne, encre sombre en ton `onLight`. « Augmenter le contraste » : halo à 100 % et 80 %.

## 5 bis. Performance
- Un objet non choisi ne coûte rien : le modificateur rend le contenu tel quel, sans calque ni filtre ; choisir un objet ne re-rend pas les autres.
- Le halo se calcule à la sélection et suit l'objet par sa transformation ; aucun flou n'est recalculé pendant le glisser. Média opaque : `rounded` obligatoire (ombre de boîte, `shadowPath`), jamais le flou de silhouette.
- Web : le halo se pose sur le cadre de l'objet (`[data-scene-object]`), jamais sur le média, dont la chaîne `filter` porte le look.
- Repères : une seule surface de dessin, redessinée quand `engaged` change de VALEUR, pas à chaque mouvement du doigt (`Equatable`, `@Immutable`, comparaison des fractions sur le web).
- Seul l'alpha du halo s'anime ; aucune propriété de mise en page. Ni minuteur ni observateur ; rien de retenu une fois démonté.
- Budget : aucune image perdue pendant le geste, 60 et 120 Hz, scène de 50 objets.

## 6. Jetons et mesures
Dans `MeeshySelectionFeedbackRecipe` et nulle part ailleurs :
- halo : deux lueurs sans décalage, flou 10 à 95 % et flou 24 à 55 % (σ 5 et 12, divisés par `scale`), encre `MeeshyColors.onMedia` ; ton `onLight` : `MeeshyColors.mediaBackdrop` ;
- ligne engagée : pleine, 1,5 pt, toute la longueur du calque, `MeeshyColors.mediaSnap`, nouvel ALIAS de `warning` (#FBBF24, même valeur que `mediaTrim` de K21), miroirs `MeeshyMediaChromeColors.MediaSnap` et `--ios-media-snap` (généré) ; liseré `MeeshyColors.scrim` 0,5 pt ;
- lignes candidates : `onMedia` à 30 %, 0,5 pt, pointillé 2-6 ; contour : `onMedia` à 90 %, 2 pt, retrait 1, rayon `cornerRadius − 1` ;
- fondu 150 / 100 ms.

Mesures de la planche (O3) : ligne à x = 0,5 de la scène (195 sur 390), haute de 636, soit toute la scène ; `#FFD23F`, 1,5 px, pleine ; au-dessus des objets, sous les cibles.

Parité : `docs/product/kit/K23-MeeshySelectionFeedback.vectors.json` (halo par ton, contraste et échelle ; positions des lignes sur un calque 358 × 636 ; séquences de `engaged` et haptiques attendus), lu par les trois suites.

## 7. Jumeaux
K23 ne rebranche et ne supprime rien : brancher change l'écran. Les lots d'intégration I5 (composer) puis I9 (retouche) adoptent et suppriment.
- iOS. DEVIENT (repères) : `StoryCanvasUIView+Limits` avec `updateSnapGuides` et `makeGuideLine` de `+Gestures`, le jumeau vivant le plus complet ; ses valeurs deviennent la recette, que le canvas UIKit lit à I5 (plus de `UIColor.systemPink` ni de blanc en dur). Halo : aucun jumeau (plus rien n'est peint depuis #14206).
- iOS, supprimés par I5 : `AlignmentGuidesOverlay`, `StoryAlignmentSnap`, `SafeZoneOverlay`, `OutOfBoundsWarningOverlay`, `StorySafeZone` et `StoryOutOfBoundsPulse` (`Story/StoryCanvasGuides.swift`, sans appelant) avec `StoryCanvasGuidesMotionTests`.
- Android. DEVIENT : `SceneGuidesOverlay` (+ `SceneGuideStyle`), déjà agnostique, déplacé dans `component/kit` ; `Modifier.sceneSelection` (app, sémantique seule) cède son `selected` au modificateur du kit.
- Android, supprimés par I5 : `SceneSelectionMarker` et `SceneSelectionStyle` (cadre, poignées, badge, sans appelant), `SceneGuidesOverlay`, `ComposerSelection.kt` (son libellé d'état reste à l'hôte), le `haptics.light()` de `ComposerCanvasSurface`. `SceneSelectionPixelTest` est réécrit : « le halo, et ni cadre ni poignée ».
- Web. DEVIENT : `StudioManipulationLimits` (`routes/story-compose-limits.tsx`, `#F472B6` et blancs en dur). Supprimé par I5 après adoption dans `story-compose-stage.tsx`. Halo : aucun jumeau.
- Hors K23 : `SceneFocusFrame` et `PostSceneFocusFrame` (cadrage d'une carte), `ComposerSelectionChrome` (orchestration du chrome, app), `SnapGuideView` et `SnapEngine` (frise, K22, qui lira `mediaSnap`), `scene-media-glow.tsx` (bloom d'un média), `selection-toolbar.tsx`, halos de qui parle et de lisibilité. Relevé web : `call-glass-button`, `call-control-pill`, `glass-surface`, `sheet`, `composer-*` ne portent ni halo de sélection ni repère.

## 8. Témoins exigés
Comportements (`MeeshySelectionFeedbackTests`, `MeeshySelectionFeedbackTest`, `meeshy-selection-feedback.test.tsx`) : vecteurs du halo (ton, contraste accru, `scale`) ; non choisi = contenu inchangé, aucun calque ; état « sélectionné » posé et retiré ; `isActive` faux = rien dans l'arbre ; lignes aux bonnes fractions, hors bornes ignorées, candidate masquée sous l'engagée ; contour seulement si demandé ; un `light` par nouvelle ligne, aucun en continu, à la sortie, avec `none` ; cent mouvements à `engaged` égal = zéro redessin ; aucun toucher capté ; pas de miroir en RTL ; rien d'animé sous « réduire les animations » ; contraste calculé ; garde de source (ni cadre, ni poignée, ni code de couleur, ni loi d'aimantation réécrite).

Instantanés (`MeeshySelectionFeedback/<id>.<variante>`) : `choisi-sticker` (O1), `choisi-texte` (O14), `choisi-media` (O15), `glisse-centre` (O3), `glisse-croix`, `glisse-libre`, `deux-doigts` (O11), `contour-candidates`, `scene-claire`, en `clair` et `sombre`, planches `grande-police` et `rtl` ; web à 390, 820 et 1440. Enregistrés par la CI, jamais posés à la main.

Catalogue : entrée K23 (`MeeshyKitCatalog+K23.swift`, entrée Android, `catalog/k23.tsx`), aucun état pressable ; le doigt de la planche y est une figure du catalogue, pas une API.

Preuve : gardes locales vertes et CI de la branche ; si les runs de branche sont annulés, le lot fusionne dans `dev` et se prouve sur `dev`, corrigé ou retiré aussitôt s'il y est rouge.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Le code ne peint AUCUNE sélection sur les trois plateformes (décision du 2026-11-01, #14206 et #14207 ; web « sélection silencieuse ») ; la planche du 2026-11-08, loi 6, demande un léger halo.
- Planche : `PHOTO()` ignore `halo` (O4 le demande, O15 ne le passe pas) : aucune capture ne montre le halo d'un média.
- Pendant un geste, le code trace le contour de la scène et toutes les lignes candidates (#8370, #8413) ; O3 ne montre que la ligne engagée.
- Ligne engagée : rose pointillé 1 pt (iOS), rose plein 1 dp (Android), `#F472B6` 1,5 px (web) ; jaune plein 1,5 sur la planche.
- Haptique d'accroche : Android oui, iOS pour le fond seulement, web non.
- Android peint les repères SOUS les objets ; iOS, le web et la planche au-dessus.

Choix retenus (mode autonome ; l'alternative entre parenthèses) :
1. K23 livre le halo de la planche sans le brancher ; I5 le branche, PR ouverte avec captures. (Rester silencieux ; brancher dès K23.)
2. Halo pour tout objet, média compris, en forme `rounded`. (Pas de halo sur un média ; cadre fin.)
3. Doigt et arc : annotations, jamais dessinés en produit. (Témoin de toucher public.)
4. Par défaut la ligne engagée seule ; contour et candidates conservés par `showsBounds` et `candidates`, que I5 passe pour ne rien retirer. (Planche stricte ; tout afficher toujours.)
5. Ligne pleine de 1,5 pt. (Pointillé d'iOS ; 1 dp.)
6. Jaune par l'alias `mediaSnap` de `warning`, partagé avec K22. (Rose du code ; nouveau `#FFD23F` ; réemployer `mediaTrim`.)
7. Liseré sombre pour tenir sur scène claire. (Ligne nue ; encre selon le ton.)
8. Encre du halo selon le ton de K01. (Toujours blanc ; double lueur claire et sombre.)
9. La loi d'aimantation reste où elle est. (L'extraire dans le kit ou dans `shared`.)
10. Le calque joue le `light` ; l'hôte Android rend le sien à I5 ; iOS et le web le gagnent. (Laissé à l'hôte ; `selection`.)
11. Rayon du halo en points d'écran, par `scale`. (Halo qui grandit avec l'objet.)
12. Fondu du halo seul. (Aucun fondu ; fondu des lignes.)
13. Pas de miroir en RTL. (Miroir.)
14. Android 8 à 11 : `content` retombe sur la boîte arrondie, faute de `RenderEffect`. (Flou logiciel ; pas de halo.)
15. Repères au-dessus des objets, sous K25. (Dessous, comme Android.)
16. Code mort iOS et Android supprimé par I5, pas par K23. (Le supprimer ici.)

