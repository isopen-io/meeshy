# Traçage exhaustif — Points de compatibilité iOS de l'app Meeshy

**Date** : 2026-05-30
**Cible de déploiement** : iOS 16.0 (app `Meeshy`, `MeeshyNotificationExtension`, `MeeshyTests`, `MeeshySDK`, `MeeshyUI`) — `MeeshyWidgets` reste à iOS 17.0 (décision Session 5).
**Référence chantier** : `tasks/ios16-support-2026-05-18.md` (sessions 1→5 faites ; 6→7 = QA/résidus, en cours).

> **Méthode de ce traçage** : balayage exhaustif des 768 fichiers Swift (`apps/ios/Meeshy` + `packages/MeeshySDK/Sources` + extensions), ~60 patterns d'API iOS 16.1/16.4/17/18, croisé avec chaque garde `#available`/`@available` et chaque wrapper de `Compatibility/`. Vérifié : config (`project.yml`, `pbxproj`, `Package.swift` ×2), cibles extensions, planchers de dépendances.

---

## 0. TL;DR — état de la compatibilité

| Volet | État |
|---|---|
| **Surface d'API iOS 17/18 dans le code SwiftUI/MapKit/UIKit** | ✅ **100 % gardée** — aucune API non protégée. Le compilateur en cible 16.0 le garantit. |
| **Couche `Compatibility/`** | ✅ Complète et cohérente (7 familles de wrappers). |
| **Résidus fonctionnels iOS 16 (non-crash)** | ⚠️ 3 points de **dégradation de comportement** (cf. §4). |
| **Crash au lancement iOS 16 reporté** | ❌ **Hors périmètre `/Compatibility`** — défaillance `dyld` pré-`main` (cf. §5). |

**Règle d'or rappelée** : en cible de déploiement 16.0, le compilateur **refuse** toute API non gardée. Donc si l'app **compile**, aucun crash ne peut venir d'une API iOS 17 manquante. Le crash reporté (« lance sur 16 → plante, sur 26 → OK, aucun log ») est un échec de **chargement dyld**, pas un problème de `Compatibility/`.

---

## 1. La couche `Compatibility/` (source de vérité)

Emplacement unique : `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/` — partagée par l'app et le SDK (extensions `View` publiques).

| Fichier | Wrapper exposé | API iOS 17/16.4 encapsulée | Fallback iOS 16 |
|---|---|---|---|
| `Platform.swift` | `Platform.isIOS17OrLater` / `isIOS18OrLater` | — (flags **logique** uniquement) | n/a |
| `AdaptiveOnChange.swift` | `adaptiveOnChange(of:initial:_:)` | `onChange(of:initial:_:)` (2-params, 17) | `LegacyOnChangeModifier` (suit la valeur précédente en `@State`) |
| `AdaptiveContentUnavailableView.swift` | `AdaptiveContentUnavailableView` | `ContentUnavailableView` (17) | clone `VStack` fidèle |
| `AdaptiveMap.swift` | `AdaptiveInteractiveMap`, `MapTarget` | `Map(position:)`, `MapCameraPosition`, `mapControls`, `onMapCameraChange` (17) | `Map(coordinateRegion:)` (déprécié, 16) |
| `AdaptivePagingScroll.swift` | `AdaptiveHorizontalPager`, `adaptiveCarouselScrollTransition` | `scrollTargetBehavior`, `scrollPosition`, `scrollTargetLayout`, `containerRelativeFrame`, `scrollTransition` (17) | `TabView(.page)` ; transition = no-op |
| `AdaptiveSymbolEffects.swift` | `adaptiveSymbolBounce`, `adaptiveSymbolPulse`, `adaptiveSymbolReplace` | `symbolEffect`, `contentTransition(.symbolEffect)` (17) | no-op / `opacity+scale+.id` |
| `AdaptivePresentationStyle.swift` | `StoryTimelinePresentationStyle` | `presentationBackground` / `presentationContentInteraction` / `presentationCornerRadius` (16.4) | sheet native par défaut |

**Wrappers hors dossier** `Compatibility/` (à connaître, même rôle) :
- `apps/ios/Meeshy/Features/Main/Views/MessageContextOverlay.swift:21` → `withAnimationCompletion(...)` : `withAnimation(_:completionCriteria:)` (17) ; fallback `Task.sleep` aligné sur la durée nominale.
- `apps/ios/Meeshy/Core/DeviceLayout.swift:38` → `adaptivePresentationDetents(...)` : `presentationDetents` (16.0, garde superflue mais inoffensive).
- `apps/ios/Meeshy/Features/Main/Views/VideoLegacySupport.swift:26` → `OrientationManager.lockPortrait` : `requestGeometryUpdate(.iOS(...))` (16.0) gardé.

---

## 2. Tracé des sites `#available` / `@available` (12 sites iOS 17, tous gardés)

| Fichier:ligne | API débloquée | Garde |
|---|---|---|
| `Compatibility/AdaptiveOnChange.swift:22` | `onChange(of:initial:_:)` | `if #available(iOS 17, *)` |
| `Compatibility/AdaptiveContentUnavailableView.swift:22` | `ContentUnavailableView` | idem |
| `Compatibility/AdaptiveSymbolEffects.swift:17,28,49` | `symbolEffect` / `contentTransition(.symbolEffect)` | idem |
| `Compatibility/AdaptivePagingScroll.swift:50,95` | stack scroll-paging 17 | idem |
| `Compatibility/AdaptiveMap.swift:81` | `Map(position:)` & co. | `@available(iOS 17)` sur `ModernInteractiveMap` |
| `Location/LocationFullscreenView.swift:48` (struct `FullscreenMapView17` `@available(iOS 17)`) | `Map(position:)`, `mapStyle` | split 17/16 |
| `Location/LocationMessageView.swift:56` (struct `LocationMapView17` `@available(iOS 17)`) | `Map(position:)` | split 17/16 |
| `Views/MessageContextOverlay.swift:28` | `withAnimation(completionCriteria:)` | `if #available(iOS 17, *)` |

Sites `#available(iOS 16.4)` (tous gardés) :
- `Compatibility/AdaptivePresentationStyle.swift:14` (presentation*).
- `packages/MeeshySDK/Sources/MeeshyUI/Story/DrawingOverlayView.swift:~278` → `PKEraserTool(.bitmap, width:)` (16.4) vs `PKEraserTool(.bitmap)` (16.0).

Sites `#available(iOS 16.0 / 15.0)` (planchers, inoffensifs) :
- `Core/DeviceLayout.swift:40`, `Views/VideoLegacySupport.swift:26`, `Story/Canvas/Layers/StoryBackgroundLayer.swift:661,668` (`asset.loadTracks` async 16 vs `asset.tracks` 15), `Views/StoryViewerView+Content.swift:35`.

---

## 3. APIs iOS 16.0+ employées librement (vérifiées safe, **pas** de garde requise)

Pièges fréquents tranchés une fois pour toutes :

| API | ×sites | Verdict |
|---|---|---|
| `.contentTransition(.numericText())` | 15 | **iOS 16.0** (`numericText(countsDown:)`). ⚠️ Ne PAS le garder iOS 17 — c'était un faux positif d'audit. |
| `presentationDetents([...])` | nombreux | iOS 16.0 |
| `NavigationStack` / `navigationDestination` | partout | iOS 16.0 |
| `PhotosPicker`, `PhotosPickerItem`, `loadTransferable`, `Transferable` | 62 / 13 | iOS 16.0 |
| `ShareLink` | — | iOS 16.0 |
| `.searchable` | 7 | iOS 15.0 |
| `.scrollContentBackground(.hidden)` | 10 | iOS 16.0 |
| `.scrollDismissesKeyboard(.interactively)` | 7 | iOS 16.0 |
| `.draggable` / `.dropDestination` | `Story/Controls/ComposerToolPanelHost.swift` | iOS 16.0 |
| `ViewThatFits`, `Grid`, `AnyLayout`, `Gauge` | — | iOS 16.0 |
| `Text.bold()` / `Font.bold()` | 4 | iOS 13 / 16.0 |
| `String(localized:defaultValue:bundle:)` | centaines | iOS 16.0 |
| String Catalogs (`.xcstrings`) | `Localizable.xcstrings`, `InfoPlist.xcstrings`, `Resources` SDK | runtime iOS 12+ (compilés au build) |
| `onChange(of:) { v in }` (1-param) | 11 | iOS 14-16 (déprécié, OK) — aucun usage de la forme zéro-param iOS 17 |

**APIs iOS 17/18 confirmées NON utilisées** : `PhaseAnimator`, `KeyframeAnimator`, `sensoryFeedback`, `visualEffect`, `geometryGroup`, `inspector`, `@Observable`/`@Bindable` (migrés `ObservableObject` Session 2), `TextRenderer`, `MeshGradient`, `onScrollGeometryChange/PhaseChange`, `registerForTraitChanges`, `traitOverrides`, scroll APIs 17 hors wrapper.

---

## 4. Résidus de **comportement** iOS 16 (non-crash, à corriger)

> Ces points ne plantent pas mais dégradent l'UX sur iOS 16. À router par `/Compatibility`.

| # | Fichier:ligne | Problème iOS 16 | Sévérité | Fix proposé |
|---|---|---|---|---|
| R1 | `Location/LocationFullscreenView.swift:216-228` (`FullscreenMapView16`) | `Map(coordinateRegion: .constant(region))` → binding **constant** : la caméra ne suit pas le pan/zoom utilisateur. Et `isHybrid` est reçu mais jamais appliqué (`.mapStyle` est 17+) → le bouton hybride/standard du header est silencieusement inopérant. | WRONG-BEHAVIOR | Passer `region` en `@State` (modèle de `LegacyInteractiveMap` dans `AdaptiveMap.swift`). Pour l'hybride : désactiver/masquer le toggle sur iOS 16 via `Platform.isIOS17OrLater`, ou documenter. |
| R2 | `Compatibility/AdaptivePagingScroll.swift:61-69` | Le fallback `TabView(.page)` **instancie toutes les pages** (pas de lazy-loading comme `LazyHStack`). | PERF (borné) | Acceptable pour les sets média bornés ; documenter le plafond. Si galeries larges → envisager pagination manuelle. |
| R3 | `Compatibility/AdaptiveMap.swift` (LegacyInteractiveMap) | iOS 16 : `onMapCameraChange(.onEnd)` remplacé par `onChange` région → se déclenche **en continu** pendant le pan ; pas de `MapCompass`. | WRONG-BEHAVIOR (absorbé par le debounce 300 ms du `LocationPickerModel`) | OK en l'état ; garder le debounce côté appelant. |

Note R-bis : `AdaptiveOnChange.LegacyOnChangeModifier` — edge-case théorique si `onChange` précède `onAppear` (SwiftUI garantit l'ordre inverse en pratique). Durcissement optionnel : flag `hasInitialized`.

---

## 5. Le crash au lancement iOS 16 (**hors `/Compatibility`**) — diagnostic

**Symptôme** : crash immédiat au lancement, **aucun log**, **iOS 16 uniquement** (iOS 26 OK).

**Conclusion** : ce n'est pas un bug d'API SwiftUI (sinon : ne compilerait pas, OU crasherait à l'affichage d'un écran — pas avant `main()`). C'est une **terminaison `dyld` pré-`main`** : iOS 16 refuse de *charger* le binaire.

### Causes possibles (à départager par la ligne `dyld`)
1. **Runtime Swift 6.2 « Approachable Concurrency »** — features activées dans `apps/ios/Package.swift`, `packages/MeeshySDK/Package.swift` **et** `apps/ios/project.yml` :
   - `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (SE-0466)
   - `enableUpcomingFeature("NonisolatedNonsendingByDefault")` (SE-0461)
   - `enableUpcomingFeature("InferIsolatedConformances")` (SE-0470)
   - `SWIFT_APPROACHABLE_CONCURRENCY = YES`

   Compilé avec Xcode 26, le binaire peut référencer des symboles du runtime Swift présents dans iOS 26 mais **absents du runtime Swift embarqué dans iOS 16** → `dyld: Symbol not found: _$ss…`.
2. **`.xcframework` prébuilt avec `minos` > 16** — suspect : `stasel/WebRTC` exact **146.0.0** (le `Package.swift` déclare `.iOS(.v10)` mais le `minos` du binaire Mach-O peut différer), ou un binaire Firebase. → `dyld: Library not loaded … built for newer iOS`.

### Récupérer la ligne décisive (« aucun log » est une fausse impression)
- **Sim iOS 16 depuis Xcode** : la console Xcode imprime la raison dyld.
- **Device** : *Xcode ▸ Window ▸ Devices & Simulators ▸ View Device Logs* → rapport avec `Termination Reason: DYLD`.

Patterns attendus :
```
Termination Reason: DYLD, [0x1] Library missing
  Library not loaded: @rpath/WebRTC.framework/WebRTC   → cause #2
  …building for iOS X which is newer than 16…          → cause #2
  Symbol not found: _$ss…concurrency…                  → cause #1
```

### Test A/B réversible (isole la cause #1 sans casser la compilation)
Retirer **uniquement** SE-0461 (le retirer recompile sans erreur d'isolation, contrairement à SE-0466) :
- `apps/ios/project.yml` : supprimer `SWIFT_UPCOMING_FEATURE_NONISOLATED_NONSENDING_BY_DEFAULT: "YES"` + `enableUpcomingFeature("NonisolatedNonsendingByDefault")` dans les 2 `Package.swift` → `xcodegen generate` → rebuild sim 16.
- Crash disparaît → runtime concurrence (fix propre : back-deployment / gestion par cible). Persiste → cause #2, la ligne dyld nomme le framework.

> ⚠️ Ne PAS retirer `defaultIsolation(MainActor)` (SE-0466) à l'aveugle : tout le code UI suppose l'isolation MainActor par défaut en mode Swift 6 → **casse la compilation**.

---

## 6. Garde-fous (empêcher la régression)

1. **Règle de lint CI** : interdire `#available(iOS 17` / `@available(iOS 17` **hors** de `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/` et des 3 wrappers app référencés (§1). Toute nouvelle API 17 doit passer par un wrapper adaptatif.
2. **Matrice de QA** : `meeshy.sh build && meeshy.sh test` sur simulateurs **16 / 17 / 26** avant tout merge touchant l'UI.
3. **Veille `numericText`** : `.contentTransition(.numericText())` reste libre (16.0) — ne jamais le « corriger » en le gardant 17.
4. **Plancher dépendances** : à chaque bump d'un `.xcframework` (WebRTC, Firebase), vérifier le `minos` du binaire (`vtool -show` / `otool -l | grep -A4 LC_BUILD_VERSION`) ≤ 16.0.

---

## Annexe — Périmètre vérifié
- `apps/ios/Meeshy/` (347 .swift), `packages/MeeshySDK/Sources/` (421 .swift), `MeeshyNotificationExtension` (cible 16.0, propre).
- Config : `project.yml` (16.0 sauf widgets), `pbxproj` (8/10 configs 16.0, 2 widgets 17.0), `apps/ios/Package.swift` & `packages/MeeshySDK/Package.swift` (`.iOS(.v16)`).
- Dépendances résolues compatibles 16 : Firebase 12.12.1, WebRTC 146.0.0 (à re-vérifier au niveau binaire), Socket.IO 16.1.1, GRDB 6.29.3, Starscream 4.0.8.
