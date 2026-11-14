# Combustion GPU des éphémères — lot iOS + loi partagée — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un éphémère qui atteint son échéance pendant que le fil est ouvert brûle en 1,2 s, lettre par lettre, avec lisière de braise, flammes et étincelles emportées par le vent de l'appareil, sur les cinq peaux iOS.

**Architecture:** Une loi pure partagée (TS source, miroir Swift) rend durée, vent, sens du front et phase. Un shader Metal `layerEffect` (iOS 17+) peint toute la combustion en une passe sur le calque agrandi de la bulle ; `EphemeralBurnEffect` garde son API et anime `progress`. L'app fournit le vent (CoreMotion) par un atome observable posé dans l'environnement, démarré à la dernière minute d'un éphémère.

**Tech Stack:** TypeScript (vitest), Swift 6 / SwiftUI (`visualEffect`, `ShaderLibrary`), Metal (`[[stitchable]]`, `SwiftUI::Layer`), CoreMotion, Swift Testing + XCTest.

**Spec:** `docs/superpowers/specs/2026-11-13-combustion-des-ephemeres-design.md`

## Global Constraints

- Issue #17938 ; commits « Refs #17938 », jamais `Closes` (le coordinateur ferme sur CI de dev verte).
- Durées : `fullDuration = 1.2` s, `fadeDuration = 0.25` s (Reduce Motion) — les mêmes sur TS et Swift.
- Vent : `raw = rollTurns × 4 + lateralG × 2`, borné à ±1 ; zone morte `|raw| < 0.08` ⇒ défaut ; défaut `±0.35` vers le bord extérieur (`mine` ⇒ +0,35, `theirs` ⇒ −0,35) ; `+1` = vers la droite de l'écran.
- Sens du front : `frontDirection = wind >= 0 ? +1 : −1`, figé à l'allumage ; `drift` suivi en direct.
- Phases : ignition `[0, 0.15[`, propagation `[0.15, 0.8[`, cendres `[0.8, 1]`.
- Le feu s'allume au bord D'OÙ vient le vent (vent +1 ⇒ bord gauche) et avance avec lui.
- Calque agrandi : 24 pt horizontaux, 48 pt en haut, puis marges négatives (mise en page inchangée).
- SDK Purity : le capteur vit dans `apps/ios`, le SDK ne reçoit qu'une valeur.
- `FocalRow` reste sans `@State` (le `@State` vit dans le `ViewModifier`).
- iOS 16 et Reduce Motion gardent les replis actuels (lueur + rétrécissement + fondu / fondu seul).
- Worktree principal partagé : `git add <chemins>` seulement, jamais `commit -a`, jamais `checkout`.
- Fichier Swift neuf dans `apps/ios/Meeshy` ⇒ `ensure_project_is_current` le fait entrer au pbxproj : commiter ce pbxproj avec le lot.

## Review Focus

1. **`isBurning` revient à `false` sans avoir atteint `progress == 1`** (relecture du magasin qui ne porte plus `isBurning`) : la vue doit revenir intacte, `progress` remis à 0 — test dans la tâche 4.
2. **Frame entre la fin de l'animation et le retrait de la ligne** : à `progress >= 1` le shader est désactivé ; sans garde, la bulle REVIENT une image. `opacity(0)` tant que `isBurning` — test dans la tâche 4.
3. **Vent `NaN` ou infini** (capteur en défaut) : la loi doit le traiter comme absent — test dans la tâche 1.
4. **Deux éphémères qui brûlent ensemble** doivent avoir des graines différentes (sinon mêmes étincelles aux mêmes endroits) : graine tirée à l'allumage par modificateur — test dans la tâche 4.
5. **Le capteur ne s'arrête pas** quand le fil se vide (conversation quittée pendant une dernière minute) : `sync(wanted:false)` sur `deinit`/`cancel` — test dans la tâche 6.

---

### Task 1 : La loi partagée (TypeScript, source)

**Files:**
- Create: `packages/shared/utils/ephemeral-burn.ts`
- Create: `packages/shared/utils/ephemeral-burn.test.ts`
- Modify: `packages/shared/utils/index.ts` (une ligne `export * from './ephemeral-burn.js';` après `ephemeral-countdown`)

**Interfaces — Produces:**
```ts
export const EPHEMERAL_BURN_FULL_MS = 1200;
export const EPHEMERAL_BURN_FADE_MS = 250;
export const EPHEMERAL_BURN_WIND_DEAD_ZONE = 0.08;
export const EPHEMERAL_BURN_DEFAULT_WIND = 0.35;
export type EphemeralBurnSide = 'mine' | 'theirs';
export type EphemeralBurnPhase = 'ignition' | 'spread' | 'ashes';
export function ephemeralBurnDurationMs(reduceMotion: boolean): number;
/** `null` quand aucun capteur ne parle, ou que le geste est sous la zone morte. */
export function ephemeralBurnRawWind(input: { readonly rollTurns: number | null; readonly lateralG: number | null }): number | null;
/** Le vent effectif : le brut quand il existe, sinon ±0,35 vers le bord extérieur. */
export function ephemeralBurnWind(raw: number | null, side: EphemeralBurnSide): number;
export function ephemeralBurnFrontDirection(wind: number): 1 | -1;
export function ephemeralBurnPhaseOf(progress: number): EphemeralBurnPhase;
```

- [ ] **Step 1 : Écrire le témoin rouge** `packages/shared/utils/ephemeral-burn.test.ts` (vitest) :
  - `durationMs(false) === 1200`, `durationMs(true) === 250`
  - `rawWind({rollTurns: null, lateralG: null}) === null`
  - `rawWind({rollTurns: 0.01, lateralG: 0}) === null` (0,04 < zone morte)
  - `rawWind({rollTurns: 0.1, lateralG: 0}) === 0.4` ; `rawWind({rollTurns: 0, lateralG: 0.1})` ≈ `0.2`
  - `rawWind({rollTurns: 0.5, lateralG: 1}) === 1` et `rawWind({rollTurns: -0.5, lateralG: -1}) === -1` (bornes)
  - `rawWind({rollTurns: NaN, lateralG: Infinity}) === null`
  - `wind(null, 'mine') === 0.35`, `wind(null, 'theirs') === -0.35`, `wind(-0.6, 'mine') === -0.6`
  - `frontDirection(0.35) === 1`, `frontDirection(-0.2) === -1`, `frontDirection(0) === 1`
  - `phaseOf(0) === 'ignition'`, `phaseOf(0.149) === 'ignition'`, `phaseOf(0.15) === 'spread'`, `phaseOf(0.79) === 'spread'`, `phaseOf(0.8) === 'ashes'`, `phaseOf(1) === 'ashes'`
- [ ] **Step 2 : Vérifier le rouge** — `cd packages/shared && npx vitest run utils/ephemeral-burn.test.ts` ⇒ FAIL (module introuvable).
- [ ] **Step 3 : Implémenter** `ephemeral-burn.ts` avec le doc-comment qui cite la directive et renvoie à la conception ; `Number.isFinite` garde `NaN`/`Infinity` comme absents.
- [ ] **Step 4 : Vérifier le vert** — même commande ⇒ PASS ; `npx tsc --noEmit -p packages/shared` propre.
- [ ] **Step 5 : Commit** — `git add packages/shared/utils/ephemeral-burn.ts packages/shared/utils/ephemeral-burn.test.ts packages/shared/utils/index.ts && git commit -m "feat(shared): loi de la combustion d'un éphémère — durée, vent, front, phases (Refs #17938)"`

### Task 2 : Le miroir Swift de la loi + la nouvelle durée

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/EphemeralBurn.swift` (`fullDuration = 1.2`, doc-comment : la combustion est désormais une vraie combustion, #17938)
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/EphemeralBurnLaw.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/EphemeralBurnLawTests.swift`

**Interfaces — Produces:**
```swift
public enum EphemeralBurnSide: Sendable { case mine, theirs }
public enum EphemeralBurnPhase: Sendable { case ignition, spread, ashes }
public enum EphemeralBurnLaw {
    public static let windDeadZone: Double = 0.08
    public static let defaultWind: Double = 0.35
    public static let ignitionEnd: Double = 0.15
    public static let spreadEnd: Double = 0.8
    public static func rawWind(rollTurns: Double?, lateralG: Double?) -> Double?
    public static func wind(raw: Double?, side: EphemeralBurnSide) -> Double
    public static func frontDirection(wind: Double) -> Double   // +1 ou −1
    public static func phase(progress: Double) -> EphemeralBurnPhase
}
```

- [ ] **Step 1 : Témoin rouge** `EphemeralBurnLawTests` (Swift Testing, `@testable import MeeshySDK`) — les MÊMES vecteurs que la tâche 1 (parité), plus `EphemeralBurn.fullDuration == 1.2` et `fadeDuration == 0.25`.
- [ ] **Step 2 : Rouge** — `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/EphemeralBurnLawTests -quiet` ⇒ compile FAIL.
- [ ] **Step 3 : Implémenter** `EphemeralBurnLaw.swift` (doc-comment : miroir de `packages/shared/utils/ephemeral-burn.ts`, « toute évolution touche les trois ») et porter `fullDuration` à 1.2.
- [ ] **Step 4 : Vert** — même commande, plus `-only-testing:MeeshySDKTests/EphemeralLastMinuteTests` (la borne `< 2` tient).
- [ ] **Step 5 : Commit** — `git add packages/MeeshySDK/Sources/MeeshySDK/Models/EphemeralBurn.swift packages/MeeshySDK/Sources/MeeshySDK/Models/EphemeralBurnLaw.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/EphemeralBurnLawTests.swift && git commit -m "feat(sdk): miroir Swift de la loi de combustion, combustion à 1,2 s (Refs #17938)"`

### Task 3 : Le shader Metal et son enveloppe

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Resources/Shaders/EphemeralBurnShaders.metal`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Conversation/EphemeralBurnShaders.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Conversation/EphemeralBurnShadersTests.swift`

**Interfaces — Produces:**
```swift
public enum EphemeralBurnShaders {
    public static let functionName = "meeshyEphemeralBurn"
    public static var usesMetal: Bool                   // iOS 17+
    public static func precompile() async               // iOS 18+, idempotent (une fois par processus)
    @available(iOS 17.0, *) static var library: ShaderLibrary
    static var metallibURL: URL?
    static func isActive(_ progress: Double) -> Bool    // ]0, 1[
}
/// Le calque agrandi : marges transparentes AVANT l'effet, négatives APRÈS.
public enum EphemeralBurnOverhang { public static let horizontal: CGFloat = 24; public static let top: CGFloat = 48 }
```
Metal :
```metal
[[ stitchable ]] half4 meeshyEphemeralBurn(float2 position, SwiftUI::Layer layer,
    float2 size, float progress, float frontDirection, float drift, float seed, float2 overhang)
```
Algorithme (le constructeur règle les constantes à l'œil) :
- `content = (position - float2(overhang.x, overhang.y)) / (size - float2(2*overhang.x, overhang.y))` ; `a = frontDirection > 0 ? content.x : 1 - content.x` (0 au bord d'allumage).
- bruit `fbm` 3 octaves, cellule ≈ 14 pt (une lettre), décalé par `seed`.
- front `F = mix(-0.25, 1.35, smoothstep(0.0, 0.85, progress))` ; `b = F - a - (n - 0.5) * 0.45`.
- `b > 0.08` ⇒ transparent ; `0 < b <= 0.08` ⇒ charbon (noir, alpha de base) ; `-0.10 < b <= 0` ⇒ braise (orange → jaune additif, pondérée par l'alpha de base) ; sinon intact.
- déformation de chaleur : échantillon à `position + float2(drift, -1) * 6 * exp(-b*b/0.01)`.
- flammes : pour 3 pas vers le bas (8, 16, 28 pt, décalés de `-drift * pas`), si le calque dessous est dans la bande de braise, émission `fbm(position/10 + float2(-drift*4, progress*18))` orange → jaune, décroissante avec le pas.
- étincelles : 20 particules, `hash(seed, i)` ⇒ naissance `t0 ∈ [0.1, 0.75]`, origine sur le front à `t0`, vitesse `(drift*60 + bruit, -90)` pt/s, gravité 40, vie 0,35, lueur `exp(-d²/9)`, additif.
- cendres : `progress > 0.8` ⇒ le reste gris, alpha `× (1 - (progress-0.8)/0.2)`, décalé de `drift * 12 * (progress-0.8)/0.2`.
- `maxSampleOffset` côté Swift : `CGSize(width: 32, height: 36)`.

- [ ] **Step 1 : Témoin rouge** `EphemeralBurnShadersTests` (Swift Testing, `@MainActor`, `@testable import MeeshyUI`) :
  - `default.metallib` existe et porte `"meeshyEphemeralBurn"` (motif `GameShadersTests.metallibCarriesTheThreeFunctions`).
  - `isActive(0) == false`, `isActive(0.5) == true`, `isActive(1) == false`.
  - `EphemeralBurnOverhang.horizontal == 24`, `.top == 48`.
  - `precompile()` termine sans lever (appel `await`).
- [ ] **Step 2 : Rouge** — `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/EphemeralBurnShadersTests -quiet` ⇒ compile FAIL.
- [ ] **Step 3 : Écrire le `.metal`** (doc-comment en tête : les uniforms, le sens du front, ce que chaque bloc peint) et `EphemeralBurnShaders.swift` (motif `GameShaders`).
- [ ] **Step 4 : Vert** — même commande ⇒ PASS ; `GameShadersTests` toujours vert (même metallib).
- [ ] **Step 5 : Commit** — `git add packages/MeeshySDK/Sources/MeeshyUI/Resources/Shaders/EphemeralBurnShaders.metal packages/MeeshySDK/Sources/MeeshyUI/Conversation/EphemeralBurnShaders.swift packages/MeeshySDK/Tests/MeeshyUITests/Conversation/EphemeralBurnShadersTests.swift && git commit -m "feat(sdk-ui): shader Metal meeshyEphemeralBurn — lettres, braise, flammes, étincelles, vent (Refs #17938)"`

### Task 4 : `EphemeralBurnEffect` anime la combustion

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Conversation/EphemeralBurnEffect.swift`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Conversation/EphemeralBurnWind.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Conversation/EphemeralBurnEffectTests.swift`

**Interfaces — Consumes:** tâche 2 (`EphemeralBurnLaw`, `EphemeralBurnSide`), tâche 3 (`EphemeralBurnShaders`, `EphemeralBurnOverhang`).

**Interfaces — Produces:**
```swift
/// L'ATOME du vent : une valeur observable, sans capteur. L'app y écrit, le modificateur la lit.
@MainActor public final class EphemeralBurnWind: ObservableObject {
    @Published public var raw: Double?            // nil = aucun geste / aucun capteur
    public init(raw: Double? = nil)
}
public extension EnvironmentValues { var ephemeralBurnWind: EphemeralBurnWind? }   // défaut nil

public struct EphemeralBurnEffect: ViewModifier {
    public let isBurning: Bool
    public let side: EphemeralBurnSide
    public init(isBurning: Bool, side: EphemeralBurnSide = .theirs)
}
public extension View {
    func ephemeralBurn(isBurning: Bool) -> some View                       // conservé : side = .theirs
    func ephemeralBurn(isBurning: Bool, side: EphemeralBurnSide) -> some View
}
/// La loi de l'allumage, pure et testable : ce que le modificateur fige quand `isBurning` passe à vrai.
public struct EphemeralBurnIgnition: Equatable, Sendable {
    public let frontDirection: Double
    public let seed: Double
    public static func ignite(rawWind: Double?, side: EphemeralBurnSide, seed: Double) -> EphemeralBurnIgnition
}
```
Comportement du modificateur :
- `@State progress: Double = 0`, `@State ignition: EphemeralBurnIgnition? = nil`, `@Environment(\.ephemeralBurnWind)`, `@Environment(\.accessibilityReduceMotion)`.
- `isBurning` passe à vrai ⇒ `ignition = .ignite(rawWind: wind?.raw, side:, seed: .random(in: 0..<1))`, `withAnimation(.linear(duration: EphemeralBurn.fullDuration)) { progress = 1 }`. Repasse à faux ⇒ `progress = 0`, `ignition = nil`, sans animation.
- chemin shader (iOS 17+, `!reduceMotion`, `ignition != nil`) : `content.padding(.horizontal, 24).padding(.top, 48)` → `EphemeralBurnLayer(progress:, frontDirection:, drift:, seed:)` (`ViewModifier, Animatable` sur `progress`, `visualEffect { layerEffect(..., maxSampleOffset: 32×36, isEnabled: isActive(progress)) }`) → `.padding(.horizontal, -24).padding(.top, -48)` → `.opacity(isBurning && progress >= 1 ? 0 : 1)`.
- `drift` : si `wind` non nil, un hôte `EphemeralBurnDriftHost(wind: EphemeralBurnWind, ...)` avec `@ObservedObject` rend le calque et lit `EphemeralBurnLaw.wind(raw: wind.raw, side:)` en direct ; sinon `EphemeralBurnLaw.wind(raw: nil, side:)`.
- chemins iOS 16 / Reduce Motion : exactement le code actuel (déplacé dans `EphemeralBurnFallback`, interne).
- Toujours : `.allowsHitTesting(!isBurning)`, `.accessibilityHidden(isBurning)`.

- [ ] **Step 1 : Témoin rouge** `EphemeralBurnEffectTests` :
  - `EphemeralBurnIgnition.ignite(rawWind: nil, side: .mine, seed: 0.3).frontDirection == 1` ; `side: .theirs` ⇒ `-1` ; `rawWind: -0.5, side: .mine` ⇒ `-1` ; la graine est conservée.
  - rendu (`GameRenderProbe`) d'une `Text("Bonjour")` dans un `RoundedRectangle` : `.ephemeralBurn(isBurning: false)` ≡ identité (`distance < 0.05`).
  - `EphemeralBurnFallback(isBurning: true, progress: 1, reduceMotion: false)` rendu ⇒ `coverage < 0.02` (la bulle a disparu) ; `reduceMotion: true` ⇒ idem.
  - `EphemeralBurnWind(raw: 0.4).raw == 0.4` ; l'environnement rend `nil` par défaut (`EnvironmentValues().ephemeralBurnWind == nil`).
- [ ] **Step 2 : Rouge** — `-only-testing:MeeshyUITests/EphemeralBurnEffectTests` ⇒ compile FAIL.
- [ ] **Step 3 : Implémenter** (fichier `EphemeralBurnEffect.swift` ≤ 300 lignes ; `EphemeralBurnLayer`, `EphemeralBurnDriftHost`, `EphemeralBurnFallback` restent internes dans ce fichier ou un frère `EphemeralBurnLayer.swift`).
- [ ] **Step 4 : Vert** — tests de la tâche + `swift build` du package via `xcodebuild build -scheme MeeshySDK-Package -destination 'generic/platform=iOS Simulator' -quiet`.
- [ ] **Step 5 : Commit** — `git add packages/MeeshySDK/Sources/MeeshyUI/Conversation/EphemeralBurnEffect.swift packages/MeeshySDK/Sources/MeeshyUI/Conversation/EphemeralBurnWind.swift packages/MeeshySDK/Sources/MeeshyUI/Conversation/EphemeralBurnLayer.swift packages/MeeshySDK/Tests/MeeshyUITests/Conversation/EphemeralBurnEffectTests.swift && git commit -m "feat(sdk-ui): EphemeralBurnEffect anime la combustion Metal, repli iOS 16 et Reduce Motion (Refs #17938)"`

### Task 5 : Les cinq peaux passent leur côté

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift:379,635` → `.ephemeralBurn(isBurning: content.isBurning, side: content.isMe ? .mine : .theirs)`
- Modify: `apps/ios/Meeshy/Features/Focal/Row/FocalRow.swift:75` (idem, avec le champ « est à moi » de `content`)
- Modify: `apps/ios/Meeshy/Features/River/View/RiverBubbleView.swift:122` (idem)
- Modify: `apps/ios/Meeshy/Features/Focal/Summary/SummaryProtectionsView.swift:101` (idem, `entry`)
- Test: `apps/ios/MeeshyTests/Unit/Views/EphemeralBurnSideSourceGuardTests.swift` (garde source : chaque site `.ephemeralBurn(` de `apps/ios/Meeshy` passe `side:` — motif des gardes `*SourceGuardTests`)

- [ ] **Step 1 : Témoin rouge** — la garde lit les fichiers sous `apps/ios/Meeshy`, compte les `.ephemeralBurn(isBurning:` sans `side:` ⇒ doit être 0.
- [ ] **Step 2 : Rouge** — `./apps/ios/meeshy.sh test --skip-sdk` filtré, ou `xcodebuild test-without-building … -only-testing:MeeshyTests/EphemeralBurnSideSourceGuardTests` ⇒ FAIL (5 sites).
- [ ] **Step 3 : Poser `side:`** sur les cinq sites.
- [ ] **Step 4 : Vert** + `./apps/ios/meeshy.sh build`.
- [ ] **Step 5 : Commit** — `git add <les 5 fichiers> apps/ios/MeeshyTests/Unit/Views/EphemeralBurnSideSourceGuardTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj && git commit -m "feat(ios): les cinq peaux disent de quel côté brûle leur éphémère (Refs #17938)"`

### Task 6 : Le vent de l'appareil et le préchauffage (app)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/EphemeralBurnWindSource.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:34` (à côté de `ephemeralExpiry` : `lazy var ephemeralWind = EphemeralBurnWindSource()`)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+EphemeralExpiry.swift:203` (`refreshEphemeralExpirySchedule` appelle aussi `ephemeralWind.sync(wanted: EphemeralBurnWindPolicy.wanted(deadlines:burning:now:))` et, si des échéances existent, `EphemeralBurnShaders.precompile()` dans une `Task`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+Rows.swift:397` (`.environment(\.ephemeralBurnWind, self.conversationViewModel?.ephemeralWind.wind)`)
- Test: `apps/ios/MeeshyTests/Unit/Services/EphemeralBurnWindSourceTests.swift`

**Interfaces — Consumes:** tâche 4 (`EphemeralBurnWind`, `\.ephemeralBurnWind`), tâche 3 (`EphemeralBurnShaders.precompile`), `EphemeralDeadline.countdownThreshold`.

**Interfaces — Produces:**
```swift
nonisolated enum EphemeralBurnWindPolicy {
    /// Vrai dès qu'un éphémère est dans sa dernière minute ou en combustion.
    static func wanted(deadlines: [String: Date], burning: Bool, now: Date) -> Bool
    static func sensorRuns(wanted: Bool, reduceMotion: Bool) -> Bool
    /// Filtre passe-bas de l'accélération latérale : `previous + (sample - previous) * 0.2`.
    static func smoothedLateral(previous: Double, sample: Double) -> Double
}
@MainActor final class EphemeralBurnWindSource {
    nonisolated deinit {}
    let wind: EphemeralBurnWind                   // l'atome du SDK, écrit ici
    func sync(wanted: Bool)                        // démarre/arrête CMMotionManager (30 Hz), remet `wind.raw = nil` à l'arrêt
    func ingest(rollRadians: Double, lateralG: Double)   // appelé par le capteur ; testable sans CoreMotion
}
```
`ingest` : `rollTurns = rollRadians / (2π)` borné ±0,5 (comme `GameTiltSource.turns`), lateral lissé, puis `wind.raw = EphemeralBurnLaw.rawWind(rollTurns:lateralG:)`.

- [ ] **Step 1 : Témoin rouge** `EphemeralBurnWindSourceTests` (XCTest, `@MainActor`) :
  - `wanted(deadlines: ["a": now + 30], burning: false, now:)` ⇒ vrai ; `now + 61` ⇒ faux ; `[:]`, `burning: true` ⇒ vrai.
  - `sensorRuns(wanted: true, reduceMotion: true)` ⇒ faux.
  - `smoothedLateral(previous: 0, sample: 1) == 0.2`.
  - `ingest(rollRadians: 0.63, lateralG: 0)` ⇒ `wind.raw ≈ 0.4` ; `ingest(rollRadians: 0.02, lateralG: 0)` ⇒ `nil` ; `sync(wanted: false)` après un `ingest` ⇒ `wind.raw == nil`.
- [ ] **Step 2 : Rouge** — compile FAIL.
- [ ] **Step 3 : Implémenter** la source (motif `GameTiltSource` : `isDeviceMotionAvailable`, `deviceMotionUpdateInterval = 1/30`, `attitude.roll`, `userAcceleration.x`), la politique, le branchement VM et l'environnement des cellules.
- [ ] **Step 4 : Vert** — tests de la tâche + `ConversationViewModelElapsedEphemeralTests` + `./apps/ios/meeshy.sh build`.
- [ ] **Step 5 : Commit** — `git add <fichiers> apps/ios/Meeshy.xcodeproj/project.pbxproj && git commit -m "feat(ios): le vent de l'appareil souffle sur la combustion des éphémères, capteur à la dernière minute (Refs #17938)"`

### Task 7 : Recette au simulateur et gates complets

- [ ] **Step 1 :** `./apps/ios/meeshy.sh test` complet (phase 0 SDK + phases 1-3) ⇒ vert.
- [ ] **Step 2 :** `apps/ios/scripts/check_cohesion_budget.sh` et les gardes `house_rules` du dépôt ⇒ vert.
- [ ] **Step 3 :** Recette : lancer l'app (`meeshy.sh run`), envoyer un éphémère de 60 s dans une conversation de test du STAGING, filmer la combustion (`xcrun simctl io booted recordVideo`), vérifier : lettres qui partent une à une, braise, flammes, étincelles, dérive ; Reduce Motion ⇒ fondu.
- [ ] **Step 4 :** Commenter #17938 avec la preuve (vidéo/captures, gates), les dimensions mûres et les issues ouvertes pour Android (lot 2) et web (lot 3), chacune dans le milestone.
- [ ] **Step 5 :** Fusion dans `dev` selon le protocole du worktree partagé (verrou `.git/jeu-sync.lock`, `fetch` + `merge origin/dev`, push des seuls commits à soi), puis surveillance de la CI de dev (iOS SDK + iOS).
