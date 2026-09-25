## 2026-08-22 (septies) : Rivière — bulles jointes, ouverture au présent, axe du temps, identité vivante

**Contexte** : reprise des lots R-3..R-8 de `tasks/riviere-r137-montage.md` sur `main`, avec la directive produit
« deux messages consécutifs d'un même groupe ont leur bordure JOINTE en pointillé et partagée ».

**Décisions**
- **Une bordure par groupe.** La position de groupe (`RiverGroupPosition` : seule/tête/milieu/queue) se déduit
  purement de la loi (`isFirstInGroup` + rang suivant) dans `RiverConversationMapping.groupPositions`.
  `RiverBubbleOutline` (Shape) dessine un contour OUVERT du côté partagé, `UnevenRoundedRectangle` n'arrondit que
  les coins extérieurs, la bulle qui continue porte le seul pointillé. `Row.continuationSeam` reste au JSON pour le
  web, iOS ne le consomme plus.
- **La bande de couloirs est un overlay, jamais un enfant de l'inset.** Son cadre fixe (jusqu'à 7 × 300 pt) dans
  `safeAreaInset(top)` gonflait le `ScrollView` entier à cette largeur (mesuré : `PlatformContainer[1800×874 @−699]`
  dans `HostingView[402]`) — pane centré, aucun défilement horizontal possible. `frame(maxWidth: .infinity)` ne
  réduit jamais un enfant sous son minimum ; un overlay ne fait jamais grandir son hôte.
- **Deux axes, deux gestes.** `ScrollViewProxy.scrollTo` ne bouge que l'axe du temps sur un pane à deux axes (mesuré :
  X restait la moitié du débordement quelle que soit l'ancre, même sur un `id` de cellule). L'axe des voix se pose par
  un offset explicite — `RiverColumnLayout.horizontalOffset(centeringLane:paneWidth:)`, pur et testé — écrit au
  `UIScrollView` par `RiverHorizontalOffsetWriter` (vue UIKit vide dans le contenu, qui remonte à son scroll view).
- **L'ouverture au présent est une DEMANDE, conclue par la cellule.** La géométrie arrive après le premier `onAppear`
  (messages chargés ensuite) et le curseur d'init valait (0, 0) : la première géométrie peuplée pose le curseur au
  présent et demande le cadrage ; des rangs préfixés (cache → réseau) recalent le curseur sur son MESSAGE. La cellule
  visée conclut le cadrage dans son `onAppear` ; une pile paresseuse ne connaît pas l'`id` d'une cellule non posée.
- **Le canvas vit dans le repère du pane.** En fond de la grille, il vivait dans le repère du contenu et ne coïncidait
  avec les cadres mesurés qu'à l'offset zéro (plus aucun rail cadré au présent). En fond du `ScrollView`, il lit
  l'offset horizontal et tolère les rangs non posés (`RiverCanvasRankPlacement` : au-dessus / au-dessous des rangs
  connus, pur et testé).
- **L'axe des ordonnées est le temps.** `RiverTimeScale` (pur, calendrier injecté) choisit l'unité d'après
  l'amplitude réelle, gradue aux frontières d'unité, projette fraction ↔ rang linéairement dans le temps.
  `RiverTimeHandle` capte son glisser côté UIKit : un `DragGesture` SwiftUI, même prioritaire, laissait le pan du
  scroll view emporter le doigt.
- **Identité vivante injectée.** Présence et story sont résolues par `ConversationView` (mêmes sources que le Fil) et
  injectées au mapping ; la tête de groupe porte `MeeshyAvatar` et ouvre la fiche par le routeur (`ProfileSheetUser`).
- **Le composeur passe au-dessus du pane en Rivière** (zIndex 85 > 80) et le pane lui réserve sa hauteur
  (`bottomInset`) — il était recouvert. Le menu d'appui long reprend les mots du Fil (`action.reply`, `action.copy`).
- **Lot 4 arbitré** : l'ouverture reste gardée par `memberCount` ; la loi sérialise déjà quand les voix actives
  manquent, et un seuil sur les messages en cache rendrait le mode indisponible à froid.
