# Chrome global unifié — SyncPill partout + bannière d'appel en Y-stacking

Date : 2026-08-11
Plateforme : iOS (iPhone + iPad)
Branche : à créer (`feat/global-chrome-banner-stacking`)

## Problème

**SyncPill** (indicateur de frappe "quelqu'un écrit ailleurs", statut de connexion, file
d'attente hors-ligne) est monté à la main sur 9 écrans distincts (`RootView` ×3 cas de
route, `FeedView`, `ConversationView`, `PostDetailView`, `iPadRootView+Panels` ×3). Sur
les ~20 autres écrans de l'app (réglages, profil, contacts, découverte, favoris,
messages épinglés, demandes d'amis, écran d'accueil `ConversationListView`
lui-même…), il n'existe pas du tout — d'où l'impression que l'indicateur de frappe
« ne s'affiche que dans les conversations ». Le mécanisme de détection et d'affichage
existe déjà et fonctionne (`ConnectionBanner.typingEntries`, testé) ; seul le montage
est troué.

**Bannière d'appel** (`FloatingCallPillView`) est déjà montée une seule fois par
plateforme, correctement, via le `ViewModifier` partagé `CallPresentationLayer`. Mais
elle flotte en `.overlay` (Z-index par-dessus le contenu, capsule arrondie en verre,
largeur plafonnée) plutôt que de réserver son espace et pousser le reste de l'app vers
le bas.

## Décisions produit (validées par maquette approuvée)

1. **Bannière d'appel** — passe en réservation d'espace (`.safeAreaInset`, pas
   `.overlay`) : pousse TOUT le contenu de l'app vers le bas quand un appel est actif.
   Bandeau plein bord-à-bord, aplat `MeeshyColors.brandGradient` (comme la barre
   d'appel verte native iOS), au lieu de la capsule flottante en verre actuelle. Avatar,
   nom, durée/statut, boutons mute/haut-parleur/raccrocher : inchangés. Geste swipe
   gauche/droite → réduction en bulle (`collapseDragGesture` /
   `CallBubbleGestureResolver`) : inchangé, fonctionne déjà comme demandé.
2. **SyncPill** — reste en survol Z-index (`.overlay`, jamais `.safeAreaInset`),
   centré horizontalement, largeur limitée. **Changement de mécanisme** : le montage
   actuel utilise déjà `.safeAreaInset` (donc pousse le contenu aujourd'hui) — ce lot
   le fait passer à `.overlay` pour matcher la maquette approuvée (flotte par-dessus
   les premières lignes de contenu, ne réserve pas d'espace).
3. **Point de montage unique par plateforme**, pour les deux bannières — plus jamais
   de montage dispersé écran par écran. Voir « Ordre de composition » ci-dessous pour
   la mécanique précise qui fait cohabiter les deux.
4. **SyncPill : défilement du texte trop long.** Nouveau — une largeur max explicite
   (absente aujourd'hui, la pill grandit avec le texte puis tronque au bord de
   l'écran). Si le texte dépasse cette largeur : défilement en boucle façon ticker
   (pause → glisse à gauche → reset), pas de troncature `…`.

## Ordre de composition — pourquoi ça compte

Le point piège : `.overlay(alignment: .top)` s'aligne sur le bord haut de la vue à
laquelle il est appliqué, TEL QU'IL ÉTAIT avant tout `.safeAreaInset` déjà chaîné
dessus. Si on empile naïvement `content.safeAreaInset(edge: .top) { bannièreAppel }
.overlay(alignment: .top) { syncPill }`, la SyncPill s'aligne sur le sommet de
l'ÉCRAN (même Y que la bannière d'appel), pas sur le sommet du contenu une fois
poussé vers le bas — résultat : les deux bannières se chevauchent au lieu de
s'empiler proprement, contrairement à la maquette (« Avec appel actif »).

**Ordre correct : l'overlay SyncPill s'applique D'ABORD sur le contenu, PUIS le
safeAreaInset de la bannière d'appel enveloppe ce composite.**

```
content
  .overlay(alignment: .top) { ConnectionBanner(...) }   // SyncPill flotte sur LE CONTENU
  .modifier(CallPresentationLayer())                     // qui applique en interne :
                                                          //   .safeAreaInset(edge: .top) { FloatingCallPillView }
                                                          //   (+ les overlays call-waiting / PiP anchor, inchangés)
```

Ainsi, quand un appel démarre, c'est le composite « contenu + SyncPill » qui descend
ensemble d'un bloc — la pill reste juste sous la bannière d'appel, jamais derrière
elle. C'est exactement ce que montre la maquette approuvée.

`CallPresentationLayer.body(content:)` continue de chaîner ses propres `.overlay(...)`
(PiP anchor, bulle, call-waiting) sur son `content` reçu — seule sa ligne
`FloatingCallPillView` change de `.overlay(alignment: .top) { ... }` vers
`.safeAreaInset(edge: .top, spacing: 0) { ... }`.

## Partie 1 — Points de montage uniques

### iPhone (`RootView.swift`)
- Retirer les 3 blocs `.safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner(...) }`
  actuellement attachés aux cas `.communityList`, `.communityDetail`, `.notifications`
  dans le switch `.navigationDestination(for: Route.self)`.
- Retirer le montage `ConnectionBanner()` de `FeedView.swift` (ligne ~980),
  `ConversationView.swift` (ligne ~1357), `PostDetailView.swift` (ligne ~623).
- Ajouter UN seul montage, chaîné sur le body de `RootView` juste avant
  `.modifier(CallPresentationLayer())` (cf. ordre de composition ci-dessus) :
  ```swift
  .overlay(alignment: .top) {
      ConnectionBanner(onItemTap: handleSyncPillTap, activeConversationId: { router.currentConversationId })
  }
  .modifier(CallPresentationLayer())
  ```
- Ce point de montage unique couvre le `NavigationStack` (écran d'accueil
  `ConversationListView` + les ~24 routes poussées, y compris les ~20 qui n'avaient
  rien) ET l'overlay `FeedView` (frère du `NavigationStack` dans le même `ZStack`
  racine), puisque `.overlay` s'applique à TOUT le body de `RootView`.
- Vérifié : `router.currentConversationId` (dérivé de `path.last == .conversation`)
  est strictement équivalent à ce que chaque montage local passait — aucune perte
  de précision pour exclure la conversation ouverte de la rotation des frappeurs.

### iPad (`iPadRootView` / `iPadRootView+Panels.swift`)
- Même principe : retirer les 3 montages dupliqués dans `iPadRootView+Panels.swift`.
- Ajouter un montage unique au même niveau que `.modifier(CallPresentationLayer())`
  (`iPadRootView+Sheets.swift`), avec `activeConversationId: { activeConversation?.id }`
  (l'iPad ne route pas la conversation active via `Router.path` — cf. commentaire
  existant sur `Router.currentConversationId`).

### Hors périmètre — inchangé
- `StoryViewerContainer.swift` garde son propre montage de `ConnectionBanner()` : il
  vit dans un `fullScreenCover`, une hiérarchie de vues séparée que le point de
  montage unique ne peut pas atteindre. Il est déjà correctement gated par
  `isStoryViewerPresenting` pour ne jamais doubler avec celui de `RootView`.
- `PiPSourceAnchor` et `CallWaitingBannerView` restent en `.overlay`, inchangés — ils
  ne sont pas concernés par cette demande (ancre invisible pour l'animation PiP
  système ; alerte transitoire de 2ᵉ appel entrant).

## Partie 2 — Bannière d'appel : Y-stacking + aplat couleur

Dans `FloatingCallPillView.body` :
- Le conteneur externe (`pillContent`) perd `.adaptiveGlass(...)`,
  `.clipShape(RoundedRectangle(cornerRadius: 24))`, la bordure glass, et
  `.frame(maxWidth: 560).padding(.horizontal, 10)` (qui la plafonnait et la
  centrait en capsule).
- Nouveau fond : `MeeshyColors.brandGradient` en aplat plein, bord-à-bord
  (`.frame(maxWidth: .infinity)` déjà présent, il suffit de retirer la contrainte
  qui la capsulait).
- Le montage passe de `.overlay(alignment: .top) { FloatingCallPillView(...) .padding(.top, MeeshySpacing.sm) }`
  à `.safeAreaInset(edge: .top, spacing: 0) { FloatingCallPillView(...) }` dans
  `CallPresentationLayer` — le `.padding(.top, MeeshySpacing.sm)` disparaît aussi
  (une bannière bord-à-bord n'a pas besoin de marge, elle EST le bord).
- Le contenu interne (`CallParticipantVisual`, `userInfoSection`, `statusLine`,
  `controlButtons`, `pillStatus`) ne change pas.
- `collapseDragGesture` / `CallBubbleGestureResolver.shouldCollapse` : inchangés.
  Le `.safeAreaInset` n'affecte pas les gestes portés par la vue insérée.
- La condition d'affichage reste identique :
  `callManager.displayMode == .pip && callManager.callState.isActive && !callManager.isSystemPiPActive`
  — quand elle est fausse, le contenu du `.safeAreaInset` doit rendre `EmptyView()`
  (déjà le cas via le `if` du `body`) pour que l'espace réservé retombe à zéro,
  exactement comme `SyncPill` le fait déjà aujourd'hui pour son propre
  `.safeAreaInset` (« The pill collapses to EmptyView automatically »).

## Partie 3 — SyncPill : largeur limitée + défilement du texte long

Nouveau, dans `SyncPill.swift` :
- Une largeur max explicite sur `pillContent` (aujourd'hui absente — la pill
  grandit avec le texte puis tronque uniquement quand elle atteint le bord de
  l'écran).
- Fonction pure et testable (même famille que `SyncPillRotator` /
  `CallBubbleGestureResolver`), par ex. `SyncPillMarquee` :
  - `shouldScroll(textWidth: CGFloat, availableWidth: CGFloat) -> Bool`
  - `scrollDuration(textWidth: CGFloat) -> Double` (vitesse constante, durée
    proportionnelle à la longueur du texte à parcourir)
- Mesure de la largeur réelle du texte via `GeometryReader` en fond du `Text`
  (pattern standard SwiftUI pour ce genre de mesure), comparée à la largeur
  disponible de la pill.
- Si `shouldScroll` : remplace `.lineLimit(1)` par un conteneur masqué
  (`.mask` / `.clipped`) + une animation `Animation.linear(duration:).repeatForever(autoreverses: false)`
  sur l'offset horizontal du texte, cycle pause → glisse à gauche jusqu'à
  disparition → reset à la position de départ → repeat. Respecte
  `accessibilityReduceMotion` (déjà lu ailleurs dans `SyncPill`) : texte statique
  tronqué au lieu du défilement quand Reduce Motion est actif.
- Si `!shouldScroll` : comportement actuel inchangé (`.lineLimit(1)`, pas de
  défilement — le texte tient déjà dans la largeur).

## Tests

- **`SyncPillMarquee`** (nouveau, pur) : `shouldScroll`/`scrollDuration` — tests
  unitaires directs, mêmes conventions que `SyncPillRotatorTests`/
  `SyncPillTimerStateTests`.
- **Points de montage** : changement de composition de vues, pas de logique
  métier nouvelle — vérification par build + parcours manuel de chaque écran
  précédemment troué (réglages, profil, contacts, découverte, favoris, messages
  épinglés, demandes d'amis, écran d'accueil) pour confirmer que le SyncPill y
  apparaît désormais quand une frappe ailleurs est détectée. Pas de test
  automatisé réaliste pour « ce modificateur est appliqué à cet endroit précis
  de l'arbre de vues » dans ce codebase.
- **Bannière d'appel** : logique métier inchangée (déjà couverte par les tests
  existants sur `CallPillStatus`, `CallBubbleGestureResolver`, etc.) — seul le
  style/mécanisme de montage change, vérifié visuellement (simulateur, appel de
  test) : le contenu descend bien sous la bannière, le swipe réduit toujours en
  bulle.
- Régression à surveiller spécifiquement : `ConnectionBannerTypingEntriesTests`
  et les tests iPad de navigation (`iPadRightPanelNavigationGuardTests`) restent
  verts après le déplacement des points de montage.

## Hors périmètre

- `PiPSourceAnchor`, `CallWaitingBannerView` : aucun changement.
- `StoryViewerContainer` : aucun changement (déjà correctement isolé).
- Le contenu/logique métier des deux bannières (statuts d'appel, entrées de
  synchronisation, détection de frappe) : aucun changement, seul le **montage**
  et le **style de conteneur** évoluent.
