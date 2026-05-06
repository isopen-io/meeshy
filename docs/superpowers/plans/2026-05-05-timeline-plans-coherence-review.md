# Story Timeline Editor — Coherence Review of 4 TDD Plans

**Reviewer:** Senior Tech Lead (Claude)
**Date:** 2026-05-06
**Scope:** Cross-plan coherence audit, NOT a content review of each task individually.
**Source of truth:** `docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md` (1522 lines)

---

## 0. Synthèse exécutive

| Item | Valeur |
|------|--------|
| **Score de cohérence** | **5.5 / 10** |
| **Verdict global** | **BLOQUÉ — fixes obligatoires avant exécution** |
| Incohérences HIGH | 6 |
| Incohérences MEDIUM | 7 |
| Incohérences LOW | 8 |
| Lacunes de couverture | 3 |
| Fixes appliqués inline | 3 (documentaires uniquement) |

**Raison du blocage** : Plan 4 a été écrit en supposant des constructeurs et noms de paramètres qui ne correspondent NI au modèle existant `StoryMediaObject`/`StoryAudioPlayerObject` du SDK, NI aux signatures que Plan 1 livre pour `MoveClipCommand`/`SplitClipCommand`/`AddKeyframeCommand`. Plan 4 introduit aussi un protocole `TimelineEngineProviding` que Plan 3 ne fait pas implémenter par `StoryTimelineEngine`. Sans correction, le wiring final dans `StoryComposerViewModel` (Task 37) refusera de compiler.

---

## 1. Inventaire des types publics

### 1.1 Types définis (qui les définit)

| Type | Plan définition | Notes |
|------|----------------|-------|
| `StoryEasing` | Plan 1 (Task 1) | enum, `apply(_:)` method |
| `StoryTransitionKind` | Plan 1 (Task 2) | enum |
| `StoryClipTransition` | Plan 1 (Task 3) | struct |
| `StoryKeyframe` | Plan 1 (Task 4) | struct (note : `time` est `var` chez Plan 1 vs `let` au spec — **OK** car nécessaire pour `MoveKeyframeCommand`) |
| `TimelineProject` | Plan 1 (Task 9) | struct snapshot |
| `EditCommand` (protocol) | Plan 1 (Task 10) | |
| `EditCommandError` | Plan 1 (Task 10) | enum |
| `TimelineClipKind` | Plan 1 (Task 11) | enum (`.video`, `.audio`, `.image`, `.text`) |
| `AddClipCommand` | Plan 1 (Task 12) | |
| `DeleteClipCommand` | Plan 1 (Task 13) | |
| `MoveClipCommand` | Plan 1 (Task 14) | |
| `TrimClipCommand` | Plan 1 (Task 15) | |
| `SplitClipCommand` | Plan 1 (Task 16) | |
| `AddTransitionCommand` / `RemoveTransitionCommand` | Plan 1 (Task 17) | |
| `ChangeTransitionCommand` | Plan 1 (Task 18) | |
| `AddKeyframeCommand` / `MoveKeyframeCommand` / `DeleteKeyframeCommand` | Plan 1 (Task 19) | |
| `SetClipPropertyCommand` | Plan 1 (Task 20) | |
| `AnyEditCommand` | Plan 1 (Task 21) | discriminated enum |
| `SnapCandidate` / `SnapResult` | Plan 2 (Task 1) | structs |
| `SnapEngine` | Plan 2 (Task 2) | struct |
| `Lerpable` | Plan 2 (Task 10–11) | protocol + conformances `Float`/`CGFloat`/`CGPoint`/`CGSize` |
| `KeyframeInterpolator` | Plan 2 (Task 12+) | enum (namespace) |
| `CommandStackSnapshot` | Plan 2 (Task 18) | struct Codable |
| `CommandStack` | Plan 2 (Task 19+) | final class |
| `TimelineMediaSource` | Plan 3 (A1) | struct + factory |
| `TimelineMediaSourceError` | Plan 3 (A3) | enum |
| `VideoCompositor` | Plan 3 (B1) | struct |
| `DissolveVideoCompositor` | Plan 3 (B6) | NSObject (AVVideoCompositing) |
| `AudioMixerProviding` (protocol) | Plan 3 (C1) | |
| `AudioMixer` | Plan 3 (C1) | final class |
| `MockAudioMixer` | Plan 3 (C6) | test helper |
| `StoryTimelineEngineError` / `StoryTimelineExportError` / `StoryTimelineExportPreset` | Plan 3 (D1) | |
| `StoryTimelineEngine` | Plan 3 (D1) | `@MainActor final class`. Mode enum nested (`Mode.preview` / `Mode.editing`) |
| `ReaderTransitionResolver` / `ReaderKeyframeResolver` | Plan 3 (E1, E2) | enums (namespaces) |
| `RemoteFeatureFlagProviding` / `NullRemoteFeatureFlagProvider` | Plan 4 (Task 3) | |
| `StoryTimelineFeatureFlag` | Plan 4 (Task 3) | struct |
| `TimelineMode` | Plan 4 (Task 5) | enum |
| `ClipSelectionState` | Plan 4 (Task 6) | struct |
| `TimelineEngineMode` | Plan 4 (Task 7) | enum (parallèle de `StoryTimelineEngine.Mode`) |
| `TimelineEngineProviding` (protocol) | **Plan 4** (Task 7) | **DEVRAIT être Plan 3** ou conformance ajoutée |
| `TimelineViewModel` | Plan 4 (Task 7) | `@Observable @MainActor` |
| `TimelineGeometry` | Plan 4 (Task 16) | struct |
| Toutes les vues SwiftUI (`TrackBarView`, `VideoClipBar`, `AudioClipBar`, `TextClipBar`, `TransitionBadge`, `RulerView`, `PlayheadView`, `SnapGuideView`, `DurationHandle`, `KeyframeMarkerView`, `ClipInspector`, `KeyframeInspector`, `TransitionInspector`, `TransportBar`, `TimelineToolbar`, `QuickTimelineView`, `ProTimelineView`, `TimelineContainerSwitcher`) | Plan 4 (Tasks 17–35) | |
| `InspectorPresentation` | Plan 4 (Task 27) | enum (`.sheet` / `.popover`) |

### 1.2 Aucun doublon de définition détecté

Plan 2 réimporte Plan 1 sans le redéfinir. Plan 3 réimporte Plan 1 + Plan 2. Plan 4 réimporte tout — sauf qu'il *définit* `TimelineEngineProviding` comme un protocole local au lieu de le tirer de Plan 2/3 (cf. §3 incohérence #1).

### 1.3 Cible packages cohérente

| Plan | Source path | Test path |
|------|-------------|-----------|
| Plan 1 | `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` | `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift` |
| Plan 2 | `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/` | `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/` |
| Plan 3 | `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/` | `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Engine/` |
| Plan 4 | `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/{Container,Track,Overlay,Inspector,Controls,ViewModel}/` | `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/{Views,ViewModel,Integration}/` |

Cette répartition est cohérente. Plan 1 cible `MeeshySDK` (modèles), les autres `MeeshyUI`. Le Package.swift actuel expose bien deux libs `MeeshySDK` + `MeeshyUI`, et `MeeshyUI` dépend de `MeeshySDK`. ✓

---

## 2. Incohérences trouvées

### HIGH-1 — `TimelineEngineProviding` : Plan 3's `StoryTimelineEngine` ne conforme pas au protocole (BLOQUANT compilation)

**Severity:** HIGH — bloque l'exécution finale (StoryComposerViewModel.timelineViewModel ne compilera pas).

**Files:**
- Plan 3, ligne 1904 : `public final class StoryTimelineEngine` (pas de conformance)
- Plan 4, ligne 970 : `public protocol TimelineEngineProviding: AnyObject { … }`
- Plan 4, ligne 6010 : `let engine = StoryTimelineEngine() ; let vm = TimelineViewModel(engine: engine, …)` — paramètre `engine: TimelineEngineProviding`

**Détail :**
- Plan 3 ne mentionne JAMAIS `TimelineEngineProviding`, qui est défini exclusivement par Plan 4.
- Plan 4 définit aussi un enum séparé `TimelineEngineMode` avec `.editing` / `.preview`, alors que `StoryTimelineEngine.setMode(_ newMode: Mode)` utilise une enum nested `Mode` du même nom de cas.
- Sans extension de conformance, `StoryTimelineEngine` ne peut pas être passé là où `TimelineEngineProviding` est attendu.

**Fix recommandé :** Ajouter dans Plan 4 (ou en pré-requis de Plan 4 Task 36/37) une **extension d'adapter** :

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine+Providing.swift
extension StoryTimelineEngine: TimelineEngineProviding {
    public func setMode(_ mode: TimelineEngineMode) {
        switch mode {
        case .editing: setMode(.editing)
        case .preview: setMode(.preview)
        }
    }
}
```

Plus simple alternative : faire que Plan 4 réexporte `StoryTimelineEngine.Mode` au lieu de définir `TimelineEngineMode` ; mais cela force `TimelineViewModel` (donc Plan 4) à dépendre directement du concret de Plan 3, ce qui casse la testability — donc l'adapter est meilleur.

---

### HIGH-2 — `MoveClipCommand` : Plan 4 utilise les mauvais labels de paramètres

**Severity:** HIGH — appel ne compilera pas.

**Files:**
- Plan 1, ligne 1623–1628 : `init(clipId:, kind: TimelineClipKind, oldStartTime:, newStartTime:)`
- Plan 4, ligne 1218–1222 : `MoveClipCommand(clipId: drag.clipId, fromStartTime: drag.originalStartTime, toStartTime: drag.currentStartTime)`

**Différences :**
- `fromStartTime:` vs `oldStartTime:` (label différent)
- `toStartTime:` vs `newStartTime:` (label différent)
- Manque `kind: TimelineClipKind` (le param `kind` est obligatoire dans Plan 1 — pas de défaut)

**Fix recommandé :** Corriger Plan 4 Task 9 pour passer `kind:` (à dériver de l'objet drag — `clipKind(forId:)` à ajouter) et utiliser les vrais labels.

---

### HIGH-3 — `SplitClipCommand` : Plan 4 utilise une signature inexistante

**Severity:** HIGH.

**Files:**
- Plan 1, ligne 1924–1930 : `init(clipId:, kind: TimelineClipKind, splitAtRelativeTime: Float, leftId: String, rightId: String)`
- Plan 4, ligne 1448 : `SplitClipCommand(clipId: id, atTime: currentTime)` — invalide

**Fix recommandé :** Plan 4 Task 11 doit dériver `kind:` du clip sélectionné, calculer `splitAtRelativeTime = currentTime - clipStartTime`, et générer deux UUIDs (`leftId`, `rightId`). C'est une refonte non triviale de la task.

---

### HIGH-4 — `AddKeyframeCommand` : Plan 4 utilise `targetClipId` au lieu de `clipId` + manque `kind:`

**Severity:** HIGH.

**Files:**
- Plan 1, ligne 2528–2532 : `init(clipId:, kind: TimelineClipKind, keyframe:)`
- Plan 4, ligne 1606 : `AddKeyframeCommand(targetClipId: id, keyframe: kf)` — invalide

**Fix recommandé :** corriger en `AddKeyframeCommand(clipId: id, kind: clipKind(forId: id), keyframe: kf)` dans Plan 4 Task 13.

---

### HIGH-5 — `StoryMediaObject` : Plan 4 utilise un init et un champ inexistants (`url:`, `displayDuration`)

**Severity:** HIGH — bloquera factory + ~10 tests Plan 4.

**Files (Plan 4) :**
- Lignes 824, 838, 841 (TimelineProjectFactory.swift) : `StoryMediaObject(id: clipId, kind: .video, url: "file:///tmp/\(clipId).mp4")`
- Lignes 826, 840, 843, 1423, 6339, 6518, 7282, 7289, 7325, 7463, 7672 : `media.displayDuration = X` ou lecture de `.displayDuration`
- Lignes 6340, 6521, 7294 : `StoryAudioPlayerObject(id: "x", url: "file:///tmp/...m4a")`
- Lignes 5624, 5638, 6045, 6048 : lecture de `media.url` / `audio.url`

**Réalité actuelle du SDK** (`packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`) :
- `StoryMediaObject` : pas de paramètre `url:` dans aucun init, le champ s'appelle `duration: Float?` (NON `displayDuration`).
- `StoryAudioPlayerObject` : pas de `url:`, le champ s'appelle aussi `duration: Float?`.
- Seul `StoryTextObject` a `displayDuration: Float?`.
- Aucun de ces types n'expose une propriété `url` — l'URL est résolue ailleurs (via `mediaURLs: [String: URL]` paramètre de `StoryTimelineEngine.configure`).

**Impact sur Plan 1** : Plan 1 lui-même utilise `displayDuration` à tort dans son `SplitClipCommand` lignes 1978, 1981, 1985, 2027 — MAIS uniquement pour `textObjects` (ce qui est correct car `StoryTextObject.displayDuration` existe). Le code branche `mediaObjects` utilise bien `.duration`. **Plan 1 est cohérent.**

**Fix recommandé Plan 4 :**
1. Remplacer toutes les ctor `StoryMediaObject(id:, kind:, url:)` par `StoryMediaObject(id:, postMediaId: id, kind: .video)` (le postMediaId est requis).
2. Remplacer toutes les `media.displayDuration = X` par `media.duration = X`.
3. Remplacer toutes les `audio.displayDuration = X` par `audio.duration = X`.
4. Remplacer toutes les lectures `.url` par une consultation du dictionnaire `mediaURLs[obj.id]`.
5. Pour les TextObject, garder `displayDuration` (cohérent avec le SDK).

C'est un balayage non trivial à appliquer dans Plan 4 (~25 lignes). À documenter en pré-requis avant exécution.

---

### HIGH-6 — Conventions de commit messages divergentes dans Plan 4

**Severity:** HIGH (produit hétérogène, viole une règle utilisateur explicite).

Plan 4 mélange **5 préfixes différents** :
- `feat(timeline-ui):` — annoncé en intro
- `feat(timeline):` (~25 occurrences, lignes 310, 626, 785, 1087, 1146, 1278, 1398, 1469, 1548, 1627, 1695, 1782, 1900, 2065, 2330, 2515, 2673, 2823, 2984, 3125, etc.)
- `feat(composer):` (Task 37)
- `chore(timeline):` (quelques tasks)
- `i18n(timeline):` (Task 4, ligne 540)

**Plan 1** est cohérent : `feat(sdk):` / `fix(sdk):` / `test(sdk):` ✓
**Plan 2** est cohérent : `feat(timeline-logic):` / `test(timeline-logic):` ✓
**Plan 3** est cohérent : `feat(timeline-engine):` / `test(timeline-engine):` / `feat(reader):` ✓ (le préfixe `feat(reader):` pour les sections E est défendable, c'est un ajout au reader existant).

**Fix recommandé :** Standardiser Plan 4 sur `feat(timeline-ui):` / `test(timeline-ui):` / `i18n(timeline-ui):` — le ` -ui` discrimine bien Plan 4 vs Plan 2/3 dans le `git log`. Tasks `feat(composer):` (#37) restent acceptables car la modification touche le composer pré-existant.

---

### MEDIUM-1 — Plan 4 task 36 : extension non-testée pour `StoryTimelineEngine: TimelineEngineProviding`

Lié à HIGH-1. Plan 4 Task 37 ligne 6010 instancie un `StoryTimelineEngine` mais aucune task n'écrit l'extension d'adapter ni un test pour la conformance.

**Fix recommandé :** Insérer une nouvelle task entre Task 36 et Task 37 : "Add `StoryTimelineEngine+Providing.swift` extension + test that `StoryTimelineEngine` conforms to `TimelineEngineProviding`".

---

### MEDIUM-2 — `KeyframeInterpolator` signature : Plan 3 fait un misuse de `.map` sur Optional

Pas une incohérence cross-plan stricto sensu mais un bug Plan 3 qui empêchera la compilation :

**Plan 3 ligne 3028 :** `frames.compactMap { $0.x.map { (time: $0, value: $1, easing: .linear) } }`

`Optional<CGFloat>.map` prend un closure à 1 argument. `($0, $1, ...)` suppose deux args → ne compilera pas.

**Fix recommandé :** réécrire en :
```swift
let xs: [(time: Float, value: CGFloat, easing: StoryEasing)] = frames.compactMap { kf in
    kf.x.map { (time: kf.time, value: $0, easing: kf.easing ?? .linear) }
}
```

Et harmoniser sur `kf.easing ?? .linear` au lieu de toujours `.linear` (le spec stipule l'easing par-keyframe).

---

### MEDIUM-3 — `TimelineEngineMode` enum dupliqué (`StoryTimelineEngine.Mode` vs Plan 4 `TimelineEngineMode`)

Voir HIGH-1. La duplication est volontaire (testability seam) mais doit être documentée par une extension de bridging. Sans cela, Plan 4 Task 14 (`switchToProMode`) appellera `engine.setMode(.editing)` avec un type différent du `Mode` interne de Plan 3.

---

### MEDIUM-4 — Snapshot tests Plan 4 ne couvrent PAS Dynamic Type variants

Spec §7.13 (lignes 977-980) : "Test manuel : tester avec 'Larger Text' max activé". Snapshot tests Plan 4 (Tasks 39–45) couvrent uniquement light + dark — pas de variantes Dynamic Type ni Reduced Motion automatisées.

**Fix recommandé :** Ajouter dans Task 38 (SnapshotHelpers) une fonction `traits(dynamicType: ContentSizeCategory = .large, reducedMotion: Bool = false)` et générer au moins une variante `accessibilityXXL` pour les composants texte (`TrackBarView`, `ClipInspector`, `RulerView`).

---

### MEDIUM-5 — Plan 4 ne couvre pas les raccourcis clavier (spec §7.9)

Spec §7.9 énumère 11 raccourcis (`⌘Z`, `Space`, etc.). Plan 4 ne mentionne JAMAIS `UIKeyCommand` ou `.keyboardShortcut`.

**Lacune** : si raccourcis clavier sont scope MVP (vérifier — pas explicite dans spec §1 Goals), les ajouter à TransportBar / TimelineToolbar. Sinon, documenter explicitement comme **out-of-scope V1** dans Plan 4 §intro.

---

### MEDIUM-6 — Plan 4 "Hand-off" déclare `TimelineEngineProviding` comme provenant de Plan 2

Plan 4 ligne 7803 : "| Engine protocol | `TimelineEngineProviding` | Plan 2 |"
Mais Plan 4 le définit lui-même (ligne 970) ; Plan 2 ne le mentionne pas du tout. C'est une erreur d'attribution dans la doc — résolution : soit déplacer la définition dans Plan 2/3, soit corriger le tableau hand-off pour dire "Plan 4".

---

### MEDIUM-7 — `KeyframeInterpolator.interpolate` : signature confirmée mais le param easing par-keyframe est ignoré dans Plan 3

Plan 2 livre `interpolate<T: Lerpable>(keyframes: [(time:Float, value:T, easing:StoryEasing)], at:)`.
Plan 3 (ReaderKeyframeResolver) hardcode `easing: .linear` au lieu de utiliser `kf.easing`.

Cohérent avec le spec ? Spec §2.1 dit "easing depuis ce keyframe vers le suivant ; nil = .linear" → Plan 3 force `.linear` même quand le keyframe stocke un easing différent. **Bug fonctionnel non bloquant pour V1 (le launch n'expose que `.linear`)** mais à documenter en TODO.

---

### LOW-1 — Plan 4 Task 4 utilise `i18n(timeline):` au lieu de `feat(timeline-ui):`

Voir HIGH-6.

---

### LOW-2 — Plan 4 mock test des `setMode(.editing)` utilise la mauvaise enum

Plan 4 ligne 902 : `func setMode(_ mode: TimelineEngineMode)` dans `MockStoryTimelineEngine`.
Test caller doit passer `TimelineEngineMode.editing` (Plan 4) — pas `StoryTimelineEngine.Mode.editing` (Plan 3).
Ce point est interne à Plan 4 ; il devient critique seulement quand l'engine concret est wiré (Task 37) — couvert par HIGH-1.

---

### LOW-3 — Plan 1 uses `var time` for StoryKeyframe instead of `let` in spec

Spec §2.1 ligne 331 : `public let time: Float`. Plan 1 ligne 459 : `public var time: Float`.

C'est une déviation **justifiée et nécessaire** car `MoveKeyframeCommand` (Plan 1 Task 19) doit muter `time`. Le spec sera donc corrigé implicitement par le code livré. À documenter dans Plan 1 (déjà mentionné en commentaire ailleurs ?). 

**Action recommandée** : ajouter une note dans Plan 1 Task 4 step 4.3 pour expliquer la déviation par rapport au spec.

---

### LOW-4 — `MeeshyAnalytics` mentions absent des plans

Spec §11.1 énumère des évènements analytics (`timeline.opened`, `timeline.commandUndone`, etc.). Aucun plan ne les implémente. Acceptable pour V1 si scope analytics est différé — sinon à intégrer dans Plan 4.

---

### LOW-5 — Plan 3 Section E (Reader) utilise `mediaType: "video"` (raw string) au lieu du convenience init `kind: .video`

**Plan 3 ligne 3093 :** `StoryMediaObject(id: "a", postMediaId: "pa", mediaType: "video", placement: "media", startTime: 0, duration: 5)`

Cohérent avec le SDK (les deux init existent), mais incohérent stylistiquement avec Plan 4 qui (à tort) tente d'utiliser `kind: .video, url:`. À harmoniser quand HIGH-5 sera fixé : tous les plans devraient utiliser `kind:` convenience init quand l'URL n'est pas pertinente, ou `mediaType: "..."` raw quand on veut tester la rétro-compat.

---

### LOW-6 — `StoryAudioPlayerObject` constructor : Plan 1 ligne 3261 utilise `(id:, postMediaId:, placement:, volume:, waveformSamples:, startTime:, duration:)`

Cohérent avec le SDK ✓. Plan 4 (cf. HIGH-5) doit s'aligner.

---

### LOW-7 — Plan 3 Task A1 imports : `import MeeshySDK` correct, `import AVFoundation` ✓

Pas d'incohérence.

---

### LOW-8 — Plan 4 Task 1 (snapshot dependency) : ajout de swift-snapshot-testing

Pas mentionné dans Plan 1/2/3. Plan 4 Task 1 ligne 65 : "Ajouter swift-snapshot-testing au Package.swift". C'est **un changement partagé** au `Package.swift` : si Plans 1/2/3 sont mergés AVANT Plan 4 et que Plan 4 modifie le Package.swift, **conflit de merge** quasi garanti.

**Fix recommandé :** Ajouter cette dépendance dans Plan 1 Task 0 (pré-flight) ou en commit séparé hors-plan, AVANT le démarrage parallèle.

---

## 3. Lacunes de couverture

| Section spec | Couverture plans | Verdict |
|--------------|------------------|---------|
| §1 Architecture | Couvert par toutes les arborescences | ✓ |
| §2 Modèles | Plan 1 complet | ✓ |
| §3 Engine | Plan 3 complet | ✓ |
| §4 Logic | Plan 2 complet | ✓ |
| §5 Quick Mode | Plan 4 (Tasks 32–33) | ✓ |
| §6 Pro Mode | Plan 4 (Task 34) | ✓ |
| §7.1–7.8 Gestes clip/transition/keyframe/playhead/ruler | Plan 4 (Tasks 17–26) | ✓ |
| **§7.9 Raccourcis clavier** | **Aucune task** | ✗ Lacune (LOW si différé) |
| §7.10 Haptics | Implicite via `HapticFeedback` mentionné | ⚠ pas de test explicite |
| §7.11 Animations | `pressable()`, springs mentionnés | ✓ |
| §7.12 Conflits gestes | Mentionné Plan 4 mais peu de tests | ⚠ |
| §7.13 Accessibilité | `accessibilityLabel/Hint` ✓, **Dynamic Type variants** ✗, Reduced Motion partiel | ⚠ MEDIUM-4 |
| §7.14 i18n (~70 clés annexe H) | Plan 4 Task 4 — 70 clés listées ✓ | ✓ |
| §8.1–8.6 Tests | Coverage globale OK | ✓ |
| §8.7 Tests manuels | Hors-scope plans (manuels) | n/a |
| §9 Migration | Plan 4 Task 3 (feature flag) + Task 36 (wire-up) ✓ | ✓ |
| §10 Risques techniques | **Mitigations cap audio nodes 6 ✓** (Plan 3 C2), retry asset 1× ✓ (D8), eviction non-visible ✗ pas re-testé | ⚠ |
| §11 Métriques succès | Performance harness Plan 3 F1–F3 ✓ ; analytics ✗ (LOW-4) | ⚠ |
| Annexe G Mapping ancien→nouveau | Pas formalisé dans plans | ✓ acceptable |
| Annexe H i18n keys | Plan 4 Task 4 ✓ | ✓ |
| Annexe I Palette indigo | Plan 4 utilise `MeeshyColors.indigo*` partout | ✓ |

**3 lacunes formelles :** raccourcis clavier (§7.9), Dynamic Type snapshots (§7.13), analytics events (§11.1).

---

## 4. Fixes appliqués inline

**3 fixes documentaires triviaux appliqués** (les incohérences structurelles HIGH/MEDIUM nécessitent réécriture de tasks et sont laissées à l'humain).

1. ✓ **Plan 4 lignes 7796-7811 (table "Hand-off names")** : corrigé l'attribution erronée des types. `TimelineProject`, `StoryClipTransition`, etc. sont attribués à Plan 1 (et non "Plan 0" qui n'existe pas) ; `SnapEngine`/`CommandStack` à Plan 2 (et non Plan 1) ; `TimelineEngineProviding`/`TimelineEngineMode`/`StoryTimelineEngine` reflètent désormais leurs vraies origines avec mention explicite du besoin d'extension d'adapter (HIGH-1).
2. ✓ **Plan 4 ligne 540 (Task 4 commit)** : `i18n(timeline):` → `feat(timeline-ui):` pour aligner sur la convention dominante du Plan 4.
3. ✓ **Plan 1 Task 4 (StoryKeyframe.time docstring)** : ajouté une note explicite documentant la déviation `var time: Float` vs spec `let time: Float`, justifiée par `MoveKeyframeCommand`.

**Fixes structurels NON appliqués (laissés à l'humain) — voir §5 :**
- HIGH-1 : ajout de l'extension `StoryTimelineEngine: TimelineEngineProviding` (~30 lignes, nouveau fichier).
- HIGH-2/3/4 : réécriture des Tasks 9, 11, 13 de Plan 4 pour signatures de commandes correctes.
- HIGH-5 : balayage Plan 4 pour `displayDuration` → `duration`, retrait `url:`, retrait `.url` (~25 occurrences).
- HIGH-6 : standardisation des préfixes commit Plan 4 (~30 occurrences).

---

## 5. Recommandations — top 5 actions AVANT exécution

### 5.1 [BLOQUANT] Réécrire les Tasks 9, 11, 13 de Plan 4 pour corriger les signatures de commandes
- Task 9 : `MoveClipCommand` → ajouter `kind:`, renommer `fromStartTime/toStartTime` en `oldStartTime/newStartTime`.
- Task 11 : `SplitClipCommand` → ajouter `kind:`, calculer `splitAtRelativeTime`, générer `leftId`/`rightId`.
- Task 13 : `AddKeyframeCommand` → renommer `targetClipId:` en `clipId:`, ajouter `kind:`.
- Introduire un helper privé `private func clipKind(forId id: String) -> TimelineClipKind?` dans `TimelineViewModel`.

### 5.2 [BLOQUANT] Ajouter une Task 36.5 dans Plan 4 : Adapter `StoryTimelineEngine` au protocole `TimelineEngineProviding`
Créer le fichier `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine+Providing.swift` avec extension + test minimal de conformance. Sans cette task, Task 37 ne compile pas.

### 5.3 [BLOQUANT] Balayage Plan 4 : remplacer `displayDuration` (sur media/audio) par `duration`, retirer `url:` des constructeurs, retirer `.url` des accès
~25 lignes à corriger. Touche `TimelineProjectFactory` (Task 7), tests d'intégration (Tasks 46-48), helpers de snapshot (Tasks 41-42, 44-45), inspector tests (Task 45).

### 5.4 [MAJEUR] Standardiser Plan 4 sur préfixe `feat(timeline-ui):` (et `feat(composer):` pour les modifs composer)
~30 commits à renommer dans le plan. Permet un `git log` lisible et respecte la règle utilisateur.

### 5.5 [MAJEUR] Sortir l'ajout `swift-snapshot-testing` au `Package.swift` du flux parallèle
Faire un commit pré-Plan-1 sur la branche `dev` qui ajoute swift-snapshot-testing au manifest. Sinon Plan 4 Task 1 entrera en conflit de merge avec tout autre changement parallèle au manifest.

### 5.6 [BONUS] Documenter explicitement le scope des sections différées
Si raccourcis clavier (§7.9), Dynamic Type snapshot variants (§7.13), et analytics (§11.1) sont volontairement exclus du V1, ajouter une section "Out-of-scope" en intro de Plan 4 pour rendre l'omission consciente plutôt que oubliée.

---

## 6. Conclusion

Les 4 plans démontrent un travail TDD rigoureux et une bonne séparation des responsabilités. La Phase 0 (Plan 1) et Phase 1 (Plan 2) sont **prêtes à exécuter** — peu d'inter-dépendances et conventions cohérentes. La Phase 2 (Plan 3) est **prête sous réserve** de fixer le bug `.map` sur Optional (MEDIUM-2) et d'aligner l'easing par-keyframe (MEDIUM-7).

La **Phase 3 (Plan 4)** concentre 90 % des incohérences. C'est attendu — Plan 4 est le consommateur final de tout le SDK et le ViewModel. Trois catégories de bugs à fixer **avant** de commencer Plan 4 :
1. **Signatures de commandes** (HIGH-2/3/4) — fix mécanique, ~10 lignes.
2. **Modèles SDK** (HIGH-5) — fix mécanique, ~25 lignes.
3. **Adapter Engine** (HIGH-1, MEDIUM-1, MEDIUM-3) — ajout d'une task + un fichier, ~30 lignes.
4. **Conventions commit** (HIGH-6) — find/replace, ~30 occurrences.

Estimation : **~2-3 heures de pré-traitement Plan 4** par un humain ou un agent dédié, après quoi l'exécution parallèle peut démarrer.

Score de cohérence final : **5.5 / 10** — bonne architecture, mais blocages compilation manifestes. Une fois les corrections HIGH appliquées, score remontera mécaniquement à **8.5 / 10**.
