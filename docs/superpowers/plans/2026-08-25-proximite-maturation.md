# Proximité — maturation de bout en bout de « À proximité » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le bouton « À proximité » cesse de fermer l'application, et la fonctionnalité tient les CINQ états qu'une feature de proximité doit tenir — autorisation non encore demandée, refusée (dont refusée DÉFINITIVEMENT), autorisée mais sans relevé, aucun résultat, réseau absent. Le RETRAIT des autres boutons du header est séquencé **après**, en tâche 10, avec pour chaque capacité retirée le chemin par lequel elle reste atteignable.

**Architecture:** Ce lot ne crée aucune surface. Il corrige le MONTAGE de la carte (une caméra posée avant que la vue existe), déverrouille un fournisseur de position qui peut se figer pour toute la session, et transforme quatre états déjà NOMMÉS en états SERVIS. La séquence va du plantage (tâche 1-2, qui débloque toute observation) vers la position (3-6), puis vers les données (7-9), puis vers le chrome (10).

**Tech Stack:** SwiftUI + XCTest (app, `./apps/ios/meeshy.sh test`), Swift Testing/XCTest (SDK, scheme `MeeshySDK-Package`), MapKit + CoreLocation. Aucun changement gateway n'est requis par ce lot (§A.6).

**Spec:** spec du 2026-08-02 §4 (« Découverte par proximité »), citée par les doc-comments de `NearbyDiscoveryView.swift` et `NearbyDiscoveryViewModel.swift`. Directive produit du 2026-08-25 : « s'assurer que SEUL le bouton find nearby soit affiché dans la vue des feeds […] le bouton find nearby PLANTE, il faut maturer la feature de bout en bout et ne plus permettre le plantage. »

---

## A. L'état des lieux — mesuré le 2026-08-25 sur `main-local` @ `a7d9b1742`, arbre `v2_meeshy-composer`

> **Mesure par LECTURE SEULE.** Aucun build, aucun test, aucun simulateur : un gate iOS
> occupait l'arbre. Tout ce qui est affirmé ci-dessous est un fait de source, sauf ce qui
> est explicitement marqué INFÉRENCE (§A.2) et ce qui est listé au §F.

### A.1 — Ce que l'utilisateur vit

**Taper « À proximité » dans l'en-tête du feed ferme l'application, avant toute boîte de
dialogue de localisation et avant le moindre appel réseau.**

Ce n'est pas « l'écran s'ouvre vide », ce n'est pas « la position ne marche pas » : l'écran
n'a pas le temps d'exister. La distinction est portante pour la suite — elle situe le
défaut AVANT CoreLocation et AVANT le gateway, donc dans le montage de la carte.

### A.2 — La cause tranchée : une caméra posée sur une carte qui n'a pas encore de taille

Le chemin, de bout en bout :

| # | Site | Ce qui s'y passe |
|---|---|---|
| 1 | `FeedView.swift:706` (iPad) / `RootViewComponents.swift:469` (iPhone) | `router.push(.nearbyDiscovery())` — **sans coordonnée** |
| 2 | `RootView.swift:346` / `iPadRootView+Panels.swift:25` | `NearbyDiscoveryView(initialCoordinate: nil)` |
| 3 | `NearbyDiscoveryViewModel.swift:290` | `@Published var mode: NearbyDiscoveryMode = .density` — le mode par défaut est une CARTE |
| 4 | `NearbyDiscoveryViewModel.swift:355` | `self.center = initialCoordinate` ⇒ `center == nil` |
| 5 | `NearbyDiscoveryView.swift:134-155` | la première évaluation du `body` monte `NearbyDiscoveryMapView(center: nil, radiusKm: 25)` — le `.task { await viewModel.load() }` (`:128`) n'a pas encore tourné |
| 6 | `NearbyDensityOverlay.swift:162` | `makeUIView` crée `MKMapView()` — **`bounds == .zero`**, SwiftUI ne met en page qu'APRÈS |
| 7 | `NearbyDensityOverlay.swift:185` | `context.coordinator.apply(self, to: map, animated: false)` — **depuis `makeUIView`** |
| 8 | `NearbyDensityOverlay.swift:253-254` | `let applied = center ?? Self.worldFallbackCenter` (20, 0) ; `appliedRadius = 4_000` km |
| 9 | `NearbyDensityOverlay.swift:259-265` | `MKCoordinateRegion(center:latitudinalMeters: 8_000_000, longitudinalMeters: 8_000_000)` puis **`map.setRegion(map.regionThatFits(region), animated: false)`** |

**`NearbyDensityOverlay.swift:265` est le SEUL `setRegion` / `regionThatFits` de tout le
dépôt iOS** (`apps/ios` + `packages/MeeshySDK/Sources`, grep vérifié).

Le différentiel qui tranche : `FeedPostsMapView.swift:201-221` — la carte du « premier
bouton map », celle qui **fonctionne** — est le JUMEAU ligne à ligne de ce `makeUIView`
(même `MKMapView()`, même `pointOfInterestFilter`, mêmes deux `register`, même `apply`
appelé depuis `makeUIView`). Une seule chose l'en distingue : **son `apply` ne pose aucune
région**, et son unique cadrage (`showAnnotations`, `:250`) est gardé par
`if !annotations.isEmpty`. Les deux cartes partagent tout sauf ce qui plante.

**INFÉRENCE, à confirmer en une manip.** Que `regionThatFits(_:)` rende des spans `NaN`
sur une vue de `bounds` nul — l'ajustement au ratio d'aspect calcule `0/0` — et que
`setRegion` lève alors `NSInvalidArgumentException: Invalid Region <center:+nan,+nan
span:+nan,+nan>`, est un comportement MapKit connu, **pas une mesure faite ici**.
Confirmation la moins chère, sans rien modifier : point d'arrêt symbolique sur
`-[MKMapView setRegion:animated:]`, lire `self.bounds`. Si `{{0,0},{0,0}}`, acquis.

**Aggravant distinct, même site.** Même avec une frame valide, le repli monde demande
8 000 000 m de côté (~72° de latitude centrés sur 20° ⇒ bord nord vers 56°, et
l'ajustement au ratio d'un écran portrait doit ÉLARGIR encore la latitude, au-delà du
pôle). Et la garde `guard signature != appliedRegionSignature` (`:256`) **empoisonne la
signature** avec la région calculée à vide : même si le premier `setRegion` survivait, la
caméra du repli monde ne serait plus jamais rejouée après la mise en page. Deux correctifs,
deux tâches (1 et 2).

### A.3 — Ce que la lecture EXCLUT

- **`NSLocationWhenInUseUsageDescription` : PRÉSENT.** Vérifié directement, pas repris
  d'un tiers — `apps/ios/Meeshy/Info.plist:71-72`, valeur non vide (« Meeshy uses your
  location to share your current location with contacts and find nearby friends. »).
  Câblage vérifié aussi : `project.yml:151` `INFOPLIST_FILE: Meeshy/Info.plist` sous la
  cible `Meeshy` (`project.yml:142`), et `Meeshy/Info.plist` apparaît dans
  `project.pbxproj`. Les trois autres plists du dépôt (`MeeshyNotificationExtension`,
  `MeeshyShareExtension`, `MeeshyWidgets`) n'en portent aucune clé `NSLocation*` — et n'en
  ont pas besoin : aucune n'ouvre `CLLocationManager`. **Le plantage n°1 des features de
  proximité neuves est écarté.**
- Aucun `!`, `try!`, `as!`, `fatalError`, `precondition` ni indexation non bornée sur le
  chemin de montage.
- Division par zéro : `NearbyDensityPalette.normalized` garde `hottest > 0` (`:337`) ;
  `NearbyDensityCellSize.kilometers` ∈ {1, 10, 100} et `.degrees` ∈ {0.01, 0.1, 1}
  (`NearbyDiscoveryService.swift:50-67`) — jamais 0.
- Décodage plus strict que le fil : `NearbyPost.init(from:)` tolère un `geoPoint` /
  `geoPrecision` illisible ; tout échec retombe sur `apply(failure:)` ⇒ `.serviceUnavailable`.

### A.4 — L'hypothèse gardée en second, et comment la faire tomber

`NearbyMapCoordinator` (`NearbyDensityOverlay.swift:199`) et `NearbyPostAnnotation`
(`:98`) sont deux classes `@MainActor` **implicites**
(`project.yml:28 SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor`, plancher iOS 16) **sans
`deinit` écrite** — la forme exacte que le doc-comment de
`NearbyDiscoveryViewModel.swift:145-152` nomme quarante lignes plus haut, dans la MÊME
feature : « une classe `@MainActor` sans deinit écrite reçoit une deinit ISOLÉE dont le
shim de rétro-déploiement libère deux fois le scope task-local sur iOS < 26 ». Le remède
(`nonisolated` sur le TYPE) est appliqué à `NearbyLocationProvider` (`:156`) et à AUCUNE
des deux classes du fichier jumeau. `NearbyMapCoordinator` est de plus le seul coordinator
de l'app à détenir un `Task` (`recenterTask`, `:218`).

**Pourquoi elle passe SECONDE :** `PostsMapRepresentable.Coordinator`
(`FeedPostsMapView.swift:227`) et `PostMapAnnotation` (`:180`) ont exactement la même
forme et ne plantent pas. La forme seule n'est donc pas le déclencheur, alors que le
`regionThatFits` du §A.2 est, lui, la seule chose qui distingue la carte qui meurt de la
carte qui vit.

**Départage en deux gestes, dans cet ordre :** ouvrir l'écran (si ça meurt à l'ENTRÉE,
avant la boîte de dialogue ⇒ §A.2) ; puis en sortir par « Retour » ou basculer le segment
vers « Liste » (si ça meurt à la SORTIE ⇒ §A.4, pile contenant
`swift_task_deinitOnExecutorMainActorBackDeploy`). La tâche 1 pose **les deux**
correctifs : celui du §A.4 coûte deux mots-clés et fermerait une classe entière de
plantages ; ne pas le poser rendrait la tâche non concluante si le §A.2 ne suffisait pas.

### A.5 — Les quatre états de position, mesurés un par un

| état | nommé ? | servi ? | défaut lu |
|---|---|---|---|
| **non encore demandée** (`.notDetermined`) | ❌ aucun cas de `NearbyEmptyReason` | la boîte système part au premier `load()` (`resolveCenter`, `:583`) | **aucune phrase avant la demande.** L'alerte système s'ouvre par-dessus une mappemonde muette. Un refus par surprise est DÉFINITIF : iOS ne repropose jamais l'alerte |
| **refusée** (`.denied`) | ✅ `.locationDenied` | ✅ deux gestes — « Ouvrir les Réglages » + « Réessayer » (`NearbyDiscoveryView.swift:395`, `:429`), et le repli monde reste manipulable | pas de relève au retour d'avant-plan : **`grep scenePhase` = 0** dans la vue ET dans le ViewModel. Le second bouton la rattrape, mais à la main |
| **refusée DÉFINITIVEMENT** (`.restricted`) | ❌ **replié sur `.locationDenied`** (`:576`, `:598`) | ❌ envoie vers des Réglages où **rien ne peut être changé** (contrôle parental / MDM) | un contrôle sans effet — loi 4 |
| **autorisée mais indisponible** | ✅ `.awaitingLocation` | partiellement | **aucune borne de temps.** Si CoreLocation ne rend ni relevé ni erreur, la continuation n'est jamais reprise (§A.7) |
| **aucun résultat** | ✅ `.noneInRadius` | ✅ **exemplaire** — titre, détail chiffré au rayon, **plus** la phrase qui explique que seules les publications « trouvable à proximité » y figurent (`:459-470`), et un bouton « Élargir le rayon » qui monte au palier suivant (`:400-407`) | rien à corriger ; à PRÉSERVER par un témoin, tâche 9 |
| **réseau absent** | ✅ `.offline` + pastille `feed.nearby.status.offline` | ✅ cache d'abord (`performLoad:483`), `showsIndividualPins` retombe sur les pins quand la densité manque (`:439`) | le cache est indexé sur (lat, lng, rayon) : **sans centre, pas de clé** ⇒ hors ligne + GPS froid ne sert RIEN alors qu'un cache existe (tâche 7) |

### A.6 — Le serveur n'est pas en cause, et il est complet

`GET /posts/nearby` et `GET /posts/nearby/density` existent
(`services/gateway/src/routes/posts/nearby.ts:122`, `:193`), sont enregistrées
(`routes/posts/index.ts:10`), livrées par `440cfcb94e`. Elles exigent un compte
(`preValidation: [requiredAuth]` + rejet explicite si `!authContext.registeredUser`) ⇒ un
visiteur anonyme reçoit 401 et l'écran dit `.signInRequired`. `$geoNear` exige l'index
`Post_geoPoint_2dsphere`, posé à chaque boot par `InitService.ensurePostGeoIndex`
(`InitService.ts:44`). **Aucune tâche gateway dans ce lot** ; deux vérifications
d'exploitation figurent en tâche 11.

### A.7 — Deux défauts de position que la lecture PROUVE, sans exécuter

**(a) Une décision d'autorisation prise pendant la suspension fige l'écran POUR TOUTE LA
SESSION.** `NearbyLocationProvider.currentCoordinate()`
(`NearbyDiscoveryViewModel.swift:194`) lit le statut (`:200-205`) **avant** d'entrer dans
`withCheckedContinuation` (`:207`) — entrer dans la continuation est un point de
suspension. Si l'utilisateur refuse dans cet intervalle :

1. `locationManagerDidChangeAuthorization` (`:240`) voit `.denied`, prend la branche
   `resumeWaiters(with: nil)` (`:253`) — **sur une liste de waiters VIDE** ;
2. le corps de la continuation s'exécute ensuite : il appose le waiter, puis
   `guard shouldRequest, Self.isAuthorized(...)` (`:216`) échoue, et **rien n'est
   demandé** ;
3. la `CheckedContinuation` n'est **jamais** reprise. `resolveCenter` n'en revient pas,
   `performLoad` non plus, `isLoading` reste `true`.

Pire, `isAwaitingFix` a été posé à `true` (`:212`) et n'est remis à `false` que par
`resumeWaiters` (`:238`). **`NearbyLocationProvider.shared` est un singleton** : tout
appel ultérieur, y compris après avoir quitté et rouvert l'écran, entre avec
`shouldRequest == false` et s'ajoute à la file gelée. La proximité est morte jusqu'au
prochain lancement de l'app.

**(b) Aucune borne de temps sur le relevé.** `requestLocation()` finit normalement par
`didFailWithError`, mais aucune des branches ci-dessus ne l'appelle. En intérieur, en mode
avion ou GPS froid, l'écran reste sur « Recherche autour de vous… »
(`statusText`, `NearbyDiscoveryView.swift:296`) sans jamais devenir ni carte, ni carte
d'état vide.

### A.8 — Trois défauts mineurs, lus et non mesurés

- **Double chargement à chaque montage.** `observeNetwork` (`:364`) `sink` sur
  `isOfflinePublisher` et déclenche `load()` sur la valeur courante, PLUS le
  `.task { await viewModel.load() }` de la vue. Le second trouve `isLoading == true` et
  écrit `pendingForceRefresh = (nil ?? false) || false` = **`false`, valeur NON NULLE** ⇒
  la boucle `while let queued` (`:461`) rejoue un `performLoad` complet. Deux allers-retours
  réseau par entrée.
- **`.signInRequired` a un bouton inerte.** `handleEmptyAction` (`:394-397`) mappe
  `.signInRequired` sur `viewModel.refresh()`, qui redemandera la même route et recevra le
  même 401. Le titre promet « Réessayer » ; il ne peut rien réessayer d'utile.
- **`resolveCenter` court-circuite sur `center`** (`:573`). Correct et documenté — mais
  couplé au repli monde du §A.2, un utilisateur qui a déplacé la carte à la main garde ce
  centre : c'est voulu, à ne pas « corriger » par inadvertance en tâche 1.

---

## B. Les lois que ce lot câble

1. **Un écran s'ouvre.** Aucun chemin d'entrée ne peut tuer le processus (tâches 1-2).
2. **Aucun état de position n'est muet.** Les quatre états, plus le réseau absent, ont
   chacun une phrase et un geste qui les lève (tâches 3-7).
3. **Un contrôle existe s'il a un effet** (loi 4 du dépôt) : « Ouvrir les Réglages » sur
   `.restricted` et « Réessayer » sur `.signInRequired` sont aujourd'hui inertes
   (tâches 5, 8).
4. **Un retrait n'est un retrait que si la capacité reste atteignable** (tâche 10).

## Global Constraints

- **Rien n'est retiré du header avant que la tâche 9 soit verte.** Tant que l'écran plante
  ou peut se figer, faire de « À proximité » le SEUL bouton retirerait des capacités
  vivantes au profit d'une capacité morte.
- **`xcodegen generate` avant tout `xcodebuild`** pour chaque fichier de test NEUF, sinon
  il n'est jamais exécuté et le vert est un vert par omission.
- **DerivedData privée** pour tout gate long ; ne jamais lancer `meeshy.sh` en parallèle
  d'un autre gate (`pkill` global).
- **Chaque tâche touche les DEUX hôtes du header quand elle le touche** — `FeedView.swift`
  (iPad) et `RootViewComponents.swift` (iPhone) sont dupliqués ligne à ligne.

---

### Task 1: Taper « À proximité » ouvre une carte, au lieu de fermer l'application

**Cible :** `NearbyDensityOverlay.swift` (`makeUIView` `:162`, `applyRegion` `:245`,
`NearbyMapCoordinator` `:199`, `NearbyPostAnnotation` `:98`).

**Ce qui change :** la région n'est plus posée depuis `makeUIView`. `apply(...)` y est
scindé : `makeUIView` ne fait que ce qui ne dépend pas de la taille (delegate, registers,
gesture, annotations, overlays) ; la caméra est posée depuis `updateUIView`, et seulement
si `map.bounds.width > 0 && map.bounds.height > 0`. `regionThatFits` n'est jamais appelé
sur une vue sans taille. Le repli monde descend à un rayon représentable. Et
`NearbyMapCoordinator` comme `NearbyPostAnnotation` reçoivent `nonisolated` sur le TYPE
(§A.4), avec le doc-comment de `NearbyLocationProvider.swift:145-152` cité en raison.

- [ ] **Step 1: Tests rouges.** Nouveau `NearbyDensityOverlayRegionTests.swift` (XCTest,
      pur MapKit, aucune vue SwiftUI montée) :
  - `test_applyRegion_onAZeroSizedMap_posesNoRegionAtAll` — `MKMapView(frame: .zero)`,
    `applyRegion(center: nil, radiusKm: 25)` ⇒ la région de la carte est INCHANGÉE et
    aucune de ses composantes n'est `NaN` (`XCTAssertFalse(region.span.latitudeDelta.isNaN)`).
    **C'est le témoin du plantage** : aujourd'hui il tue le process au lieu d'échouer.
  - `test_applyRegion_onALaidOutMap_posesTheWorldFallback_whenNoCenter` — carte de
    `bounds` 390×844, `center: nil` ⇒ région posée, centre `(20, 0)`, spans finis et
    `latitudeDelta <= 180`, `longitudeDelta <= 360`.
  - `test_applyRegion_afterAZeroSizedCall_isReplayedOnceTheMapHasSize` — appeler d'abord
    à taille nulle, puis à 390×844 avec les MÊMES arguments ⇒ la seconde pose bien la
    région (la signature n'a pas été empoisonnée par la première). **Témoin de la tâche 2,
    écrit ici parce qu'il partage le montage.**
  - `test_applyRegion_withARealCenter_isNotWidenedToTheWorld` — `center: (48.85, 2.35)`,
    `radiusKm: 25` ⇒ `latitudeDelta < 2`.
  - **Garde de source** `test_theOnlyRegionCall_livesOutsideMakeUIView` — lit
    `NearbyDensityOverlay.swift`, exige que le bloc `func makeUIView` ne contienne ni
    `setRegion` ni `regionThatFits` ni `applyRegion`, et que le fichier porte au moins un
    `bounds.width > 0`. **Garde NÉGATIVE : la rédiger de façon qu'elle ROUGISSE si on
    réintroduit l'interdit**, sinon elle mourra en silence.
  - **Garde de source** `test_theMapCoordinatorAndAnnotation_areNonisolatedTypes` — exige
    `nonisolated final class NearbyMapCoordinator` et
    `nonisolated final class NearbyPostAnnotation`, en citant la raison en commentaire.
- [ ] **Step 2: Rouge.** Le premier test doit faire tomber le bundle, pas échouer
      proprement — le noter dans le journal : c'est la démonstration du plantage.
- [ ] **Step 3: Implémenter.** Scinder `apply` en `applyContent` (appelable depuis
      `makeUIView`) et `applyRegionIfLaidOut` (appelée depuis `updateUIView` seulement) ;
      garde de taille avant tout `regionThatFits` ; `worldFallbackRadiusKm` ramené à une
      valeur représentable en portrait ; `nonisolated` sur les deux types.
- [ ] **Step 4: Vert. Step 5: Commit.**

> **Piège nommé (leçon 275/128 du dépôt) :** la question à poser à ce correctif n'est pas
> seulement « la région est-elle bonne ? » mais **« qu'est-ce qui part À CÔTÉ d'elle
> depuis `makeUIView` ? »**. Répondre en relisant `makeUIView` ligne à ligne : les deux
> `register`, le `UITapGestureRecognizer` et `coordinator.map = map` ne dépendent d'aucune
> taille et RESTENT ; seule la caméra bouge.

---

### Task 2: La carte du repli monde se recadre une fois qu'elle a une taille

**Cible :** `NearbyDensityOverlay.swift:256` (`guard signature != appliedRegionSignature`).

**Ce qui change :** la signature n'est mémorisée que lorsqu'une région a RÉELLEMENT été
posée. Une tentative refusée faute de taille ne laisse aucune trace, si bien que le premier
`updateUIView` après mise en page la rejoue.

- [ ] **Step 1: Tests rouges.**
  - `test_regionSignature_isNotRecordedWhenNoRegionWasPosed` — appel à taille nulle, puis
    à taille valide avec les mêmes arguments ⇒ la carte reçoit la région (déjà couvert au
    Step 1 de la tâche 1 ; ici on assert sur l'état INTERNE via le comportement observable :
    la région de `map` change).
  - `test_regionSignature_stillGuardsAgainstReplayOnEveryFrame` — trois `apply` successifs
    à taille valide et arguments identiques ⇒ **une seule** pose (témoin par
    `regionDidChangeAnimated` compté, ou par la garde de source ci-dessous). **Ce test est
    le contre-poids** : sans lui, « corriger » la signature rendrait la carte impossible à
    déplacer à la main, ce que le doc-comment `:240-244` interdit explicitement.
  - `test_userDrag_afterAWorldFallback_stillReachesOnRecenter` — poser le repli monde,
    simuler un déplacement significatif ⇒ `onRecenter` appelé une fois après le débounce.
- [ ] **Step 2: Rouge. Step 3: Implémenter.** Déplacer l'écriture de
      `appliedRegionSignature` / `appliedCenter` / `appliedRadiusKm` APRÈS le `setRegion`
      effectif. **Step 4: Vert. Step 5: Commit.**

---

### Task 3: Une permission tranchée pendant que l'écran regarde ailleurs ne fige plus l'application pour toute la session

**Cible :** `NearbyDiscoveryViewModel.swift:194-253` (`NearbyLocationProvider`).

**Ce qui change :** l'enregistrement du waiter et la lecture du statut deviennent
INDIVISIBLES — le corps de la continuation, sous le même verrou, relit le statut et décide :
autorisé ⇒ `requestLocation()` ; refusé ⇒ reprendre immédiatement avec `nil` ;
non tranché ⇒ attendre le delegate. Et `isAwaitingFix` est remis à `false` sur **tout**
chemin qui ne demande rien.

- [ ] **Step 1: Tests rouges.** Nouveau `NearbyLocationProviderTests.swift`, avec un double
      de `CLLocationManager` injecté (le provider prend aujourd'hui son manager en dur :
      **extraire un protocole `NearbyLocationManaging` au-dessus du `CLLocationManager`
      réel** — c'est la condition pour que ces quatre cas soient testables, et c'est la
      couche que les 35 tests existants n'ont jamais exercée) :
  - `test_currentCoordinate_whenTheDecisionLandsBeforeTheWaiterIsRegistered_stillReturns` —
    le double bascule en `.denied` et notifie le delegate ENTRE la lecture de statut et
    l'enregistrement du waiter ⇒ l'`await` rend `nil` **en temps borné**. Aujourd'hui il ne
    rend jamais.
  - `test_currentCoordinate_afterADroppedDecision_isNotPoisonedForTheNextCall` — rejouer
    le cas ci-dessus, puis un second `currentCoordinate()` avec autorisation accordée ⇒ un
    `requestLocation()` est bien émis et la coordonnée revient. **C'est le test qui décrit
    le symptôme le plus coûteux : la proximité morte jusqu'au relancement de l'app.**
  - `test_currentCoordinate_whenGrantedAtThePrompt_requestsExactlyOneFix` — l'octroi arrive
    par le delegate ⇒ **un seul** `requestLocation()` (deux concurrents font rendre
    `kCLErrorLocationUnknown` par CoreLocation, piège que le picker a déjà payé —
    doc-comment `:213-215`).
  - `test_currentCoordinate_twoConcurrentCallers_bothResumeExactlyOnce` — deux `await`
    simultanés, un seul relevé ⇒ deux reprises, aucune double reprise (une
    `CheckedContinuation` reprise deux fois est un trap).
- [ ] **Step 2: Rouge. Step 3: Implémenter.** Protocole `NearbyLocationManaging` +
      injection ; relecture du statut SOUS le verrou ; `isAwaitingFix = false` sur toute
      sortie sans requête. **Step 4: Vert. Step 5: Commit.**

---

### Task 4: Avant de demander la position, l'écran dit pourquoi il la demande

**Cible :** `NearbyEmptyReason` (nouveau cas), `NearbyDiscoveryViewModel.resolveCenter`
(`:572`), `NearbyDiscoveryView.handleEmptyAction` (`:391`) et `NearbyEmptyStateCard`
(`:417`).

**Ce qui change :** en `.notDetermined`, l'écran ne déclenche plus l'alerte système au
premier `load()`. Il pose `emptyReason = .locationNotAskedYet`, dont le bouton est
l'unique déclencheur de `requestAuthorization()`. **Un refus par surprise est définitif :
iOS ne repropose jamais l'alerte** — l'utilisateur doit savoir ce qu'il accepte avant que
la boîte s'ouvre.

- [ ] **Step 1: Tests rouges.**
  - `test_load_whenAuthorizationWasNeverAsked_doesNotOpenTheSystemPromptOnItsOwn` — double
    en `.notDetermined` ⇒ `requestAuthorization` **jamais** appelé, `emptyReason ==
    .locationNotAskedYet`, `isColdStart == false`.
  - `test_theNotAskedCard_namesWhatItWillDoWithTheLocation` — garde de contenu : le détail
    de la carte mentionne le rayon et le fait que rien n'est publié. Clés de catalogue
    NEUVES ⇒ **les 7 langues** (garde catalogue du dépôt).
  - `test_tappingTheNotAskedAction_isTheOnlyThingThatOpensThePrompt` — le geste appelle
    `requestAuthorization` exactement une fois, puis enchaîne sur `load()`.
  - `test_load_whenEnteredFromAPlaceBadge_neverShowsTheNotAskedCard` — l'entrée « Voir près
    d'ici » porte une coordonnée : `resolveCenter` court-circuite sur `center` (`:573`),
    aucune permission n'est en jeu. **Ce test protège l'invariant existant**
    (`test_load_whenInitialCoordinateProvided_neverRequestsLocationPermission`, `:358`) contre
    ce lot.
  - `test_theNotAskedCard_stillLetsTheUserDragTheMapInstead` — le repli monde reste
    manipulable et un déplacement pose un centre sans aucune permission.
- [ ] **Step 2: Rouge. Step 3: Implémenter. Step 4: Vert. Step 5: Commit.**

---

### Task 5: Un refus qu'on ne peut pas défaire ne renvoie plus vers des Réglages qui n'y peuvent rien

**Cible :** `resolveCenter` (`:576`), `reasonForMissingFix` (`:598`),
`handleEmptyAction` (`:391`), `NearbyEmptyStateCard`.

**Ce qui change :** `.restricted` cesse d'être replié sur `.denied`. Il reçoit son propre
cas `.locationRestricted`, dont le geste principal n'est PAS « Ouvrir les Réglages »
(inopérant sous contrôle parental / MDM) mais « Déplacer la carte » — le seul chemin qui
marche. Et `.locationDenied` se relève tout seul au retour d'avant-plan.

- [ ] **Step 1: Tests rouges.**
  - `test_load_whenAuthorizationIsRestricted_doesNotOfferSettings` — statut `.restricted`
    ⇒ `emptyReason == .locationRestricted`, et `MediaPermissionCoordinator.openSettings`
    **jamais** appelé (double injecté). **Témoin de la loi 4 : un contrôle sans effet.**
  - `test_load_whenAuthorizationIsDenied_stillOffersSettingsAndRetry` — non-régression du
    comportement actuel (`:157`), qui est bon.
  - `test_returningFromSettingsWithPermissionGranted_reloadsWithoutAnyGesture` — passer le
    double de `.denied` à `.authorizedWhenInUse` puis notifier le retour d'avant-plan ⇒ un
    `load()` part seul. (Aujourd'hui `grep scenePhase` = 0 ; le bouton « Réessayer »
    existe et RESTE — il couvre le cas où le retour ne se relève pas.)
  - `test_returningFromSettingsStillDenied_doesNotLoopOnItself` — le retour ne relance pas
    en boucle si rien n'a changé.
  - Clés de catalogue neuves ⇒ **7 langues**.
- [ ] **Step 2: Rouge. Step 3: Implémenter.** Observer le retour d'avant-plan au niveau du
      ViewModel (pas un `.onChange` brut dans la vue — règle du dépôt), via l'abstraction de
      scène déjà utilisée ailleurs. **Step 4: Vert. Step 5: Commit.**

---

### Task 6: Autorisée mais introuvable — un relevé qui ne vient pas se borne dans le temps et se dit

**Cible :** `NearbyLocationProvider.currentCoordinate()` (`:194`) et le libellé
`.awaitingLocation`.

**Ce qui change :** l'attente d'un relevé est bornée. Au-delà, la continuation est reprise
avec `nil`, `isAwaitingFix` retombe, et l'écran affiche `.awaitingLocation` — « Aucun
relevé pour l'instant. Réessayez, ou déplacez la carte » (le texte existe déjà, `:346`, et
il est bon).

- [ ] **Step 1: Tests rouges.**
  - `test_currentCoordinate_whenNoFixEverArrives_givesUpWithinTheBudget` — double autorisé
    qui n'émet **ni** `didUpdateLocations` **ni** `didFailWithError` (intérieur, mode
    avion, GPS froid) ⇒ l'`await` rend `nil` dans le budget, horloge injectée.
  - `test_currentCoordinate_whenTheFixArrivesJustBeforeTheDeadline_isNotDiscarded` — le
    relevé gagne la course ⇒ coordonnée servie, aucune reprise double.
  - `test_load_afterAGiveUp_showsAwaitingLocationNotNoneInRadius` — la raison servie est
    `.awaitingLocation`, **jamais** `.noneInRadius` : envoyer élargir un rayon quand il
    manque une position est exactement la confusion que l'énumération existe pour éviter
    (doc-comment `apply(failure:)`).
  - `test_load_afterAGiveUp_theProviderIsReusableImmediately` — un second essai part
    normalement (jumeau du test de dépoisonnement de la tâche 3, sur l'autre chemin).
  - `test_statusPill_stopsSayingSearching_onceTheAttemptHasEnded` — la pastille
    « Recherche autour de vous… » (`:296`, adossée à `isColdStart`) s'éteint.
- [ ] **Step 2: Rouge. Step 3: Implémenter. Step 4: Vert. Step 5: Commit.**

---

### Task 7: Hors ligne, l'écran repart du dernier point connu au lieu de n'avoir rien à montrer

**Cible :** `NearbyDiscoveryViewModel` (`resolveCenter` `:572`, `performLoad` `:465`) +
une persistance minimale du dernier centre résolu.

**Ce qui change :** le dernier centre résolu est retenu entre deux entrées. Hors ligne avec
un GPS froid, il fournit la clé de cache qui manquait, et l'écran sert ses dernières
publications connues sous la pastille « Hors ligne — dernières données connues » (`:283`)
au lieu d'un état vide. Le principe Instant App du dépôt : le hors-ligne est un BANDEAU,
pas un état vide, tant qu'il reste quelque chose à montrer.

- [ ] **Step 1: Tests rouges.**
  - `test_load_offlineWithNoFixButAKnownLastCenter_servesTheCacheAndFlagsOffline` — cœur
    de la tâche.
  - `test_load_offlineWithNoFixAndNoKnownCenter_stillNamesTheRightReason` — première
    utilisation hors ligne ⇒ `.awaitingLocation` ou `.offline` selon le statut, **jamais**
    `.noneInRadius`.
  - `test_theLastCenter_isNotAnAnchor_andYieldsToAFreshFix` — dès qu'un relevé arrive, il
    gagne ; le centre retenu est une GRAINE (même règle que `initialCoordinate`,
    doc-comment `:566-571`) — un point de DÉPART, jamais une ancre.
  - `test_theLastCenter_isNotWrittenWhenTheCenterCameFromAPlaceBadge` — arbitrage à
    écrire : « Voir près d'ici » ne doit pas devenir le domicile permanent de l'écran.
  - `test_offlineDensityAbsence_stillShowsPins` — non-régression de `showsIndividualPins`
    (`:439`), la densité n'étant pas persistée.
- [ ] **Step 2: Rouge. Step 3: Implémenter. Step 4: Vert. Step 5: Commit.**

---

### Task 8: « Connexion requise » mène à la connexion

**Cible :** `NearbyDiscoveryView.handleEmptyAction` (`:394-397`) et le libellé de
`.signInRequired`.

**Ce qui change :** un visiteur anonyme reçoit 401 des deux routes (`nearby.ts:127`,
`:198`). Son bouton dit « Réessayer » et redemande la même route pour recevoir le même 401 :
un contrôle sans effet. Il doit ouvrir la connexion.

- [ ] **Step 1: Tests rouges.**
  - `test_theSignInRequiredAction_opensSignIn_notARetry` — le geste route vers la connexion
    et **n'appelle pas** `refresh()`.
  - `test_theSignInRequiredAction_isLabelledForWhatItDoes` — le libellé cesse d'être
    « Réessayer » ; clé neuve ⇒ **7 langues**.
  - `test_afterSigningIn_theScreenLoadsWithoutLeavingIt` — au retour, un `load()` part.
  - `test_theOtherRetryReasons_keepTheirRetry` — `.awaitingLocation`, `.offline`,
    `.serviceUnavailable` gardent « Réessayer » : celui-là, lui, a un effet.
- [ ] **Step 2: Rouge. Step 3: Implémenter. Step 4: Vert. Step 5: Commit.**

---

### Task 9: Une entrée dans l'écran ne coûte plus deux chargements réseau — et l'écran vide qui EXPLIQUE est verrouillé

**Cible :** `load(forceRefresh:)` (`:448-463`), `observeNetwork` (`:364`).

**Ce qui change :** `pendingForceRefresh` cesse d'être « rejoué » par une demande NON
forcée qui n'apportait rien (`(nil ?? false) || false` = `false`, valeur non nulle qui
passe le `while let`). Une demande simple arrivée pendant un chargement est absorbée ; une
demande FORCÉE reste rejouée — c'est le défaut que la mécanique existe pour corriger
(doc-comment `:441-447`), et il ne doit pas revenir.

- [ ] **Step 1: Tests rouges.**
  - `test_mountingTheScreen_performsExactlyOneNetworkLoad` — `observeNetwork` + `.task`
    concourent ⇒ **un** appel `nearby`, **un** appel `density`.
  - `test_aForcedRefreshDuringALoad_isStillReplayed` — non-régression stricte de
    `test_setRadius_whileALoadIsInFlight_isReplayedInsteadOfDropped` (`:468`).
  - `test_aPlainLoadDuringALoad_isAbsorbed` — le nouveau comportement, énoncé.
  - `test_setRadiusDuringALoad_stillLandsOnTheRadiusTheChipShows` — l'invariant PRODUIT
    derrière la mécanique : la barre de rayon ne peut pas afficher 100 km sur des données
    de 25.
  - **Témoin de préservation** `test_theNoneInRadiusCard_stillExplainsWhyItIsEmpty` — la
    phrase « Seules les publications dont l'auteur a activé "trouvable à proximité"
    apparaissent ici » (`:461-468`) est la meilleure chose de cet écran ; ce lot la
    déplace de « présente » à « verrouillée ».
- [ ] **Step 2: Rouge. Step 3: Implémenter. Step 4: Vert. Step 5: Commit.**

---

### Task 10: Le header du feed ne garde que ce que le produit demande — et rien de retiré ne devient inatteignable

> **STOP : cette tâche ne démarre que si les tâches 1 à 9 sont vertes.** Faire de
> « À proximité » le contrôle principal pendant qu'il plante convertirait un défaut en
> impasse.

**Cible :** `feedHeaderActions` dans `FeedView.swift:651-718` **et**
`RootViewComponents.swift:420-480` — les deux hôtes, dupliqués ligne à ligne ; plus
`FeedPostsMapSourceGuardTests.swift`, dont trois tests décrivent l'ordre actuel et
ROUGIRONT.

**Inventaire opposable — pour chaque bouton, ce qu'il fait et où sa capacité survit :**

| bouton | id a11y | capacité | après retrait, atteignable par |
|---|---|---|---|
| `nearbyButton` | `feed.header.nearby` | découverte par proximité | **CONSERVÉ** (directive) |
| `postsMapButton` | `feed.header.map` | carte des posts géolocalisés **DU FEED COURANT** (`FeedPostsMapView`, pins locaux, aucun réseau) | **CONSERVÉ** (directive : « le premier bouton map ») — et il le faut : `FeedPostsMapView(` n'a **aucun autre site d'appel** dans `apps/ios/Meeshy/`. Le retirer rendrait cette carte inatteignable |
| `reelsButton` | `feed.header.reels` | `ReelsPresenter.shared.presentFresh()` — lecture Réels **fraîche, sans graine** | **à trancher.** Seul autre site de `presentFresh()` : l'appui LONG sur le bouton flottant « Feed » (`RootView.swift:2043-2057`), qui (a) n'existe **que sur iPhone** — `iPadRootView` ne monte aucun `draggableFloatingButtons` — et (b) est jugé insuffisant par son propre commentaire (« un appui long n'est pas découvrable et ne peut pas être le seul accès à une section entière »). **Le retirer laisse l'iPad sans AUCUN accès aux Réels frais.** Des Réels INDIVIDUELS restent atteignables (carte Réel du fil, grille de profil `ProfileUserPostsList.swift:527`, favoris `BookmarksView.swift:169`) — pas la lecture fraîche |

**Ce lot ne retire donc PAS `reelsButton` de sa propre autorité.** Il prépare le retrait et
en expose le coût ; la décision est en §Questions ouvertes, Q2.

- [ ] **Step 1: Tests rouges — la garde AVANT le geste.**
  - `test_feedHeader_carriesNearbyDiscoveryEntryPoint` — existant (`:116`), doit rester
    vert sur les DEUX fichiers.
  - `test_feedHeader_carriesPostsMapEntryPoint` — existant (`:25`), idem.
  - `test_theHeaderActions_areIdenticalAcrossBothHosts` — **garde neuve** : la liste
    ordonnée des identifiants a11y de `feedHeaderActions` est la MÊME dans `FeedView.swift`
    et `RootViewComponents.swift`. Elle attrape la divergence que ce lot risque
    mécaniquement, et que ces deux fichiers ont déjà payée.
  - **Si et seulement si Q2 tranche pour le retrait :** réécrire
    `test_theMapButtonSitsToTheRightOfTheReelsButton` (`:54`) — **jamais la supprimer** —
    en exigeant l'ordre neuf, et ajouter
    `test_freshReels_remainReachableOnEveryIdiom`, qui exige un point d'entrée aux Réels
    frais atteignable **sur iPad**. Tant que ce test ne peut pas être écrit, le retrait
    n'est pas un retrait : c'est une perte.
- [ ] **Step 2: Rouge. Step 3: Implémenter** (les deux hôtes, dans le même commit).
      **Step 4: Vert. Step 5: Commit.**

---

### Task 11: Gate final + vérifications d'exploitation

- [ ] `xcodegen generate`, puis vérifier dans le delta `project.pbxproj` que les **trois**
      fichiers de test neufs (`NearbyDensityOverlayRegionTests`,
      `NearbyLocationProviderTests`, et les cas ajoutés à `NearbyDiscoveryViewModelTests`)
      y apparaissent. **Greffer le delta contre `origin/main`, jamais committer un pbxproj
      régénéré en entier** — il emporterait le WIP des lots voisins.
- [ ] `./apps/ios/meeshy.sh test` COMPLET, DerivedData privée, aucun autre gate en cours.
      Comparer le COMPTE de tests au log CI de `main` : un compte stable prouve l'absence
      de régression sans bisect.
- [ ] Les quatre gardes iOS du dépôt : catalogue 7 langues (clés neuves des tâches 4, 5, 8),
      clés mortes, Focal, RTL.
- [ ] **Manip de confirmation du §A.2**, à faire une fois le lot vert, pour boucler le
      diagnostic : lancer, taper `feed.header.nearby` ⇒ l'écran s'ouvre ; en sortir par
      « Retour » ⇒ pas de `swift_task_deinitOnExecutorMainActorBackDeploy` (§A.4).
- [ ] **Exploitation, sans toucher au client** — vérifier que le gateway déployé porte bien
      les deux routes ET l'index géospatial :
      `curl -H 'Authorization: Bearer <jwt>' 'https://gate.meeshy.me/api/v1/posts/nearby?lat=48.85&lng=2.35&radiusKm=25&cursor=0&limit=30'`
      ⇒ **200 avec `data: []`** = route vivante, index en place, base sans contenu
      découvrable (le cas NOMINAL : aucune rétro-indexation de `geoPoint`, §A.6) ;
      **500** = `Post_geoPoint_2dsphere` absent ; **401** = jeton non rattaché à un compte
      enregistré. Idem sur `/posts/nearby/density?…&cellSizeKm=10`.

---

## C. Ordre contraint

1-2 d'abord : tant que l'écran meurt, aucun autre état n'est observable. 3 avant 4, 5 et 6 :
les trois s'appuient sur le protocole `NearbyLocationManaging` que la tâche 3 extrait.
7 après 6 (le dernier centre n'a de sens qu'une fois l'attente bornée). 8 et 9 sont
indépendantes. **10 après 9, sans exception.** 11 en dernier.

## D. Les pièges du dépôt, appliqués ici

- **Une garde NÉGATIVE meurt en silence.** Les deux gardes de source de la tâche 1
  interdisent quelque chose ; les écrire de façon qu'elles ROUGISSENT si on réintroduit
  l'interdit, et le vérifier à la main une fois.
- **Un fichier de test NEUF n'est jamais exécuté sans `xcodegen generate`** — 29/30 verts
  et le trentième n'existe pas.
- **`preferredLanguages` et tout tableau construit en ligne** changent d'identité à chaque
  rendu : ne pas en faire une dépendance d'effet dans les cartes d'état vide.
- **Deux hôtes jumeaux** : toute touche au header va dans les deux fichiers, même commit.
- **Une `CheckedContinuation` reprise deux fois est un trap** : les tâches 3 et 6 touchent
  toutes deux `resumeWaiters` — le test de double reprise est la garde partagée.
- **Ne pas retirer d'effet visuel** : le repli monde manipulable, la pastille de statut et
  les deux gestes de `.locationDenied` sont des acquis, pas du bruit.

## E. Ce que ce lot NE fait PAS — dit une fois, opposable

- Aucun changement gateway (§A.6) — les deux routes sont complètes et correctes.
- Aucune rétro-indexation de `Post.geoPoint` : la spec l'exclut, et c'est pourquoi
  `.noneInRadius` est le cas NORMAL au démarrage de la fonctionnalité. La phrase qui
  l'explique est verrouillée en tâche 9, pas remplacée.
- **Aucun « mode recherche » n'est construit sur la carte** : il n'existe pas aujourd'hui
  (§F, Q1), et sa forme est une décision produit non tranchée.
- Aucun retrait de `reelsButton` sans réponse à Q2.
- Aucune touche aux asymétries iPad/iPhone préexistantes (bannière « nouveaux posts » et
  état d'erreur/Réessayer présents dans `FeedView` seul) : réelles, hors sujet.

## F. Ce qui n'a PAS été vérifié pour écrire ce plan

- **Rien n'a été exécuté.** Aucun build, aucun test, aucun simulateur : un gate iOS
  occupait l'arbre. La cause du §A.2 est tranchée par différentiel de source, et son
  dernier maillon MapKit (`regionThatFits` sur `bounds` nul ⇒ spans `NaN`) reste une
  INFÉRENCE ; la manip qui la ferme est en tâche 11.
- **Le journal de crash n'a pas été lu.** C'est lui qui départagerait en une image entre
  exception Objective-C (§A.2) et trap du runtime Swift (§A.4). La tâche 1 pose les deux
  correctifs pour cette raison.
- **Le « mode recherche sur la map » de la directive n'existe nulle part.**
  `FeedPostsMapView.swift` ne contient ni `TextField`, ni `magnifyingglass`, ni
  `MKLocalSearch` : c'est un affichage passif des posts DÉJÀ chargés du feed. Le seul
  écran du dépôt qui porte une vraie recherche de lieu est `LocationPickerView.swift`, et
  il est câblé au COMPOSEUR (8 sites), jamais au header du feed. Les trois « modes »
  existants (`density` / `pins` / `list`) appartiennent à l'écran de PROXIMITÉ, pas à la
  carte. Rien dans ce plan ne construit ce mode.
- **Le gateway a été lu, jamais exercé.** L'image déployée en production n'a pas été
  vérifiée (tâche 11).
- **Le comptage de tests iOS de référence** (celui du log CI de `main`) n'a pas été relevé.

---

## G. Questions ouvertes — que la directive ne tranche pas

**Q1 — « Le bouton carte » et « find nearby » doivent-ils rester DEUX contrôles, ou le
mode recherche est-il un ÉTAT de l'écran de proximité ?**
La directive dit « SEUL le bouton find nearby » puis « dans la vue il existe un mode
recherche sur la map affiché par le premier bouton map » — deux phrases qui décrivent
soit deux contrôles, soit un seul avec un état. Les faits, pour éclairer sans trancher :
les deux boutons sont adjacents (8 pt) dans le même `HStack`, ce qui les fait lire comme
une seule zone « carte » ; ils ouvrent deux écrans architecturalement DISJOINTS (fichiers,
ViewModels, permissions séparés — `FeedPostsMapView` ne demande aucune autorisation et ne
fait aucun appel réseau) ; et l'écran de proximité porte déjà un sélecteur à trois modes
qui accueillerait naturellement un quatrième. Fusionner supprimerait un bouton et
donnerait à la recherche un centre et un rayon qu'elle n'a pas ; garder deux contrôles
préserve une carte instantanée et hors ligne que la proximité ne remplace pas.
**C'est le produit qui le dira. Ce plan n'a rien construit dans un sens ni dans l'autre.**

**Q2 — `reelsButton` part-il, et si oui, par où passent les Réels frais sur iPad ?**
Le retirer laisse l'iPad **sans aucun** accès à `presentFresh()` (tâche 10). Trois issues :
le garder ; le retirer et ouvrir un autre point d'entrée iPad ; le retirer et assumer que
l'appui long iPhone suffit — ce que son propre commentaire de code conteste.

**Q3 — Un visiteur anonyme doit-il voir le bouton « À proximité » ?**
Les deux routes exigent un compte : sans réponse, il tape un bouton pour obtenir « Connexion
requise ». Masquer le bouton, ou en faire une invitation à s'inscrire ?

**Q4 — L'entrée par-poste « Voir près d'ici » reste-t-elle ?**
La directive ne la mentionne pas ; la garde de source l'exige aujourd'hui
(`test_postLocationBadge_offersTheSeeNearbyAction`). Elle est le seul chemin qui n'a besoin
d'AUCUNE permission — argument pour la garder, décision produit quand même.

**Q5 — Quel budget d'attente pour un relevé (tâche 6) ?**
Trop court, un GPS froid en extérieur échoue à tort ; trop long, l'intérieur fige l'écran.
Le produit fixe la seconde ; le test l'assert avec une horloge injectée.
