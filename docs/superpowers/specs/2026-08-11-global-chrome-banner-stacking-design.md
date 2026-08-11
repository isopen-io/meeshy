# Chrome global unifié — SyncPill partout + bannière d'appel en Y-stacking

Date : 2026-08-11 (révisée 2026-08-12 après revue Opus 3 angles + vérification SOTA externe)
Plateforme : iOS (iPhone + iPad)
Branche : à créer (`feat/global-chrome-banner-stacking`)

## Révision

Ce document a été durci par 3 revues indépendantes en sous-agents Opus (architecture/
composition SwiftUI, interfaces/dépendances, doc/SOTA) + une vérification de références
externes (CallKit, WhatsApp/Telegram/Signal/Messenger, WCAG 2.2.2 et 1.4.3/1.4.11). Les
trois revues ont indépendamment trouvé le même risque bloquant (§B1) — c'est le signal
le plus fort de sa réalité. Toutes les sections ci-dessous intègrent les correctifs ;
rien n'a été laissé en l'état d'origine sans revérification.

**Deux constats externes à connaître avant de lire la suite** (ils ne changent pas la
décision produit, déjà validée deux fois par l'utilisateur, mais ils changent CE QUI DOIT
être construit pour que ce soit robuste) :
- Le geste swipe horizontal → bulle flottante n'a **aucun précédent** dans WhatsApp,
  Telegram (zéro gesture recognizer sur sa barre d'appel — affichage seul, tap pour
  restaurer) ou Signal (PiP entré par bouton explicite, pas par swipe sur une bannière).
  C'est un geste à inventer, pas à apprendre par analogie — un indice visuel de
  swipabilité est donc ajouté (§Partie 2).
- Aucune app de référence (WhatsApp, Telegram, Signal, Messenger, Discord, Slack)
  n'affiche d'indicateur de frappe en dehors de la liste des conversations elle-même ;
  Discord traite l'idée d'un indicateur de frappe "serveur entier" comme une demande de
  fonctionnalité explicitement rejetée. Le texte qui défile en boucle sans mécanisme
  d'arrêt est de plus une violation **WCAG 2.2.2 (niveau A)** — pas une simple
  recommandation de style. Un mécanisme de pause est donc **obligatoire**, pas optionnel
  (§Partie 3).

## Problème

**SyncPill** (indicateur de frappe "quelqu'un écrit ailleurs", statut de connexion, file
d'attente hors-ligne) est monté à la main sur 9 écrans distincts (`RootView` ×3 cas de
route, `FeedView`, `ConversationView`, `PostDetailView`, `iPadRootView+Panels` ×3), plus
un 10ᵉ hors périmètre (`StoryViewerContainer`, cover séparé). Sur les ~20 autres écrans de
l'app (réglages, profil, contacts, découverte, favoris, messages épinglés, demandes
d'amis, écran d'accueil `ConversationListView` lui-même…), il n'existe pas du tout — d'où
l'impression que l'indicateur de frappe « ne s'affiche que dans les conversations ». Le
mécanisme de détection et d'affichage existe déjà et fonctionne
(`ConnectionBanner.typingEntries`, testé) ; seul le montage est troué.

**Bannière d'appel** (`FloatingCallPillView`) est déjà montée une seule fois par
plateforme, correctement, via le `ViewModifier` partagé `CallPresentationLayer`. Mais elle
flotte en `.overlay` (Z-index par-dessus le contenu, capsule arrondie en verre, largeur
plafonnée) plutôt que de réserver son espace et pousser le reste de l'app vers le bas.

## Décisions produit (validées par maquette approuvée)

1. **Bannière d'appel** — passe en réservation d'espace (`.safeAreaInset`, pas
   `.overlay`) : pousse TOUT le contenu de l'app vers le bas quand un appel est actif.
   Bandeau plein bord-à-bord, aplat couleur primaire assombri pour le contraste (voir
   §Partie 2 — WCAG), au lieu de la capsule flottante en verre actuelle. Avatar, nom,
   durée/statut, boutons mute/haut-parleur/raccrocher : inchangés. Geste swipe
   gauche/droite → réduction en bulle (`collapseDragGesture` / `CallBubbleGestureResolver`)
   : **conservé tel quel sur demande explicite de l'utilisateur**, malgré l'absence de
   précédent externe — un indice visuel de swipabilité est ajouté en compensation.
2. **SyncPill** — reste en survol Z-index (`.overlay`, jamais `.safeAreaInset`), centré
   horizontalement, largeur limitée. **Changement de mécanisme** : le montage actuel
   utilise `.safeAreaInset` sur 6 des 9 sites (pousse le contenu aujourd'hui), `.overlay`
   non-tappable sur 1 (`ConversationView`), et un positionnement inline sur 2
   (`FeedView`, `PostDetailView`) — voir §Partie 1/C1 pour le détail exact site par site.
   Ce lot unifie tout vers `.overlay`, tappable partout, pour matcher la maquette
   approuvée.
3. **Point de montage unique par plateforme**, pour les deux bannières — plus jamais de
   montage dispersé écran par écran, avec une exception assumée pour le flux invité (voir
   §C3) et l'aperçu de notification (voir §C2). Voir « Ordre de composition » ci-dessous
   pour la mécanique précise qui fait cohabiter les deux.
4. **SyncPill : défilement du texte trop long.** Nouveau — une largeur max explicite
   (absente aujourd'hui, la pill grandit avec le texte puis tronque au bord de l'écran).
   Si le texte dépasse cette largeur : défilement en boucle façon ticker (pause → glisse
   à gauche → reset), pas de troncature `…`. Mécanisme de pause obligatoire (WCAG 2.2.2,
   §Partie 3).

## B1 — BLOQUANT : `ConnectionBanner` doit recevoir `conversationListViewModel` en
paramètre explicite, jamais en `@EnvironmentObject`

Trouvé indépendamment par les 3 revues — c'est le point le plus important du document.

`ConnectionBanner.swift:34` déclare
`@EnvironmentObject private var conversationListViewModel: ConversationListViewModel`,
lu inconditionnellement dans `entries` (`ConnectionBanner.swift:173`). Sans cet objet dans
l'environnement : `Fatal error: No ObservableObject of type ConversationListViewModel
found`, **au premier rendu, donc au lancement de l'app**.

Le point de montage proposé (chaîné juste avant `.modifier(CallPresentationLayer())`, sur
`RootView.swift:~751`) est positionné **après** l'injection
`.environmentObject(conversationViewModel)` (`RootView.swift:583`) dans l'ordre du
fichier, mais un `.overlay(...)` n'hérite pas de façon fiable des `@EnvironmentObject`
posés sur la MÊME chaîne de modifiers dans ce codebase — ce n'est pas une supposition
théorique, c'est un motif de panne **documenté et vécu quatre fois** :
- `FloatingCallPillView.swift:93-95` — exactement ce composant frère, exactement ce
  mécanisme `.overlay`.
- `StoryViewerView.swift:255-261` — même objet, `ConversationListViewModel`.
- `AudioFullscreenView.swift:129` — refactoré en closures pour éviter le crash à travers
  une barrière `fullScreenCover`.
- `PanelBackAction.swift:11-12` — documente explicitement l'asymétrie : une sheet/overlay
  hérite des `EnvironmentValues` (clés simples, retombent sur leur `defaultValue` en
  silence) mais **pas** des `EnvironmentObject` (crash bruyant).

**Correctif** : `ConnectionBanner` prend `conversationListViewModel` en paramètre
d'initialiseur explicite (`@ObservedObject var conversationListViewModel:
ConversationListViewModel`), exactement comme `FloatingCallPillView(callManager:)` le
fait déjà pour `CallManager`. Par défensive (l'asymétrie EnvironmentValues/EnvironmentObject
documentée ci-dessus suggère que `isStoryViewerPresenting` propagerait correctement via
`.overlay`, mais rien ne coûte à éliminer le doute) : `isStoryViewerPresenting` passe
aussi en paramètre explicite (`Bool`, pas `@Environment`), toujours par analogie avec le
seul autre composant survivant à cette position.

Au point de montage unique (`RootView.swift`) :
```swift
.overlay(alignment: .top) {
    ConnectionBanner(
        conversationListViewModel: conversationViewModel,
        isStoryViewerPresenting: storyViewerCoordinator.pendingRequest != nil,
        onItemTap: handleSyncPillTap,
        activeConversationId: { router.currentConversationId ?? notificationPreviewConversation?.id }
    )
}
.modifier(CallPresentationLayer())
```
(le `?? notificationPreviewConversation?.id` couvre §C2 ci-dessous — gratuit, l'état
existe déjà sur `RootView`).

Les 9 anciens call sites qui utilisaient l'injection par environnement disparaissent avec
le hoist ; aucun autre call site de `ConnectionBanner` ne subsiste hors de celui-ci, du
montage iPad équivalent, et des deux exceptions documentées (§C3, `StoryViewerContainer`).

## B2 — Ordre de composition, et ce qui bouge RÉELLEMENT avec `PiPSourceAnchor` /
`CallWaitingBannerView`

Le point piège général : `.overlay(alignment: .top)` s'aligne sur le bord haut de la vue
à laquelle il est appliqué, tel qu'il était **avant** tout `.safeAreaInset` déjà chaîné
dessus ; un `.safeAreaInset` ne réduit pas la *frame* de la vue modifiée, seulement sa
safe area, tandis qu'un `.overlay(alignment:)` s'aligne sur la frame.

`CallPresentationLayer.body(content:)` chaîne aujourd'hui, dans cet ordre, sur son
`content` reçu :
```swift
content
  .overlay(alignment: .top) { PiPSourceAnchor() … }              // #1 — inchangé
  .overlay(alignment: .top) { FloatingCallPillView(…) }          // #2 → devient .safeAreaInset
  .overlay { CallBubbleView(…) }                                  // #3 — inchangé
  .overlay(alignment: .top) { CallWaitingBannerView(…) }          // #4 — inchangé
```

Ce lot ne touche QUE la ligne #2 (`.overlay` → `.safeAreaInset`), sans réordonner les
trois autres. Conséquence, par construction :
- **`PiPSourceAnchor` (#1) est chaîné AVANT #2** → il fait partie du composite que #2
  enveloppe. Quand la bannière réserve de l'espace (mode `.pip`, banniere visible),
  `content.overlay{PiP}` (déjà formé) descend **avec** elle, comme un bloc. L'ancre ne
  reste donc PAS à l'ancien Y absolu : elle suit la bannière. C'est cohérent (l'ancre PiP
  reste visuellement associée à la zone d'appel) mais **contredit la version précédente
  de ce document**, qui affirmait « PiPSourceAnchor… inchangé ». Corrigé ici : **elle se
  déplace, intentionnellement, avec la bannière**. Aucun test ne couvre cette
  co-localisation aujourd'hui (`grep PiPSourceAnchor apps/ios/MeeshyTests` → une seule
  mention en commentaire) et le simulateur ne supporte pas le PiP système
  (`AVPictureInPictureController.isPictureInPictureSupported()` y est faux) : **la
  transition PiP réelle (émergence + retour) doit être vérifiée sur device physique avec
  un appel réel avant de livrer** — c'est une vérification manuelle obligatoire, pas une
  case à cocher automatiquement.
- **`CallWaitingBannerView` (#4) est chaîné APRÈS #2** → il s'aligne sur le sommet du
  composite déjà poussé (contenu + ancre + bannière), donc s'affiche **sous** la bannière
  d'appel active, jamais par-dessus. C'est le comportement correct pour un second appel
  entrant pendant un appel en cours (les deux doivent rester lisibles) — la version
  précédente du document classait ce composant « hors périmètre, inchangé », ce qui était
  correct pour le CODE (aucune ligne n'y change) mais trompeur pour le COMPORTEMENT
  (sa position À L'ÉCRAN change, en conséquence directe du changement de #2).

**SyncPill doit suivre la même règle** : son `.overlay` s'applique sur `content` AVANT
`.modifier(CallPresentationLayer())`, donc avant que la bannière d'appel ne pousse quoi
que ce soit — exactement la position structurelle de `PiPSourceAnchor`. Le composite
« contenu + SyncPill » descend donc ensemble avec la bannière d'appel active, la pill
restant juste sous elle :
```swift
content
  .overlay(alignment: .top) {
      ConnectionBanner(conversationListViewModel: conversationViewModel,
                        isStoryViewerPresenting: storyViewerCoordinator.pendingRequest != nil,
                        onItemTap: handleSyncPillTap,
                        activeConversationId: { router.currentConversationId ?? notificationPreviewConversation?.id })
  }
  .modifier(CallPresentationLayer())   // applique en interne : PiPAnchor(overlay) → Banner(safeAreaInset) → Bubble(overlay) → CallWaiting(overlay)
```

## B3 — BLOQUANT : `iPadRightPanelNavigationGuardTests` casse, et ça doit être assumé
dans le lot, pas découvert en CI

`MeeshyTests/Unit/Views/iPadRightPanelNavigationGuardTests.swift:107-117`,
`test_iPadPanels_connectionBanner_alwaysRoutesTaps`, grep littéralement (post strip
commentaires) la présence de `"ConnectionBanner(onItemTap: handleSyncPillTap"` dans
`iPadRootView+Panels.swift`. Ce lot retire les 3 occurrences de ce fichier par
construction (§Partie 1) → **échec CI garanti**, pas une régression accidentelle.

**Correctif inclus dans le lot** : réécrire ce test pour vérifier le NOUVEAU point de
montage unique (grep sur le fichier où il vit désormais), avec la même intention
(« le tap sur la bannière iPad route bien vers `handleSyncPillTap` ») plutôt que sur son
ancienne localisation.

Deux autres gardes de source, à ne pas casser par effet de bord du lot 3 (marquee) :
- `ReduceMotionComplianceTests.swift:65-96` grep `SyncPill.swift` pour
  `@Environment(\.accessibilityReduceMotion)` et les deux usages `reduceMotion ? … :`
  déjà présents. Le marquee AJOUTE du code, ne doit PAS déplacer/reformater ces lignes
  existantes.
- `SyncPillTimerStateTests.swift:29-39` grep un **littéral exact** (sans normalisation
  d'espaces) : `@State private var dotTimer = Timer.publish(every: 0.5, on: .main, in:
  .common).autoconnect()`. Cette ligne (`SyncPill.swift:94`) ne doit pas être reformatée
  ni fusionnée avec un éventuel second timer du marquee.

## Partie 1 — Points de montage uniques

### iPhone (`RootView.swift`)
- Retirer les 3 blocs `.safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner(...) }`
  actuellement attachés aux cas `.communityList`, `.communityDetail`, `.notifications`
  dans le switch `.navigationDestination(for: Route.self)`.
- Retirer le montage `ConnectionBanner()` de `FeedView.swift` (ligne ~980) et
  `PostDetailView.swift` (ligne ~623).
- **`ConversationView.swift:1354-1361`** : ce montage n'est PAS un doublon simple du
  point de montage racine — c'est un `ZStack` overlay avec **`.allowsHitTesting(false)`**
  (non-tappable aujourd'hui, volontairement — cf. C1) ET un décalage vertical qui suit
  `composerState.showOptions` (56/72 pt) pour se poser sous `floatingHeaderSection`
  (`ConversationView.swift:1342, 1526`). Le retirer sans rien faire d'autre expose le
  SyncPill hoisté au risque de chevaucher ce header flottant propre à l'écran de
  conversation (les deux sont des overlays top-aligned indépendants). **Correctif** :
  passer un padding-top conditionnel identique (56/72 pt selon `composerState.showOptions`)
  au point de montage racine QUAND `router.currentConversationId != nil` — ou, plus
  simple et plus robuste puisque le padding dépend d'un état PRIVÉ à `ConversationView`
  non exposé au parent, garder un décalage minimal fixe suffisant pour la position basse
  (72 pt) au lieu d'essayer de suivre l'état exact. Choix retenu : **padding-top fixe de
  72 pt appliqué au SyncPill uniquement quand une conversation est active**, quitte à
  laisser un peu d'air quand `composerState.showOptions` est faux (56 pt suffiraient) —
  c'est un compromis visuel mineur assumé plutôt qu'un couplage à un état privé d'un
  écran distant.
- Ajouter UN seul montage, chaîné sur le body de `RootView` juste avant
  `.modifier(CallPresentationLayer())` (cf. §B1/§B2 pour le code exact et le
  raisonnement d'ordre).
- **Reels immersif (C4)** : le lecteur de réels iPhone (`reelsPresenter.launch`,
  `RootView.swift:476`, `.zIndex(60)`) est un FRÈRE de ZStack, pas un `fullScreenCover` —
  contrairement au story viewer, il n'a **aucune** garde d'environnement aujourd'hui.
  `RootView` masque déjà explicitement boutons flottants et menu dans cet état
  (`reelsPresenter.launch == nil`, lignes 482/498) ; le SyncPill hoisté doit suivre la
  même garde pour ne pas flotter par-dessus un réel plein écran :
  ```swift
  .overlay(alignment: .top) {
      if reelsPresenter.launch == nil {
          ConnectionBanner(...)
      }
  }
  ```
- Ce point de montage unique couvre le `NavigationStack` (écran d'accueil
  `ConversationListView` + les ~24 routes poussées, y compris les ~20 qui n'avaient rien)
  ET l'overlay `FeedView` (frère du `NavigationStack` dans le même `ZStack` racine),
  puisque `.overlay` s'applique à TOUT le body de `RootView`.

### iPad (`iPadRootView` / `iPadRootView+Panels.swift`)
- Même principe : retirer les 3 montages dupliqués dans `iPadRootView+Panels.swift`.
- Ajouter un montage unique au même niveau que `.modifier(CallPresentationLayer())`
  (`iPadRootView+Sheets.swift`), avec `activeConversationId: { activeConversation?.id }`
  (l'iPad ne route pas la conversation active via `Router.path` — cf. commentaire
  existant sur `Router.currentConversationId`).
- Même garde `reelsPresenter.launch == nil` : sur iPad les réels sont un
  `fullScreenCover` (`iPadRootView+Sheets.swift:154`), donc déjà isolés d'un `.overlay`
  posé sur le contenu qu'il recouvre — à vérifier au moment de l'implémentation que
  cette isolation est bien effective (le cover est monté par un appelant différent de
  celui qui monte le point de montage unique), sinon appliquer la même garde explicite
  par cohérence.

## C1 — Les 9 sites de montage n'utilisent PAS tous le même mécanisme aujourd'hui

Correction d'une affirmation fausse de la version précédente (« le montage actuel utilise
déjà `.safeAreaInset` partout »). État réel, vérifié fichier par fichier :

| Site | Mécanisme réel aujourd'hui | Devient après ce lot |
|---|---|---|
| `RootView.swift:306/327/363` | `.safeAreaInset` | supprimé (couvert par le hoist) |
| `iPadRootView+Panels.swift:36/57/90` | `.safeAreaInset` | supprimé (couvert par le hoist) |
| `ConversationView.swift:1354-1361` | overlay ZStack, `.allowsHitTesting(false)` — **non tappable** | supprimé (couvert par le hoist, **devient tappable** — changement de comportement délibéré, cohérent avec tous les autres écrans) |
| `FeedView.swift:980` | inline dans le flux du `VStack`, défile avec le contenu | supprimé (couvert par le hoist, épinglé au sommet au lieu de défiler) |
| `PostDetailView.swift:622-623` | 1er enfant du `VStack(spacing: 0)`, pousse le contenu | supprimé (couvert par le hoist, survole au lieu de pousser) |

Les deux derniers points (Feed, PostDetail) sont des changements de comportement mineurs
et cohérents avec la décision produit 2 (SyncPill = survol partout). Le point
`ConversationView` (devient tappable) est traité au §Partie 1 ci-dessus (décalage vertical).

## C2 — `router.currentConversationId` : équivalence corrigée (pas « strictement
équivalente », un cas identifié et résolu)

L'affirmation « vérifié, strictement équivalent » de la version précédente est fausse
pour un cas concret : `RootView.swift:590-608` présente `ConversationView(conversation:
conv, previewMode: true)` dans une `.sheet` (aperçu de notification par long-press/pull-
down sur un toast). Dans ce cas, `router.path` n'est pas muté → `currentConversationId`
ne reflète pas la conversation prévisualisée.

**Corrigé, pas seulement documenté** : l'état `notificationPreviewConversation:
Conversation?` existe déjà sur `RootView` (`RootView.swift:209`) — la fermeture
d'exclusion devient `{ router.currentConversationId ?? notificationPreviewConversation?.id }`
(déjà intégrée au code du §B1). Coût nul, ferme le seul écart identifié.

Écart résiduel accepté, non corrigé : `ConversationView` monté dans `iPadRootView+Sheets.swift:62`
(sheet également) — même nature de trou, plus rare, laissé pour un lot ultérieur si
observé en usage réel (le SyncPill racine reste de toute façon masqué visuellement par
la sheet elle-même dans la plupart des cas — `.large`/`.medium` selon la feuille).

## C3 — `GuestConversationContainer` (flux anonyme) : coverage PRÉSERVÉE, pas supprimée

`MeeshyApp.swift:101-140` : un utilisateur non authentifié ne monte JAMAIS
`RootView`/`iPadRootView` — le flux anonyme présente `GuestConversationContainer`
(`fullScreenCover` depuis `MeeshyApp.swift:129`), qui rend `ConversationView`
(`GuestConversationContainer.swift:19`). Sa SEULE source de SyncPill est le montage local
de `ConversationView.swift:1357` (qui, sans garde-fou, disparaîtrait par la suppression
prévue en §Partie 1 pour le cas AUTHENTIFIÉ). `MeeshyApp` n'injecte de toute façon que
`authManager` + `deepLinkRouter` — pas de `ConversationListViewModel` — donc le hoist
racine n'atteindrait de toute façon jamais ce flux.

**Correctif** : `ConversationView` gagne un paramètre `showsOwnConnectionBanner: Bool =
false` (défaut = ne montre RIEN, le point de montage racine couvre déjà le flux
authentifié normal). Seul `GuestConversationContainer.swift` passe `true` à son
instanciation — préservant sa couverture actuelle sans dupliquer la pill dans le flux
principal. Portée volontairement minimale : le concept « frappe dans une AUTRE
conversation » n'a pas vraiment de sens pour une session invité (généralement limitée à
une seule conversation) — seul le statut de connexion/hors-ligne reste pertinent, et il
l'était déjà avant ce lot.

## Partie 2 — Bannière d'appel : Y-stacking + aplat couleur + accessibilité

Dans `FloatingCallPillView.body` :
- Le conteneur externe (`pillContent`) perd `.adaptiveGlass(...)`,
  `.clipShape(RoundedRectangle(cornerRadius: 24))`, la bordure glass, et
  `.frame(maxWidth: 560).padding(.horizontal, 10)` (qui la plafonnait et la centrait en
  capsule).
- Le montage passe de `.overlay(alignment: .top) { FloatingCallPillView(...)
  .padding(.top, MeeshySpacing.sm) }` à `.safeAreaInset(edge: .top, spacing: 0) { … }`
  dans `CallPresentationLayer`, à sa position ACTUELLE dans la chaîne de modifiers (entre
  `PiPSourceAnchor` et `CallBubbleView` — cf. §B2, ne pas réordonner). Le
  `.padding(.top, MeeshySpacing.sm)` disparaît (bannière bord-à-bord).
- Le contenu interne (`CallParticipantVisual`, `userInfoSection`, `statusLine`,
  `controlButtons`, `pillStatus`) ne change pas.

### Couleur — correctif WCAG obligatoire

Vérification chiffrée (formule de luminance relative sRGB, seuils WCAG 1.4.3/1.4.11) : le
`brandGradient` brut (`indigo500 #6366F1` → `indigo700 #4338CA`) NE PASSE PAS le contraste
minimum pour la plupart du contenu actuel de la bannière, à AUCUNE position du dégradé :

| Élément | Contraste vs stop clair (`indigo500`) | Contraste vs stop foncé (`indigo700`) | Seuil requis |
|---|---|---|---|
| Nom (blanc, `.subheadline`) | 4,47:1 | 7,90:1 | **4,5:1** (texte normal — voir note tailles) |
| Durée d'appel (`success #34D399`) | 2,32:1 | 4,11:1 | **4,5:1** |
| Glyphe Sonnerie/Connexion (`warning #FBBF24`) | 2,68:1 | — | **3:1** (composant UI/graphique) |
| Glyphe Reconnexion (`error #F87171`) | 1,61:1 | — | **3:1** |
| Haut-parleur actif (`indigo400 #818CF8`) | 1,50:1 | 2,65:1 | **3:1** |

Note tailles : les points WCAG sont des points CSS/typographiques (1pt = 1,333px), pas des
points iOS (density-independent, ≈ CSS px). Le texte "large" WCAG (seuil relâché à 3:1)
correspond à environ **24 pt iOS régulier / ~18,7 pt iOS gras** — le texte de cette
bannière (11-13 pt) est donc "normal text", **jamais** éligible au seuil relâché. Aucune
position du dégradé ne sauve la palette actuelle sur la durée/le glyphe de reconnexion/le
haut-parleur actif.

**Correctif** : fond `MeeshyColors.brandGradient` + scrim uniforme
`Color.black.opacity(0.22)` appliqué entre le dégradé et le contenu (technique déjà
implicitement utilisée ailleurs dans l'app pour la lisibilité sur fond variable — cf.
`storyOverlayLegible`/halo de contraste des commentaires de story, livré plus tôt dans ce
même cycle). Le scrim doit être vérifié par un test pur (même technique que
`Color.luminance` + les tests de contraste déjà écrits pour le halo de story cette
semaine) : recalculer les 5 ratios ci-dessus avec le scrim appliqué et assert qu'ils
passent leurs seuils respectifs (4,5:1 texte, 3:1 UI/graphique). Si `0.22` ne suffit pas
pour un élément (le haut-parleur actif à `indigo400` est la marge la plus fine), soit
augmenter le scrim jusqu'à ce que TOUS les éléments passent, soit remplacer les couleurs
d'état les plus fragiles (`indigo400`, `success`, `warning`) par des variantes plus
saturées/plus claires **spécifiques à cette bannière** plutôt que de sur-assombrir
l'ensemble — décision à trancher empiriquement pendant l'implémentation, avec le test de
contraste comme juge de paix, pas à l'œil.

### Accessibilité — indice de swipabilité

Le geste swipe-pour-réduire est conservé (décision explicite de l'utilisateur), mais
n'a aucun précédent dans les apps de référence (Telegram : zéro geste sur sa barre
d'appel ; Signal : bouton explicite, pas de swipe) — donc non découvrable par analogie.
Ajout : un indice visuel discret (ex. deux petits chevrons `‹ ›` semi-transparents en
bord de bannière, ou un léger grip horizontal), non focusable par VoiceOver (l'action
`.accessibilityAction(named: "Réduire en bulle")` déjà présente sur la bannière couvre
l'accès non-visuel). Détail d'implémentation, pas un nouveau composant.

### `.frame(minHeight: pillHeight)` et Dynamic Type — accepté comme voulu, pas un bug

Le passage en `.safeAreaInset` fait de la hauteur mesurée de la bannière un input de
layout pour toute l'app (contrairement à `.overlay`, neutre pour le layout). C'est
exactement l'effet recherché par le Y-stacking : à une taille de police d'accessibilité
élevée, la bannière grandit (`userInfoSection` empile deux lignes scalables) et pousse en
conséquence un peu plus de contenu. Comportement voulu — à vérifier visuellement à la
plus grande taille Dynamic Type + un appel réel, pas un défaut à corriger.

## Partie 3 — SyncPill : largeur limitée + défilement du texte long + pause obligatoire

Nouveau, dans `SyncPill.swift` :
- Une largeur max explicite, appliquée à la **zone de texte spécifiquement** (pas à
  `pillContent` dans son ensemble) : `SyncPill.swift:162-167` place un `Text("i/n")` en
  sibling du label dans le même `HStack` — contraindre `pillContent` entier écraserait ce
  compteur ou compresserait le label de façon imprévisible. Le plafond de largeur porte
  sur un conteneur dédié autour du `Text` du label uniquement.
- Fonction pure et testable (même famille que `SyncPillRotator` / `CallBubbleGestureResolver`),
  `SyncPillMarquee` :
  - `shouldScroll(textWidth: CGFloat, availableWidth: CGFloat) -> Bool`
  - `scrollDuration(textWidth: CGFloat) -> Double` (vitesse constante, durée
    proportionnelle à la longueur du texte à parcourir)
- **Correctif de mesure (piège identifié en revue)** : `SyncPill.swift:156` compose le
  texte affiché comme `label + animatedDots` (`"."`/`".."`/`"..."`, incrémenté 2×/s par
  `dotTimer`). Mesurer CE texte composé referait la mesure 2×/s et ferait osciller
  `shouldScroll`/redémarrer l'animation en boucle — un défilement épileptique. **La
  mesure et le défilement portent sur `label` SEUL**, jamais sur `label + animatedDots`.
  Quand `shouldScroll` est vrai pour une entrée, les points de suspension animés sont
  simplement omis pour cette entrée-là : le mouvement du défilement lui-même porte déjà
  le signal « en cours », les deux animations superposées seraient redondantes et c'est
  précisément leur superposition qui causait le bug de mesure.
- Mesure de la largeur réelle de `label` via `GeometryReader` en fond du `Text`, comparée
  à la largeur disponible de la zone de texte.
- Si `shouldScroll` : remplace `.lineLimit(1)` par un conteneur masqué (`.mask`/`.clipped`)
  + une animation `Animation.linear(duration:).repeatForever(autoreverses: false)` sur
  l'offset horizontal, cycle pause → glisse à gauche jusqu'à disparition → reset → repeat.
  Respecte `accessibilityReduceMotion` (déjà lu ailleurs dans `SyncPill`) : texte statique
  tronqué au lieu du défilement quand Reduce Motion est actif.
- Si `!shouldScroll` : comportement actuel inchangé (`.lineLimit(1)`, dots animés
  conservés — pas de défilement, le texte tient déjà dans la largeur).

### Mécanisme de pause — obligatoire, pas optionnel (WCAG 2.2.2, niveau A)

Le texte qui défile en boucle est un contenu en mouvement, automatique, en parallèle
d'autre contenu (les autres écrans de l'app) — les trois conditions de la SC 2.2.2
(Pause, Stop, Hide) sont réunies. **`accessibilityReduceMotion` ne suffit PAS comme
justificatif de conformité** : la technique C39 (respect de `prefers-reduced-motion`) est
listée comme suffisante pour la SC 2.3.3 (Animation from Interactions), **pas** pour la
2.2.2 — la question est d'ailleurs formellement ouverte et non tranchée au W3C (issues
GitHub w3c/wcag #3766 et #4319). Un mécanisme actionnable par l'utilisateur est requis
indépendamment du réglage système.

**Correctif** : un appui long (`.onLongPressGesture`) sur la pill, quelle que soit
l'entrée visible, bascule un état de pause qui gèle À LA FOIS la rotation
(`SyncPillRotator`) et le défilement du marquee en cours — distinct du tap court
(qui garde son comportement actuel : navigation si `source != nil`, avance manuelle
sinon). Un second appui long relance. Reste actionnable par VoiceOver via une
`.accessibilityAction` dédiée (« Mettre en pause »/« Reprendre »), sur le modèle de
`.accessibilityAction(named:)` déjà utilisé par `FloatingCallPillView`.

## Tests

- **`SyncPillMarquee`** (nouveau, pur) : `shouldScroll`/`scrollDuration` — tests unitaires
  directs, mêmes conventions que `SyncPillRotatorTests`/`SyncPillTimerStateTests`. Cas à
  couvrir explicitement : la mesure ignore `animatedDots` (texte court + dots ne déclenche
  jamais `shouldScroll` à tort) ; largeur pile au seuil ; largeur très supérieure.
- **Contraste bannière d'appel** (nouveau, pur) : recalcule les 5 ratios du tableau
  §Partie 2 avec le scrim appliqué, assert chacun contre son seuil (4,5:1 texte, 3:1
  UI/graphique) — même technique que `Color.luminance` déjà présente dans le SDK.
- **Pause marquee/rotation** (nouveau) : appui long bascule l'état de pause, un second
  appui long le lève ; le tap court garde son comportement actuel inchangé pendant la
  pause.
- **`iPadRightPanelNavigationGuardTests.test_iPadPanels_connectionBanner_alwaysRoutesTaps`**
  (réécrit, §B3) : vérifie le nouveau point de montage unique au lieu de l'ancien
  littéral par panneau.
- **Non-régression explicite** : `ReduceMotionComplianceTests` (lignes exactes
  préservées, §B3), `SyncPillTimerStateTests` (littéral `dotTimer` préservé, §B3),
  `ConnectionBannerTypingEntriesTests` (logique pure, non affectée par le montage),
  `CallBubbleGestureResolverTests`/`CallPiPPolicyTests` (logique pure du swipe/PiP,
  inchangée), `FloatingCallPillViewTests` (les assertions `.frame(maxWidth: .infinity)`,
  `.frame(minHeight: pillHeight)`, boutons 44×44 survivent — vérifiées ligne par ligne en
  revue, cf. rapport interfaces).
- **Points de montage (build + parcours manuel)** : pas de test automatisé réaliste pour
  « ce modificateur est appliqué à cet endroit précis de l'arbre de vues » au-delà des
  gardes de source déjà listées — vérification par build + parcours manuel de chaque
  écran précédemment troué (réglages, profil, contacts, découverte, favoris, messages
  épinglés, demandes d'amis, écran d'accueil), PLUS le flux invité (§C3, vérifier que le
  SyncPill y apparaît toujours), PLUS l'aperçu de notification (§C2, vérifier que la
  conversation prévisualisée est bien exclue de la rotation des frappeurs).
- **Vérification manuelle obligatoire sur device physique, appel réel** (§B2) : la
  transition PiP (émergence + retour) reste cohérente avec la position déplacée de
  `PiPSourceAnchor` — non testable en simulateur, non testable automatiquement.

## Hors périmètre

- `PiPSourceAnchor`, `CallWaitingBannerView` : aucun changement de CODE — leur position à
  l'écran change en conséquence directe de §B2, documenté et assumé, pas « inchangé ».
- `StoryViewerContainer` : aucun changement (déjà correctement isolé par
  `isStoryViewerPresenting`, effectif depuis les 3 chemins racine, vivant depuis les 3
  chemins non-racine qui n'injectent pas ce flag — motif corrigé dans ce document, la
  version précédente le décrivait de façon imprécise).
- Le contenu/logique métier des deux bannières (statuts d'appel, entrées de
  synchronisation, détection de frappe) : aucun changement, seuls le **montage**, le
  **style de conteneur**, et l'**accessibilité** (pause, contraste) évoluent.
- `RootView.connectionStatus` (`@StateObject` mort, jamais lu, `RootView.swift:169`) et le
  commentaire périmé de `PiPSourceAnchor.swift:10-18` (mentionne des fichiers qui ne
  l'importent plus) : repérés en revue, **non corrigés dans ce lot** — nettoyage sans
  rapport avec cette feature, à traiter séparément.
