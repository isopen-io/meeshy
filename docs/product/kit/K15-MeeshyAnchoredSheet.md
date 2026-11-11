# K15 — MeeshyAnchoredSheet (la feuille ancrée)

Relevé sur `origin/dev` `736820c620` le 2026-11-11. Chantier #17312, milestone 258 ; issue du lot : #17648. Dépend de K00, et de K02 pour son ✕ (choix 1). Loi 8 de `docs/product/composer-vue-finale.md` ; lois 3, 9, 13, 14 et 18 lues. Planche : `sheet(top, body, {title, right, grab})` (ligne 233), classes `.sheet`, `.grab`, `.sh` (lignes 55 à 57), et `above(top)` (ligne 234), qui dessine la réduction de l'hôte. Vues : R11, A6, A11, A12, A14, A15, A16, A17, A18, plus A19, qui emploie aussi `sheet()` (#17521). S7 pose la classe `.sheet` à la main au-dessus du clavier : c'est K17.

## 1. Rôle
Une feuille opaque ancrée en bas de son hôte, avec poignée, titre et fermeture optionnels, qui PUBLIE sa place au repos pour que l'hôte réduise son contenu au-dessus d'elle au lieu de le laisser passer dessous.

Elle ne fait pas :
- la réduction du contenu (cadrage 9:16 de la scène, ligne de références glissée entre scène et feuille, retrait des rails) : l'hôte, avec la place publiée ;
- le choix de la feuille ouverte, « une seule à la fois », son titre traduit, sa hauteur par portail (`ComposerPortal`, `StoryComposerSheet`) : l'app ;
- le contenu et ses états vide, chargement, erreur, hors ligne ; son défilement ; son champ (K08), ses puces (K04), ses lignes (K06) ;
- les feuilles SYSTÈME (85 `presentationDetents` dans 66 fichiers iOS, 74 `ModalBottomSheet` dans 72 fichiers Android, `Sheet` plein écran, centrée et large du web) : elles restent au système ; K15 ne fournit que leur place publiée ;
- la photothèque du système (A6, et A19 sur iOS 17+), le clavier et sa barre (K17), une option à réglages (K11, dans la pilule), le verre (aucun : la feuille est opaque).

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyAnchoredSheet.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-anchored-sheet.tsx` |
|---|---|---|---|
| Feuille | `MeeshyAnchoredSheet(title:…onDismiss:trailing:content:)` | `MeeshyAnchoredSheet(onDismissRequest, modifier, title, …, state, trailing, content)` | `<MeeshyAnchoredSheet title onDismiss …>` |
| Pose dans l'hôte | `.meeshyAnchoredSheet(isPresented:)` et `(item:)` | `MeeshyAnchoredSheetHost(open: T?, …) { clé -> }` | prop `open` |
| Hauteur | `MeeshyAnchoredSheetHeight { content, fraction(CGFloat), detents([CGFloat], initial: Int) }` ; `.compact` 0,30, `.regular` 0,50, `.tall` 0,62 | `sealed interface` identique | `'content' \| { fraction } \| { detents, initial }` |
| Surface | `MeeshyAnchoredSheetSurface { theme, dark }` | idem | `'theme' \| 'dark'` |
| Hors de la feuille | `MeeshyAnchoredSheetOutside { dismisses, passesThrough }` | idem | `'dismisses' \| 'passesThrough'` |
| Place publiée | préférence `MeeshyAnchoredSheetFootprintKey` (`top` global, `height`) et `.onMeeshyAnchoredSheetFootprint` | `rememberMeeshyAnchoredSheetState()` : `footprintPx`, `detentIndex`, `nestedScrollConnection` | `footprintHost` (réf. qui reçoit `--kit-sheet-footprint`) et `onFootprintChange(px)` |
| Feuille système | `MeeshyAnchoredSheetPlaceholder(height:)`, `.meeshyFixedHeightSheet(fraction:)` | `MeeshyAnchoredSheetPlaceholder` | sans objet |
| Loi pure | `MeeshyAnchoredSheetMetrics` : `height`, `dismisses`, `dragOffset`, `settle`, `restingTop`, `motion(reduceMotion:)` | `object` identique | `meeshy-anchored-sheet-metrics.ts` |

Paramètres, tous opaques, mêmes défauts partout :
- `onDismiss` (obligatoire) : le chemin UNIQUE de ✕, du glissé, du toucher hors feuille, d'Échap, du retour matériel et du geste d'échappement du lecteur d'écran ;
- `title: String? = nil` ; `accessibilityLabel: String?`, obligatoire quand `title` est absent ;
- `height = .content` (épouse le contenu, plafonnée) ; `maximumFraction = 0.62` de la hauteur disponible, en gardant au moins 120 pt au-dessus ;
- `showsHandle = true` ; `isDragDismissEnabled = true` ; `closeLabel: String? = « Fermer »` du kit (`nil` : pas de ✕) ;
- `surface = .theme` ; `outside = .dismisses` ; `scrim = false` ; `maxWidth: CGFloat? = nil` (grand écran : la colonne de l'hôte) ;
- web seulement : `restoreFocusTo`, `backEntry = true`, `data` (sondes `data-*`).

Emplacements : `trailing` (bord de fin de l'en-tête, À LA PLACE du ✕ : le « OK » d'A15) et `content`. Pas d'emplacement de tête : une feuille « Annuler · titre · Terminé » passe `title: nil` et monte `MeeshySheetHeader` dans son contenu, comme aujourd'hui. Le contenu reçoit la fermeture de l'hôte par `meeshySheetClose` (iOS, déjà dans MeeshyUI), une lambda (Android) ou `onDismiss` (web).

## 3. États
- Fermée : rien n'est rendu, place publiée nulle.
- Courte, à la hauteur du contenu : R11 (Plus, 464 sur 844), A14 (Création audio, 444).
- Mi-hauteur, corps qui défile : A11 et A12 (Stickers, 424).
- Haute, champ puis liste : A16 (544, le maximum de la planche), A17 (484), A18 (488) ; la ligne de références reste lisible entre scène et feuille (hôte).
- Fin d'en-tête remplacée par une validation : A15 (« OK » plein, titre = nom du son, 484).
- Par-dessus un contenu vivant, sans réduction, `outside: passesThrough` : A19 (viseur armé, 424).
- Sans poignée, en-tête du système : A6 ; c'est la photothèque du système, K15 n'y dessine rien.
- Glissée (suit le doigt, place publiée inchangée), entre deux crans, clavier levé (le bas de la feuille est le haut du clavier, le plafond s'applique à ce qui reste), remplacée par une autre feuille, largeur bornée sur grand écran, surface `theme` claire, voile : aucune vue, conservés du code.
- Vide, chargement, erreur, hors ligne : ceux du contenu ; K15 garde sa hauteur pendant qu'ils changent.

Loi 13 :
- pas de poignée si `showsHandle` est faux ou si le glissé est coupé ; pas de rangée d'en-tête sans titre ni `trailing` ; pas de ✕ quand `trailing` existe ou que `closeLabel` est nul ;
- pas de voile par défaut ; pas de place publiée feuille fermée ; pas de filet ni de bande vide sous le contenu ;
- pendant qu'une feuille est ouverte, l'hôte retire pilule, rails et en-tête : seule la feuille parle.

## 4. Gestes et retours
- Glisser vers le bas depuis la poignée ou l'en-tête : la feuille suit le doigt, sans monter au-dessus de son repos (hors crans). Au relâcher, elle se ferme si le glissé dépasse 25 % de sa hauteur ou si sa fin prédite dépasse 50 % ; sinon elle revient (`MeeshyAnchoredSheetMetrics.dismisses`, la loi d'iOS, portée par les vecteurs).
- Crans : le relâcher conclut vers le plus proche, ou vers celui que la vitesse désigne ; sous le plus bas, la loi de fermeture s'applique.
- Toucher hors de la feuille : ferme en `dismisses`, traverse en `passesThrough`. ✕, Échap (clavier d'iPad, web), retour matériel (Android, coque web par `useBackDismiss`) et échappement du lecteur d'écran : le même `onDismiss`.
- Android seulement, conservé : le reste d'un défilement du contenu vers le bas ferme aussi, par `state.nestedScrollConnection` que l'hôte branche.
- Animation : entrée et sortie par translation depuis le bas, avec fondu ; `motion(reduceMotion:)` est exposé pour que la réduction de l'hôte parte avec la feuille. « Réduire les animations » : apparition et disparition immédiates, le doigt déplace toujours la feuille, le retour est sans ressort.
- Haptique : aucune propre à K15. Le ✕ joue le `light` de K02 par le site unique (`HapticFeedback`, `MeeshyHaptics`, `lib/view/haptics.ts`).
- La place se publie AU REPOS (ouverture, fermeture, cran atteint, hauteur de contenu changée), jamais à chaque image du doigt.

## 5. Accessibilité
- Nom : le titre, annoncé comme titre ; sans titre, `accessibilityLabel`. Rôle : fenêtre modale en `dismisses` (`.isModal` ; `isTraversalGroup` et `paneTitle` ; `<dialog>` ouvert par `showModal()` avec `aria-labelledby`), région nommée non modale en `passesThrough`.
- Valeur : avec des crans, la poignée est un contrôle réglable nommé « Hauteur de la feuille », de valeur « réduite » ou « agrandie » ; sans cran, elle est masquée et la fermeture passe par ✕ ou l'échappement.
- Ordre de lecture : titre, fin d'en-tête, contenu. En `dismisses`, rien derrière n'est atteignable ; sur Android la zone hors feuille est un bouton « Fermer la feuille ».
- Focus : à l'ouverture il entre dans la feuille (titre ou premier contrôle), sans ouvrir de clavier ; à la fermeture il revient à ce qui l'a ouverte (`restoreFocusTo` sur le web).
- Web, clavier : Tab reste dans la feuille en `dismisses`, Échap ferme, anneau `:focus-visible` ; la poignée à crans est un `<button>` (Entrée et Espace basculent, flèches haut et bas choisissent).
- Dynamic Type, `fontScale` 2,0, zoom 200 % : le titre grandit, sur deux lignes au plus ; l'en-tête garde 44 pt ; la feuille `content` grandit jusqu'au plafond, puis le contenu défile ; poignée et ✕ figés, cible du ✕ de 44 pt, 48 dp, 44 px.
- RTL : titre au bord de début, ✕ au bord de fin, par propriétés logiques ; le glissé est vertical.
- Contraste, surface opaque donc indépendant du fond : titre blanc sur `indigo950` 15,98:1, sous-texte à 70 % 8,4:1, poignée à 35 % 3,13:1 (à 30 %, la valeur de la planche, 2,65:1). Surface `theme` : titre 4,5:1 et poignée 3:1 au moins, clair et sombre, calculés par le témoin. « Réduire la transparence » ne change rien.

## 5 bis. Performance
- Ne se re-rend jamais : le contenu de l'hôte et celui de la feuille pendant le glissé. iOS : le décalage est un état local de l'enveloppe, le contenu n'est pas réévalué. Android : décalage lu en phase de placement (`offset { }`). Web : `transform` écrit par référence dans une image d'animation, sans état ; `--kit-sheet-footprint` posé sans rendu.
- S'anime : la translation verticale et l'opacité. Jamais la hauteur image par image, jamais de flou (aucun `backdrop-filter`), ombre fixe.
- Une publication de place par transition ; l'hôte réduit par transformation (échelle et décalage), sans remise en page par image.
- Le contenu n'est monté que feuille ouverte et démonté après la sortie ; rien de retenu ensuite (observateur de taille, écouteurs, entrée d'historique rendue).
- Budget : aucune image perdue en glissant une grille de stickers ouverte ni pendant l'entrée ; ouverture visible à la première image, le contenu se charge après (cache d'abord, chez l'hôte). Web : poids mesuré par `measure-weight.mjs`, aucune dépendance ajoutée.

## 6. Jetons et mesures
Mesures de la planche (390 × 844) :
- coins hauts 28 ; marges 8 en haut, 16 sur les côtés, 24 en bas ; 12 entre poignée, en-tête et corps ;
- poignée 36 × 5, rayon 3, blanc 30 % ; en-tête : titre 17 gras, ✕ doux de 36 ;
- fond `#1C1D23` ; ombre vers le haut y −12, flou 30, noir 40 % ;
- au-dessus : contenu réduit de y 56 jusqu'à 14 pt du haut de la feuille ; 44 pt quand une ligne de références s'y glisse (A17, A18).

Jetons :
- rayon : `MeeshyRadius.xxl` (24), `--radius-sheet` ; marges : `MeeshySpacing.sm`, `.lg`, `.xxl` plus la zone sûre du bas, écart `.md` ;
- surface `dark` : `MeeshyColors.indigo950`, `MeeshyPalette.Indigo950`, `--ios-indigo-950`, schéma sombre forcé sans `preferredColorScheme` ; surface `theme` : `backgroundPrimary`, `--color-ios-surface` ;
- encre : `MeeshyColors.onMedia` et son pendant ; titre : `MeeshyFont.headlineSize` semi-gras relatif, `text-title` ;
- ✕ : K02 `soft`, `s36` ; cible : `MeeshyControlSize.tapTarget`, `--target-min` ; voile : `--color-veil` et son pendant.

Les valeurs propres (poignée 36 × 5 à 35 %, plafond 0,62, réserve de 120, seuils 25 % et 50 %, ombre, ressort 0,32 / 0,88 sur iOS et 280 ms ailleurs) vivent dans `MeeshyAnchoredSheetMetrics`, nulle part ailleurs. L'ombre se convertit comme K01 (rayon SwiftUI = flou / 2).

## 7. Jumeaux
K15 ne rebranche ni ne supprime aucun jumeau (même règle que K02, #17508) : il promeut le plus complet, et l'écran change aux lots d'intégration.
- iOS. DEVIENT : `ComposerAnchoredSheet`, `ComposerAnchoredSheetMetrics`, `ComposerAnchoredSheetTopKey`, `ComposerAnchoredSheetFootprint`, `ComposerFixedHeightSheet`, `ComposerSheetScheme`, `UnevenRoundedSheetShape` (`Features/Composer/ComposerAnchoredSheet.swift`, 241 lignes) et la couche `anchoredSheetLayer` (toucher hors feuille, transition, une seule feuille). Réutilisés : `MeeshySheetClose`, `MeeshySheetHeader`, K02. `dismissOnEscape` (app, 9 fichiers) monte dans `MeeshyUI/Compatibility`, sans changer de nom.
- iOS, supprimés : par I2, ce fichier, `ComposerHostAnchoredSheetLayer` et `anchoredSheetLayer` ; par I3, les tailles et titres de `ComposerPortal` passent aux types de K15 (le portail reste à l'app, comme `composerAnchoredSheetTop`, dérivé de la préférence). Fond et Durée quittent la feuille pour la pilule (K11) au lot qui porte S1 et S5. `panelSheet` des appels est une feuille système : hors K15.
- Android. DEVIENT : `ComposerAnchoredSheet` (`:feature:stories`) et, de `StorySceneFirstLayout.kt`, `AnchoredSheetHost`, `SheetDismissCatcher`, `SHEET_MAX_FRACTION`. Réutilisé : `ComposerPullDismiss` (`:sdk-ui`). Restent à l'app : `StoryComposerSheet`, `StorySheetSlot`, `sceneFraming`, `ComposerSceneReduction`.
- Android, supprimés : par I2 et I3, `ComposerAnchoredSheet` (11 appels, 5 fichiers), `AnchoredSheetHost`, `SheetDismissCatcher`, la chaîne `composer_sheet_dismiss`, les en-têtes privés `ReferenceSheetHeader` et `StorySoundSheetHeader`.
- Web. DEVIENT : la coque de `Sheet` en `presentation="bottom"` (`components/sheet.tsx` : `<dialog>`, fermeture par l'événement `close`, `useBackDismiss`, `restoreFocusTo`, toucher du voile) ; la loi des crans s'inspire de `lib/view/peek-sheet.ts`, qui reste.
- Web, supprimés : par I10, `presentation="bottom"` et ses 8 sites, et les trois coques à la main des appels (#17572). Par I2 et I3 : le studio web n'a aucune feuille ancrée ; `AudienceSheet`, `StudioPreviewSheet` et `composer-sticker-sheet` (plein écran) sont reconstruits sur K15. `Sheet` garde ses trois autres présentations.

## 8. Témoins exigés
Comportements (`MeeshyAnchoredSheetTests`, `MeeshyAnchoredSheetTest`, `meeshy-anchored-sheet.test.tsx`) :
- hauteur : `content` épouse puis plafonne ; `fraction` et crans ordonnés ; jamais plus que la fenêtre, 120 pt gardés au-dessus ;
- glissé : court, il revient ; long ou vif, il ferme ; vers le haut, il ne soulève pas ; crans : plus proche, puis vitesse ;
- place publiée : nulle fermée, égale au haut de la feuille au repos, inchangée pendant le glissé, une seule publication par transition ;
- `onDismiss` appelé une fois par ✕, glissé, toucher hors feuille, Échap, retour matériel ; `passesThrough` laisse passer le toucher ;
- loi 13 : ni poignée, ni en-tête, ni ✕, ni voile hors de leurs conditions ;
- accessibilité : nom, rôle modal ou non, focus à l'entrée et rendu à la sortie, poignée à crans réglable ; web : piège de tabulation, Échap, `aria-labelledby` ;
- « réduire les animations » : aucune transition ; contraste du titre et de la poignée calculé depuis la recette ;
- garde de source : aucun verre, aucune couleur en dur, aucun type du composer dans les fichiers de K15 ; web : `check-kit.mjs` vert ;
- parité : `K15-MeeshyAnchoredSheet.vectors.json` (hauteurs, seuils, crans), lu par les trois suites ; non-régression : le lot ne touche aucun jumeau ni aucun écran (les huit témoins de mesure d'iOS restent verts à côté).

Instantanés (`MeeshyAnchoredSheet/<id>.<variante>`) : `courte`, `mi-hauteur`, `haute`, `valider`, `sans-titre`, `sans-poignee`, `crans`, `theme`, `voile`, `large`, en `clair` et `sombre`, planches `grande-police` et `rtl` ; chacune cadrée avec un bloc d'hôte réduit au-dessus. Web : 390, 820 et 1440 px. Images enregistrées sur la branche du lot (`sdk-tests.yml` et `android.yml` avec `record_snapshots`, `CAPTURE_DIR=docs/product/kit/captures node scripts/check-kit.mjs`) ; Android : aucun nom de test avec « ; » ni « . ».

Catalogue : entrée K15 (`MeeshyKitCatalog+K15.swift`, `KitCatalogK15.kt`, `components/kit/catalog/k15.tsx`). Vues : `courte` R11, `mi-hauteur` A11, `haute` A16, `valider` A15, toutes sur `media`, touchables.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Fermeture : ✕ doux à droite (planche) ; « OK » en texte de marque (iOS) ; aucun en-tête de coque (Android, chaque contenu a le sien) ; ✕ carré au bord de début (web).
- Poignée : planche et iOS ; ni Android ni le web.
- Hauteur : la planche va du contenu à 64,5 % ; iOS a trois fractions fixes (30, 50, 62 %) ; Android épouse ou remplit, plafonné à 55 % ; le web monte à 88 %.
- Surface : `#1C1D23` (planche), `indigo950` forcé sombre sauf le son (iOS), `backgroundPrimary` (Android), surface du thème ou `indigo950` aux appels (web). Rayon : 28, 22, 20, `rounded-card`.
- Glissé : loi 25 % / 50 % depuis l'en-tête (iOS) ; reste de défilement, 120 dp ou jet de 900 dp/s (Android) ; aucun (web).
- Sur iOS, Son, bibliothèque de sons et Lieu sont des feuilles SYSTÈME à cran fixe (leur `NavigationStack` ne recevait aucun toucher dans la pile) ; A6 et A19 sont le sélecteur du système.
- Fond et Durée sont des feuilles dans le code, des options de pilule sur la planche.
- Le web n'a aucune feuille qui réduit son hôte.
- Registre : `depend` ne cite que K00 ; A19 manque aux vues ; « panelSheet » n'est pas un jumeau.
- `dismissOnEscape` (iOS) et `ComposerSceneMotion` (Android) vivent dans l'app.
- La planche pose une ombre et aucun voile ; le code n'a pas d'ombre ; le web et les appels ont un voile.

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. ✕ K02 doux de 36 par défaut, remplacé par `trailing` ; le « OK » d'iOS reste passé par l'hôte jusqu'à l'intégration. Le lot d'une plateforme part après K02 sur cette plateforme. (✕ dessiné par K15 ; « OK » par défaut.)
2. Trois hauteurs (`content` par défaut, `fraction`, crans), plafond 0,62 et 120 pt gardés. (0,55 d'Android ; 0,645 d'A16 ; fractions seules.)
3. Surface `theme` par défaut, `dark` = `indigo950` ; le composer passe `dark`. (Nouveau jeton `#1C1D23` ; sombre par défaut.)
4. Rayon `xxl` (24) partout. (22 et 20 du code ; jeton de 28.)
5. Loi de glissé d'iOS sur les trois ; Android garde la fermeture par reste de défilement, branchée par l'hôte. (Seuils d'Android ; reste de défilement partout.)
6. Poignée par défaut sur les trois, à 35 %. (30 % de la planche ; pas de poignée sur Android et le web.)
7. Hors feuille : ferme, sans voile ; `passesThrough` pour A19 ; `scrim` au choix de l'hôte. (Voile par défaut ; hors feuille inerte.)
8. Les feuilles système restent au système : K15 publie leur place. A6 n'est pas dessinée par K15 ; A19 l'est sur Android et le web, et sur iOS reste le sélecteur en ligne du système. (Tout redessiner ; ignorer les feuilles système.)
9. Aucune haptique propre. (Un `light` à l'ouverture ou au cran.)
10. `dismissOnEscape` est déplacé tel quel dans MeeshyUI par le lot iOS. (Copie dans le kit ; dépendance vers l'app.)
11. Web : `showModal()` en `dismisses`, `show()` et `useBackDismiss` en `passesThrough` ; place publiée par variable CSS. (`div role="dialog"` ; état React.)
12. K15 expose son mouvement, l'hôte s'y accorde. (Durées propres à chaque hôte.)
13. Le lot ne rebranche aucun jumeau. (Rebrancher le composer dans le lot.)

## 10. Lot iOS — ce qui est livré, ce qui a été tranché
Livré (`packages/MeeshySDK/Sources/MeeshyUI/Kit/`) : `MeeshyAnchoredSheetMetrics.swift` (la loi pure, les hauteurs, surfaces, hors-feuille, mouvement), `MeeshyAnchoredSheet.swift` (la feuille, la place publiée, le décalage tenu hors du contenu), `MeeshyAnchoredSheetHost.swift` (`.meeshyAnchoredSheet(isPresented:)` et `(item:)`, `MeeshyAnchoredSheetPlaceholder`, `.meeshyFixedHeightSheet`), l'entrée de catalogue K15 (dix états), `MeeshyAnchoredSheetTests`, `MeeshyAnchoredSheetSnapshotTests`, les vecteurs, quatre chaînes dans sept langues. `dismissOnEscape` est déplacé tel quel dans `MeeshyUI/Compatibility/EscapeDismiss.swift` (rendu public) ; `EscapeDismissGuardTests` lit son nouveau chemin.

Aucun écran ne change. `ComposerAnchoredSheet`, `ComposerHostAnchoredSheetLayer` et `anchoredSheetLayer` restent en place (jumeaux, supprimés par I2/I3). Seule dérogation, sans effet visible : `ComposerAnchoredSheetMetrics` lit ses fractions, la loi de fermeture, le décalage et le haut au repos dans `MeeshyAnchoredSheetMetrics`, au lieu de les recopier ; sa hauteur garde sa règle (`min(place × fraction, place)`, sans la réserve de 120 pt) tant que le composer n'est pas intégré, pour ne rien changer à l'écran.

Choix du lot iOS :
- le décalage du glissé vit dans un modèle observé par la seule enveloppe `offset` : ni l'hôte ni le contenu de la feuille ne sont réévalués à chaque image du doigt ; la place est calculée au repos (`restingTop`), jamais lue sur la feuille qui bouge ;
- des crans : la feuille est mise en page UNE fois à la hauteur du cran le plus haut et glissée vers le bas jusqu'au cran courant (translation, aucune hauteur animée) ; le contenu reçoit en bas la marge du cran manquant pour rester atteignable ;
- le focus d'accessibilité entre sur le titre à l'ouverture ; sans titre, le premier élément de la feuille modale ;
- poignée sur surface `theme` à 50 % de l'encre du thème (à 35 %, elle tombe sous 3:1 sur fond blanc) ; sur `dark`, 35 % comme la fiche.
