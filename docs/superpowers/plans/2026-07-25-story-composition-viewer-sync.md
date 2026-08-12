# Story — Synchronisation composition ↔ visualisation : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire que la lecture d'une story par un utilisateur affiche les éléments du canvas aux instants exacts programmés dans la timeline de composition, avec une barre de progression asservie à cette timeline et une pause qui gèle tout en phase.

**Architecture:** Le moteur de rendu (`StoryRenderer`) est déjà partagé entre composer-preview, viewer et export. La désynchronisation vient de deux horloges non asservies dans le viewer. On câble le pont SDK `onPlaybackTime` (déjà émis, jamais consommé) pour faire du playhead du canvas la source de vérité unique, avec un repli wall-clock isolé dans une struct pure testable. On corrige ensuite les divergences de transitions, l'ordre du marquage « vue » autour de l'interlude, et on migre les inspecteurs timeline d'un overlay recouvrant les pistes vers une sheet.

**Tech Stack:** Swift 6 / SwiftUI (iOS 26 cible, floor iOS 16.4 pour les detents), XCTest, CALayer/CADisplayLink, Fastify 5 + Prisma (gateway), bun 1.3.14.

## Global Constraints

- **TDD non négociable** : aucun code de production sans test qui échoue d'abord. RED → GREEN → REFACTOR.
- **Swift 6** : `@MainActor` sur extensions uniquement, jamais sur une classe `AppDelegate`. Closures `@Sendable` capturent les propriétés `@MainActor` en `let` local.
- **Pas de `.onChange` SwiftUI brut** : utiliser `adaptiveOnChange` (convention repo).
- **Pas de `try?`** : `do/catch` avec log.
- **Simulateur de validation** : `Meeshy-iOS26` — `C295B364-8CA6-4214-BC52-E411A97EBFE2` (iOS 26.1, booté).
- **Build iOS** : toujours `./apps/ios/meeshy.sh build` — jamais `xcodebuild` direct. `meeshy.sh test` juge par le `.xcresult`, pas par l'exit code.
- **Interlude** : durée inchangée à **2,6 s** (`StoryViewerView.swift:127`), déclenchement **inter-groupes uniquement** — pas à l'ouverture depuis le tray. Décision utilisateur 2026-07-25.
- **Commits** : pas de trailer `Co-Authored-By`. Commits fréquents, worktree propre, chaque lot vert.
- **Branche** : travailler sur `main` (branche courante), push déclenche la CI.

---

## Task 1 : Gateway — `banner` dans `storyAuthorSelect`, push pour amorcer la CI

Premier lot volontairement : le push déclenche la CI qui construit les images pendant que le travail iOS avance.

**Files:**
- Modify: `services/gateway/src/services/posts/postIncludes.ts:55-59`
- Test: `services/gateway/src/services/posts/__tests__/postIncludes.test.ts` (créer si absent — vérifier d'abord le répertoire de tests existant du module posts)

**Interfaces:**
- Consumes: rien.
- Produces: le payload stories porte `author.banner: string | null`. Consommé par la Task 9.

- [ ] **Step 1 : Localiser la convention de test du module posts**

```bash
cd /Users/smpceo/Documents/v2_meeshy
ls services/gateway/src/services/posts/
find services/gateway -path "*posts*" -name "*.test.ts" | head
```

Placer le test dans le répertoire trouvé, en suivant le style du voisin le plus proche.

- [ ] **Step 2 : Écrire le test qui échoue**

```typescript
import { storyAuthorSelect, authorSelect } from '../postIncludes';

describe('storyAuthorSelect', () => {
  it("inclut banner pour que l'interstitiel d'identité soit complet sans résolution paresseuse", () => {
    expect(storyAuthorSelect).toHaveProperty('banner', true);
  });

  it('reste un sur-ensemble de authorSelect', () => {
    for (const key of Object.keys(authorSelect)) {
      expect(storyAuthorSelect).toHaveProperty(key);
    }
  });

  it('conserve la présence déjà embarquée', () => {
    expect(storyAuthorSelect).toHaveProperty('isOnline', true);
    expect(storyAuthorSelect).toHaveProperty('lastActiveAt', true);
  });
});
```

- [ ] **Step 3 : Lancer le test, vérifier l'échec**

```bash
cd services/gateway && bun run test -- postIncludes
```

Attendu : ÉCHEC sur `toHaveProperty('banner', true)`.

- [ ] **Step 4 : Implémenter**

Dans `postIncludes.ts`, ajouter `banner: true` à `storyAuthorSelect` et étendre le commentaire existant :

```typescript
export const storyAuthorSelect = Prisma.validator<Prisma.UserSelect>()({
  ...authorSelect,
  isOnline: true,
  lastActiveAt: true,
  // `banner` complète l'interstitiel : c'était le dernier élément encore
  // résolu paresseusement (GET /users/:id par auteur, cf.
  // StoryViewModel.resolveGroupIntro). Même raisonnement que la présence
  // ci-dessus — l'interstitiel doit être complet à l'instant du switch.
  banner: true,
});
```

- [ ] **Step 5 : Vérifier le vert + non-régression du module**

```bash
cd services/gateway && bun run test -- postIncludes
cd services/gateway && bun run build
```

Attendu : tests verts, `tsc` sans erreur. Ne jamais piper `bun run build` dans `tail` — l'exit code serait celui de `tail`.

- [ ] **Step 6 : Commit et push pour amorcer la CI**

```bash
git add services/gateway/src/services/posts/
git commit -m "feat(gateway/stories): banner dans storyAuthorSelect

L'interstitiel d'identité inter-groupes du viewer affiche avatar, nom,
présence et bannière. La présence voyageait déjà avec le payload stories
pour que l'interstitiel soit complet à l'instant du switch ; la bannière
restait résolue paresseusement via GET /users/:id par auteur.

Même raisonnement, même select."
git push origin main
```

- [ ] **Step 7 : Noter le run CI et poursuivre sans attendre**

```bash
gh run list --limit 3
```

Consigner l'id du run. Le travail iOS continue ; le déploiement se fait en Task 12.

---

## Task 2 : `StoryPlaybackClock` — logique pure d'arbitrage des horloges

Cœur du chantier, isolé de toute UI pour être testable. `StoryViewerView` n'est pas instanciable en test (constaté par les guards existants) — d'où l'extraction.

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/StoryPlaybackClock.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/StoryPlaybackClockTests.swift`
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj` (via `xcodegen` si le projet est généré — vérifier la présence de `project.yml`)

**Interfaces:**
- Consumes: rien.
- Produces:
  ```swift
  struct StoryPlaybackClock: Equatable {
      enum Source: Equatable { case canvas, fallback }
      struct Output: Equatable { let progress: Double; let isComplete: Bool; let source: Source }
      static func resolve(playheadSeconds: Double?,
                          wallClockElapsed: TimeInterval,
                          duration: TimeInterval,
                          isPaused: Bool) -> Output
  }
  ```
  Consommé par la Task 3.

- [ ] **Step 1 : Vérifier si le projet Xcode est généré**

```bash
cd /Users/smpceo/Documents/v2_meeshy && ls apps/ios/project.yml
```

Si `project.yml` existe, les nouveaux fichiers sont pris automatiquement à la régénération — et **`xcodegen` remet à zéro `CURRENT_PROJECT_VERSION`**, à restaurer après. Sinon, ajouter le fichier au `project.pbxproj`.

- [ ] **Step 2 : Écrire les tests qui échouent**

```swift
import XCTest
@testable import Meeshy

final class StoryPlaybackClockTests: XCTestCase {

    func test_resolve_whenPlayheadAvailable_usesCanvasSource() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: 3.0, wallClockElapsed: 9.0, duration: 6.0, isPaused: false)
        XCTAssertEqual(out.source, .canvas)
        XCTAssertEqual(out.progress, 0.5, accuracy: 0.0001)
        XCTAssertFalse(out.isComplete)
    }

    func test_resolve_whenPlayheadNil_fallsBackToWallClock() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: nil, wallClockElapsed: 3.0, duration: 6.0, isPaused: false)
        XCTAssertEqual(out.source, .fallback)
        XCTAssertEqual(out.progress, 0.5, accuracy: 0.0001)
    }

    func test_resolve_whenPaused_freezesProgressAtPlayhead() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: 1.5, wallClockElapsed: 5.0, duration: 6.0, isPaused: true)
        XCTAssertEqual(out.progress, 0.25, accuracy: 0.0001)
        XCTAssertFalse(out.isComplete)
    }

    func test_resolve_whenPausedAtEnd_doesNotComplete() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: 6.0, wallClockElapsed: 6.0, duration: 6.0, isPaused: true)
        XCTAssertFalse(out.isComplete)
    }

    func test_resolve_whenPlayheadReachesDuration_isComplete() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: 6.0, wallClockElapsed: 0.0, duration: 6.0, isPaused: false)
        XCTAssertEqual(out.progress, 1.0, accuracy: 0.0001)
        XCTAssertTrue(out.isComplete)
    }

    func test_resolve_clampsProgressToUnitInterval() {
        let over = StoryPlaybackClock.resolve(
            playheadSeconds: 99.0, wallClockElapsed: 0, duration: 6.0, isPaused: false)
        XCTAssertEqual(over.progress, 1.0, accuracy: 0.0001)

        let under = StoryPlaybackClock.resolve(
            playheadSeconds: -5.0, wallClockElapsed: 0, duration: 6.0, isPaused: false)
        XCTAssertEqual(under.progress, 0.0, accuracy: 0.0001)
    }

    func test_resolve_whenDurationZero_returnsZeroWithoutDividing() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: 3.0, wallClockElapsed: 3.0, duration: 0, isPaused: false)
        XCTAssertEqual(out.progress, 0.0, accuracy: 0.0001)
        XCTAssertFalse(out.isComplete)
    }

    func test_resolve_whenDurationNegative_returnsZeroWithoutDividing() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: 3.0, wallClockElapsed: 3.0, duration: -4, isPaused: false)
        XCTAssertEqual(out.progress, 0.0, accuracy: 0.0001)
    }
}
```

- [ ] **Step 3 : Lancer, vérifier l'échec de compilation**

```bash
./apps/ios/meeshy.sh test
```

Attendu : ÉCHEC — `StoryPlaybackClock` n'existe pas. Rappel : un « TEST FAILED » iOS signifie souvent une erreur de compilation ; lire le `.xcresult`.

- [ ] **Step 4 : Implémenter le minimum**

```swift
import Foundation

/// Arbitre l'horloge de lecture d'une story.
///
/// Le viewer disposait de deux horloges non asservies : le wall-clock de
/// `StoryReaderTimerController` (barre + auto-advance) et le playhead de
/// `StoryCanvasUIView` (visibilité des éléments, fades, keyframes). La barre
/// pouvait donc avancer alors que le playhead était encore à 0 — les éléments
/// à `startTime > 0` apparaissaient décalés.
///
/// Règle : le playhead du canvas gagne dès qu'il émet. Le wall-clock ne sert
/// que de repli quand le canvas reste muet (slide sans média, canvas détruit).
struct StoryPlaybackClock: Equatable {

    enum Source: Equatable { case canvas, fallback }

    struct Output: Equatable {
        let progress: Double
        let isComplete: Bool
        let source: Source
    }

    static func resolve(playheadSeconds: Double?,
                        wallClockElapsed: TimeInterval,
                        duration: TimeInterval,
                        isPaused: Bool) -> Output {
        guard duration > 0 else {
            return Output(progress: 0, isComplete: false,
                          source: playheadSeconds == nil ? .fallback : .canvas)
        }

        let source: Source = playheadSeconds == nil ? .fallback : .canvas
        let elapsed = playheadSeconds ?? wallClockElapsed
        let progress = min(1.0, max(0.0, elapsed / duration))

        // Une story en pause ne se termine jamais d'elle-même : l'auto-advance
        // doit attendre la reprise, sinon un long-press en fin de slide fait
        // sauter à la suivante au relâchement.
        let isComplete = !isPaused && progress >= 1.0

        return Output(progress: progress, isComplete: isComplete, source: source)
    }
}
```

- [ ] **Step 5 : Vérifier le vert**

```bash
./apps/ios/meeshy.sh test
```

Attendu : les 8 tests passent. Vérifier dans le `.xcresult`, pas sur l'exit code.

- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryPlaybackClock.swift \
        apps/ios/MeeshyTests/Unit/Views/StoryPlaybackClockTests.swift
git commit -m "feat(ios/story): StoryPlaybackClock, arbitrage playhead vs wall-clock

Logique pure extraite : le playhead du canvas gagne dès qu'il émet, le
wall-clock ne sert que de repli. Pause gèle la progression et empêche
l'auto-advance. Division par zéro impossible."
```

---

## Task 3 : Câbler `onPlaybackTime` — le playhead pilote la barre

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:932-972` (ajout du paramètre `onPlaybackTime` au `StoryReaderRepresentable`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:160-200` (nouvel `@State` de playhead), `:792-836` (`installPrefetchPipelineIfNeeded`)

**Interfaces:**
- Consumes: `StoryPlaybackClock.resolve(playheadSeconds:wallClockElapsed:duration:isPaused:)` (Task 2). `StoryReaderRepresentable.init(..., onPlaybackTime: ((Double) -> Void)? = nil, ...)` (`StoryReaderRepresentable.swift:96`, déjà existant).
- Produces: `@State var canvasPlayheadSeconds: Double?` sur `StoryViewerView`, remis à `nil` à chaque changement de slide. Consommé par la Task 4.

- [ ] **Step 1 : Écrire le test de non-régression du repli**

Le câblage lui-même traverse SwiftUI et n'est pas testable directement ; on verrouille la propriété qui compte — le repli reste actif quand le canvas est muet.

Ajouter dans `apps/ios/MeeshyTests/Unit/Views/StoryPlaybackClockTests.swift` :

```swift
    /// Un canvas muet (slide sans média, canvas détruit) ne doit jamais figer
    /// la story : le repli wall-clock reprend la main et l'auto-advance
    /// continue de fonctionner.
    func test_resolve_muteCanvasStillCompletesViaFallback() {
        let out = StoryPlaybackClock.resolve(
            playheadSeconds: nil, wallClockElapsed: 6.0, duration: 6.0, isPaused: false)
        XCTAssertEqual(out.source, .fallback)
        XCTAssertTrue(out.isComplete)
    }
```

- [ ] **Step 2 : Lancer, vérifier l'échec puis le vert**

```bash
./apps/ios/meeshy.sh test
```

Ce test doit passer immédiatement avec l'implémentation de la Task 2 — c'est un test de verrouillage. S'il échoue, l'implémentation de la Task 2 est fautive : corriger avant de continuer.

- [ ] **Step 3 : Déclarer l'état du playhead**

Dans `StoryViewerView.swift`, à côté de `@State var computedStoryDuration: Double = 6.0` (ligne ~164) :

```swift
    /// Position de lecture (secondes) émise par le displayLink du canvas via
    /// `StoryReaderRepresentable.onPlaybackTime`. `nil` tant que le canvas
    /// n'a rien émis (slide sans média, canvas pas encore prêt) — dans ce cas
    /// `StoryPlaybackClock` retombe sur le wall-clock du timer.
    /// Remis à `nil` à chaque changement de slide (cf. `startTimer()`).
    @State var canvasPlayheadSeconds: Double?
```

- [ ] **Step 4 : Câbler `onPlaybackTime` sur le representable**

Dans `StoryViewerView+Canvas.swift`, dans l'appel `StoryReaderRepresentable(...)` (ligne ~932), ajouter juste avant `onPlaybackProgressing:` :

```swift
                                      // Horloge unique : le playhead du canvas
                                      // est la source de vérité de la barre. Sans
                                      // ce câblage, la barre suivait un wall-clock
                                      // indépendant et pouvait avancer alors que
                                      // le playhead était encore à 0 — les éléments
                                      // à `startTime > 0` apparaissaient décalés.
                                      onPlaybackTime: { t in
                                          canvasPlayheadSeconds = t
                                      },
```

- [ ] **Step 5 : Faire consommer le playhead par le pipeline de progression**

Dans `StoryViewerView.swift`, `installPrefetchPipelineIfNeeded`, remplacer le corps de `t.onProgressChange` (ligne ~815) — le timer fournit désormais le wall-clock, `StoryPlaybackClock` arbitre :

```swift
        t.onProgressChange = { [self] p in
            let duration = computedStoryDuration
            let resolved = StoryPlaybackClock.resolve(
                playheadSeconds: canvasPlayheadSeconds,
                wallClockElapsed: p * duration,
                duration: duration,
                isPaused: shouldPauseTimer
            )
            let raw = CGFloat(resolved.progress)
            // Granularité 1/300 : évite de committer le @State `progress` à
            // chaque tick 60 Hz pour des deltas invisibles.
            if abs(raw - progress) >= 1.0 / 300.0 || raw >= 1.0 || raw == 0 {
                progress = raw
            }
            // Seuil d'amorçage du prefetch de la slide suivante : 5 s avant la
            // fin, borné à 50 % minimum.
            let threshold = max(0.5, 1.0 - (5.0 / max(duration, 0.1)))
            if resolved.progress >= threshold && !hasFiredNextPrefetch {
                hasFiredNextPrefetch = true
                _ = prefetchStory(at: currentStoryIndex + 1)
            }
        }
```

- [ ] **Step 6 : Réinitialiser le playhead à chaque slide**

Dans `StoryViewerView+Content.swift`, `startTimer()` (ligne ~546), ajouter à côté de `progress = 0` :

```swift
        canvasPlayheadSeconds = nil
```

- [ ] **Step 7 : Build + tests**

```bash
./apps/ios/meeshy.sh build
./apps/ios/meeshy.sh test
```

Attendu : build vert, suite verte.

- [ ] **Step 8 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift \
        apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift \
        apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift \
        apps/ios/MeeshyTests/Unit/Views/StoryPlaybackClockTests.swift
git commit -m "fix(ios/story): la barre de progression suit le playhead du canvas

onPlaybackTime était émis par le SDK et documenté source de vérité, mais
aucun call-site applicatif ne le consommait. La barre suivait un wall-clock
indépendant du playhead qui pilote la visibilité des éléments — d'où des
éléments à startTime > 0 affichés au mauvais moment, voire jamais.

StoryPlaybackClock arbitre : playhead prioritaire, wall-clock en repli."
```

---

## Task 4 : Corriger D9 — armer le timer avec la durée de la bonne slide

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:854-940` (`refreshPrefetchWindowAndTimer`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:619-631` (rendre `updateStoryDuration` accessible)

**Interfaces:**
- Consumes: `canvasPlayheadSeconds` (Task 3).
- Produces: garantie que `currentSlideDuration` correspond à `currentStory` au moment de `setCurrentSlide`.

- [ ] **Step 1 : Lire le code actuel pour situer l'appel fautif**

```bash
cd /Users/smpceo/Documents/v2_meeshy
sed -n '854,945p' apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift
grep -n "refreshPrefetchWindowAndTimer" apps/ios/Meeshy/Features/Main/Views/StoryViewerView*.swift
```

`refreshPrefetchWindowAndTimer()` est appelé sur `.onChange(currentStoryIndex)` (`:571`) et `.onChange(currentGroupIndex)` (`:611`), et appelle `t.setCurrentSlide(id:duration: currentSlideDuration)` (`:937`). `currentSlideDuration` lit `computedStoryDuration`, écrit par `updateStoryDuration()` qui n'est appelé que plus tard depuis `startTimer()` (`+Content.swift:568`).

- [ ] **Step 2 : Rendre `updateStoryDuration` visible depuis l'extension appelante**

Dans `+Content.swift:619`, passer `private func updateStoryDuration()` à `func updateStoryDuration()` (`internal`), afin qu'il soit appelable depuis `StoryViewerView.swift` — même module, extensions cross-fichier.

- [ ] **Step 3 : Recalculer la durée avant d'armer**

Dans `refreshPrefetchWindowAndTimer`, immédiatement avant la ligne `t.setCurrentSlide(id: current.id, duration: currentSlideDuration)` (~`:937`) :

```swift
        // La durée DOIT être recalculée pour `current` avant d'armer le timer.
        // Ce point est atteint depuis `.onChange(currentStoryIndex)` et
        // `.onChange(currentGroupIndex)`, tous deux AVANT que `startTimer()`
        // n'appelle `updateStoryDuration()` — sans ce recalcul le timer était
        // armé avec la durée de la slide PRÉCÉDENTE.
        updateStoryDuration()
```

- [ ] **Step 4 : Build + tests**

```bash
./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test
```

- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift \
        apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
git commit -m "fix(ios/story): armer le timer avec la durée de la slide courante

refreshPrefetchWindowAndTimer() est appelé sur les onChange d'index, donc
avant que startTimer() n'ait appelé updateStoryDuration() — le timer était
armé avec la durée de la slide précédente."
```

---

## Task 5 : Corriger D5 — le canvas sortant doit rendre en `.play`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift:120-130`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/StoryReaderOutgoingModeTests.swift` (créer ; vérifier d'abord le nom exact de la cible de tests)

**Interfaces:**
- Consumes: rien.
- Produces: rien de nouveau ; corrige un comportement.

- [ ] **Step 1 : Vérifier la cible de tests du SDK et le code fautif**

```bash
cd /Users/smpceo/Documents/v2_meeshy
ls packages/MeeshySDK/Tests/
sed -n '115,135p' packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift
grep -n "isOutgoing" packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift
```

Le mode est choisi par `isOutgoing` : `true` → `.edit`, ce qui fait retourner `true` à `shouldRender` pour **tous** les éléments (`StoryRenderer.swift:338`). Pendant les 350-400 ms de cross-fade, la slide sortante réaffiche donc tout son contenu hors fenêtre temporelle.

- [ ] **Step 2 : Écrire le test qui échoue**

Le mode est une décision pure ; l'extraire en propriété statique testable. Créer le test :

```swift
import XCTest
@testable import MeeshyUI

final class StoryReaderOutgoingModeTests: XCTestCase {

    /// Le canvas sortant du cross-fade doit conserver la sémantique temporelle.
    /// En `.edit`, `shouldRender` retourne `true` pour tout — la slide sortante
    /// réaffichait ses éléments hors de leur fenêtre pendant la transition.
    func test_renderMode_outgoingCanvas_staysInPlay() {
        XCTAssertEqual(StoryReaderRepresentable.renderMode(isOutgoing: true), .play)
    }

    func test_renderMode_incomingCanvas_isPlay() {
        XCTAssertEqual(StoryReaderRepresentable.renderMode(isOutgoing: false), .play)
    }
}
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

```bash
./apps/ios/meeshy.sh test
```

Attendu : ÉCHEC — `renderMode(isOutgoing:)` n'existe pas.

- [ ] **Step 4 : Implémenter**

Dans `StoryReaderRepresentable.swift`, ajouter la fonction statique et l'utiliser au montage :

```swift
    /// Mode de rendu du canvas reader.
    ///
    /// Le canvas sortant du cross-fade était monté en `.edit`, où
    /// `StoryRenderer.shouldRender` court-circuite la fenêtre temporelle et
    /// retourne `true` pour tout élément. Pendant les 350-400 ms de
    /// transition, la slide sortante réaffichait donc l'intégralité de son
    /// contenu — y compris des éléments déjà terminés ou pas encore apparus.
    /// Les deux canvases restent en `.play`.
    static func renderMode(isOutgoing: Bool) -> RenderMode { .play }
```

Puis remplacer l'expression ternaire du `init`/`makeUIView` par `StoryReaderRepresentable.renderMode(isOutgoing: isOutgoing)`.

- [ ] **Step 5 : Vérifier le vert**

```bash
./apps/ios/meeshy.sh test
```

- [ ] **Step 6 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift \
        packages/MeeshySDK/Tests/
git commit -m "fix(sdk/story): le canvas sortant rend en .play

En .edit, shouldRender ignore la fenêtre temporelle et retourne true pour
tout. La slide sortante du cross-fade réaffichait donc l'intégralité de son
contenu pendant 350-400 ms, éléments terminés et pas encore apparus compris."
```

---

## Task 6 : Corriger D2/D3 — une seule application du `closing`, constantes alignées

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:360-433` (`crossFadeStory`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:905-915, 1010-1025`
- Test: `apps/ios/MeeshyTests/Features/Stories/StoryTransitionParityTests.swift` (créer)

**Interfaces:**
- Consumes: constantes SDK `StoryRenderer.zoomTransitionScale`, `slideTransitionTravelFraction`, `slideTransitionDuration` (`StoryRenderer.swift:562-570`) — vérifier leur niveau d'accès et les rendre `public`/`internal` si nécessaire.
- Produces: rien de nouveau.

- [ ] **Step 1 : Relever les constantes des deux côtés**

```bash
cd /Users/smpceo/Documents/v2_meeshy
sed -n '555,575p' packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift
sed -n '360,433p' apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
grep -n "closingScale\|outgoingOpacity\|openingScale\|textSlideOffset" apps/ios/Meeshy/Features/Main/Views/StoryViewerView+*.swift
```

Divergences attendues : SDK zoom 1.08 / translation horizontale 8 % / 0,5 s ; viewer zoom 0.88 / offset vertical 30 pt / 0,35-0,4 s.

- [ ] **Step 2 : Écrire le test de parité**

```swift
import XCTest
@testable import Meeshy
@testable import MeeshyUI

final class StoryTransitionParityTests: XCTestCase {

    /// Les transitions d'ouverture existaient en deux implémentations aux
    /// constantes divergentes (CALayer côté SDK, SwiftUI côté viewer). Le SDK
    /// est la source de vérité ; le viewer ne doit plus porter ses propres
    /// nombres.
    func test_viewerOpeningConstants_matchRendererConstants() {
        XCTAssertEqual(StoryViewerTransitionConstants.zoomScale,
                       StoryRenderer.zoomTransitionScale, accuracy: 0.0001)
        XCTAssertEqual(StoryViewerTransitionConstants.slideTravelFraction,
                       StoryRenderer.slideTransitionTravelFraction, accuracy: 0.0001)
        XCTAssertEqual(StoryViewerTransitionConstants.duration,
                       StoryRenderer.slideTransitionDuration, accuracy: 0.0001)
    }
}
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

```bash
./apps/ios/meeshy.sh test
```

Attendu : ÉCHEC — `StoryViewerTransitionConstants` n'existe pas.

- [ ] **Step 4 : Créer le point d'accès unique et retirer le double `closing`**

Créer `apps/ios/Meeshy/Features/Main/Views/StoryViewerTransitionConstants.swift` :

```swift
import Foundation
import MeeshyUI

/// Constantes de transition du viewer, dérivées du renderer SDK.
///
/// Le cross-fade INTER-SLIDES reste en SwiftUI : le renderer ne connaît qu'une
/// slide à la fois et ne peut pas assurer l'opacité croisée entre deux canvases.
/// En revanche les paramètres d'ouverture ne doivent exister qu'une fois — ils
/// divergeaient (zoom 0.88 vs 1.08, offset vertical vs horizontal, 0,35 s vs
/// 0,5 s), donnant deux animations différentes selon le chemin emprunté.
enum StoryViewerTransitionConstants {
    static let zoomScale: Double = StoryRenderer.zoomTransitionScale
    static let slideTravelFraction: Double = StoryRenderer.slideTransitionTravelFraction
    static let duration: Double = StoryRenderer.slideTransitionDuration
}
```

Si les constantes SDK ne sont pas exposées, les passer `public static let` dans `StoryRenderer.swift` sans changer leurs valeurs.

Puis dans `crossFadeStory` (`+Content.swift`), remplacer les littéraux d'ouverture par ces constantes, et **supprimer** l'application SwiftUI du `closing` (`closingScale` / `outgoingOpacity` liés au closing) : `StoryRenderer.applyClosing` la refait déjà à chaque tick depuis le playhead (`+Playback.swift:266`), et c'est la seule qui reste juste sous l'horloge unifiée. Conserver l'opacité du cross-fade inter-slides.

- [ ] **Step 5 : Vérifier le vert**

```bash
./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test
```

- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerTransitionConstants.swift \
        apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift \
        apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift \
        apps/ios/MeeshyTests/Features/Stories/StoryTransitionParityTests.swift
git commit -m "fix(ios/story): une seule application du closing, constantes alignées

Le closing était appliqué deux fois (rootLayer SDK depuis le playhead +
scaleEffect SwiftUI) et les constantes d'ouverture divergeaient entre les
deux implémentations. Le renderer devient la source de vérité ; le viewer
ne garde que le cross-fade inter-slides, que le SDK ne peut pas assurer."
```

---

## Task 7 : Corriger D7 — parsing du dégradé de fond

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:1630-1645`
- Test: `apps/ios/MeeshyTests/Unit/Views/StoryViewerBackgroundParsingTests.swift` (créer)

**Interfaces:**
- Consumes: `StoryBackgroundValue` (`packages/MeeshySDK/Sources/MeeshyUI/.../StoryBackgroundValue.swift:27-38`) — relever son API exacte avant d'écrire le test.
- Produces: rien de nouveau.

- [ ] **Step 1 : Relever l'API de `StoryBackgroundValue` et le code fautif**

```bash
cd /Users/smpceo/Documents/v2_meeshy
find packages/MeeshySDK -name "StoryBackgroundValue.swift" -exec sed -n '1,60p' {} \;
sed -n '1625,1650p' apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift
```

Le viewer splitte `"gradient:RRGGBB:RRGGBB"` sur **virgule** ; la sérialisation utilise **deux-points**. Le split rend un seul élément → `LinearGradient` monochrome invalide.

- [ ] **Step 2 : Écrire le test qui échoue**

Adapter les noms exacts relevés au Step 1 :

```swift
import XCTest
@testable import Meeshy
@testable import MeeshyUI

final class StoryViewerBackgroundParsingTests: XCTestCase {

    /// Le viewer splittait sur la virgule alors que la sérialisation utilise
    /// des deux-points — le dégradé retombait sur une seule couleur.
    func test_gradientValue_parsesTwoColorsFromColonSeparatedForm() {
        let parsed = StoryBackgroundValue.parse("gradient:FF0000:0000FF")
        guard case let .gradient(start, end) = parsed else {
            return XCTFail("attendu .gradient, obtenu \(parsed)")
        }
        XCTAssertEqual(start.uppercased(), "FF0000")
        XCTAssertEqual(end.uppercased(), "0000FF")
    }

    func test_solidValue_isNotParsedAsGradient() {
        let parsed = StoryBackgroundValue.parse("#112233")
        if case .gradient = parsed {
            XCTFail("une couleur unie ne doit pas être lue comme un dégradé")
        }
    }
}
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

```bash
./apps/ios/meeshy.sh test
```

- [ ] **Step 4 : Implémenter**

Remplacer le parsing maison de `+Canvas.swift:1636` par un appel à `StoryBackgroundValue`, avec ce commentaire :

```swift
        // Source de vérité unique : `StoryBackgroundValue` (forme
        // "gradient:RRGGBB:RRGGBB"). Le parsing maison splittait sur la
        // virgule et produisait un LinearGradient monochrome.
```

- [ ] **Step 5 : Vérifier le vert et committer**

```bash
./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift \
        apps/ios/MeeshyTests/Unit/Views/StoryViewerBackgroundParsingTests.swift
git commit -m "fix(ios/story): parser le dégradé de fond via StoryBackgroundValue

Le viewer splittait sur la virgule alors que la sérialisation utilise des
deux-points — le dégradé retombait silencieusement sur une seule couleur."
```

---

## Task 8 : Marquage « vue » après l'interlude

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/StoryViewedMarkingPolicy.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/StoryViewedMarkingPolicyTests.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:455-470` (`groupTransition`), `StoryViewerView.swift:1640-1670` (`dismissGroupIntro`, `skipGroupIntro`, `goBackToPreviousGroupFromIntro`)

**Interfaces:**
- Consumes: `showGroupIntro` (`StoryViewerView.swift:115`), `markCurrentViewed()` (`+Content.swift:920`).
- Produces:
  ```swift
  enum StoryViewedMarkingPolicy {
      static func shouldMarkNow(isGroupIntroVisible: Bool) -> Bool
  }
  ```

- [ ] **Step 1 : Écrire les tests qui échouent**

```swift
import XCTest
@testable import Meeshy

final class StoryViewedMarkingPolicyTests: XCTestCase {

    /// La story sous l'interlude n'est pas encore visible : la marquer vue
    /// pendant les 2,6 s la ferait disparaître de l'anneau « non vu » sans
    /// que l'utilisateur l'ait réellement vue.
    func test_shouldMarkNow_whenIntroVisible_isFalse() {
        XCTAssertFalse(StoryViewedMarkingPolicy.shouldMarkNow(isGroupIntroVisible: true))
    }

    func test_shouldMarkNow_whenIntroDismissed_isTrue() {
        XCTAssertTrue(StoryViewedMarkingPolicy.shouldMarkNow(isGroupIntroVisible: false))
    }
}
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

```bash
./apps/ios/meeshy.sh test
```

- [ ] **Step 3 : Implémenter la politique**

```swift
import Foundation

/// Décide si la story courante peut être marquée « vue » maintenant.
///
/// `markCurrentViewed()` était appelé depuis `groupTransition`, donc à
/// l'instant du swap de groupe — pendant les 2,6 s de l'interstitiel
/// d'identité, où la story n'est pas encore visible. Une story traversée
/// puis quittée était comptée comme vue.
enum StoryViewedMarkingPolicy {
    static func shouldMarkNow(isGroupIntroVisible: Bool) -> Bool {
        !isGroupIntroVisible
    }
}
```

- [ ] **Step 4 : Câbler dans `groupTransition` et à la sortie d'interlude**

Dans `+Content.swift`, `groupTransition` (~`:462`), remplacer l'appel direct :

```swift
        if StoryViewedMarkingPolicy.shouldMarkNow(isGroupIntroVisible: showGroupIntro) {
            markCurrentViewed()
        }
```

Puis dans `StoryViewerView.swift`, dans `dismissGroupIntro()` (~`:1667`) et `skipGroupIntro()` (~`:1646`), après avoir posé `showGroupIntro = false`, marquer la story réellement affichée :

```swift
        // L'interstitiel est levé : la story sous-jacente devient réellement
        // visible, c'est maintenant qu'elle compte comme vue.
        markCurrentViewed()
```

Ne rien marquer dans `goBackToPreviousGroupFromIntro()` — l'utilisateur repart sans avoir vu la story.

- [ ] **Step 5 : Build + tests + commit**

```bash
./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test
git add apps/ios/Meeshy/Features/Main/Views/StoryViewedMarkingPolicy.swift \
        apps/ios/MeeshyTests/Unit/Views/StoryViewedMarkingPolicyTests.swift \
        apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift \
        apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
git commit -m "fix(ios/story): marquer vue après l'interstitiel, pas pendant

markCurrentViewed() était appelé dans groupTransition, donc à l'instant du
swap — pendant les 2,6 s de l'interstitiel où la story n'est pas visible.
Un groupe traversé puis quitté voyait sa première story comptée vue.
Un retour arrière depuis l'interstitiel ne marque plus rien."
```

---

## Task 9 : Ordre non-vues — verrouiller par tests, consommer `banner` du payload

Le tri et l'index d'entrée fonctionnent déjà mais n'ont **aucun** test. On les verrouille avant d'y toucher.

**Files:**
- Create: `apps/ios/MeeshyTests/Unit/Views/StoryGroupOrderingTests.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (extraire `entryIndex` en fonction statique testable)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift:504-544` (`resolveGroupIntro` consomme `banner` du groupe si présent)

**Interfaces:**
- Consumes: `StoryGroup` (`StoryModels.swift:1896`), `banner` du payload (Task 1).
- Produces:
  ```swift
  extension StoryGroup {
      static func entryIndex(stories: [StoryItem], now: Date) -> Int
  }
  ```

- [ ] **Step 1 : Relever les factories de test existantes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
grep -rn "StoryItem(" apps/ios/MeeshyTests --include="*.swift" | head -5
grep -rn "StoryGroup(" apps/ios/MeeshyTests --include="*.swift" | head -5
```

Réutiliser les factories existantes ; ne pas redéfinir les types.

- [ ] **Step 2 : Écrire les tests qui échouent**

```swift
import XCTest
@testable import Meeshy
@testable import MeeshySDK

final class StoryGroupOrderingTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    /// Un groupe de 5 stories dont 3 vues démarre à la 4e.
    func test_entryIndex_withThreeViewedOfFive_startsAtFourth() {
        let stories = makeStories(viewedFlags: [true, true, true, false, false])
        XCTAssertEqual(StoryGroup.entryIndex(stories: stories, now: now), 3)
    }

    /// Si tout est vu, le groupe reprend à la première story.
    func test_entryIndex_whenAllViewed_startsAtZero() {
        let stories = makeStories(viewedFlags: [true, true, true])
        XCTAssertEqual(StoryGroup.entryIndex(stories: stories, now: now), 0)
    }

    func test_entryIndex_whenNoneViewed_startsAtZero() {
        let stories = makeStories(viewedFlags: [false, false])
        XCTAssertEqual(StoryGroup.entryIndex(stories: stories, now: now), 0)
    }

    /// Une non-vue expirée ne doit pas être choisie comme point d'entrée.
    func test_entryIndex_skipsExpiredUnviewed() {
        let stories = makeStories(viewedFlags: [true, false, false],
                                  expiredFlags: [false, true, false])
        XCTAssertEqual(StoryGroup.entryIndex(stories: stories, now: now), 2)
    }

    // Construire les StoryItem avec la factory du repo relevée au Step 1.
    private func makeStories(viewedFlags: [Bool],
                             expiredFlags: [Bool]? = nil) -> [StoryItem] {
        // À compléter avec la factory existante : chaque item porte
        // `isViewed = viewedFlags[i]` et une `expiresAt` antérieure à `now`
        // quand `expiredFlags?[i] == true`.
        fatalError("remplacer par la factory du repo relevée au Step 1")
    }
}
```

Remplacer le `fatalError` par la vraie factory **avant** de lancer — un plan ne laisse pas de placeholder dans le code livré ; celui-ci est explicitement à substituer au Step 1.

- [ ] **Step 3 : Lancer, vérifier l'échec**

```bash
./apps/ios/meeshy.sh test
```

Attendu : ÉCHEC — `StoryGroup.entryIndex(stories:now:)` n'existe pas.

- [ ] **Step 4 : Extraire `entryIndex` en fonction statique**

La logique vit aujourd'hui dans `StoryViewerView.swift:385-390`, non testable. La déplacer sur `StoryGroup` en conservant **exactement** le comportement :

```swift
public extension StoryGroup {
    /// Index de la story par laquelle entrer dans ce groupe.
    ///
    /// Première non-vue non expirée ; à défaut première non expirée ; à défaut 0.
    /// Un groupe entièrement vu redémarre donc au début.
    static func entryIndex(stories: [StoryItem], now: Date) -> Int {
        if let i = stories.firstIndex(where: { !$0.isViewed && !$0.isExpired(at: now) }) { return i }
        if let i = stories.firstIndex(where: { !$0.isExpired(at: now) }) { return i }
        return 0
    }
}
```

Puis faire déléguer `StoryViewerView.entryIndex(of:)` à cette fonction.

- [ ] **Step 5 : Consommer `banner` du payload dans l'interlude**

Dans `StoryViewModel.resolveGroupIntro(for:)` (~`:504`), utiliser la bannière portée par le groupe si elle est présente, avant de tomber sur `UserService.getProfile` :

```swift
        // `banner` voyage désormais avec le payload stories (storyAuthorSelect).
        // Le fetch profil ne reste qu'en repli pour les clients servis par un
        // gateway non encore déployé.
```

Vérifier que `StoryGroup` porte bien le champ ; sinon l'ajouter au mapping `toStoryGroups` (`StoryModels.swift:1994`).

- [ ] **Step 6 : Vérifier le vert et committer**

```bash
./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift \
        apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift \
        apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift \
        apps/ios/MeeshyTests/Unit/Views/StoryGroupOrderingTests.swift
git commit -m "test(ios/story): verrouiller l'ordre non-vues, consommer banner du payload

entryIndex vivait dans une vue non instanciable en test et n'avait aucune
couverture. Extrait sur StoryGroup à comportement identique : première
non-vue non expirée, sinon première non expirée, sinon 0.

L'interstitiel lit la bannière du payload et ne garde le fetch profil
qu'en repli."
```

---

## Task 10 : `MeeshySheetStyle` — primitive de sheet partagée

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/MeeshySheetStyle.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptivePresentationStyle.swift:10` (retirer `StoryTimelinePresentationStyle`, orphelin — 0 call-site)
- Test: `packages/MeeshySDK/Tests/.../MeeshySheetStyleTests.swift`

**Interfaces:**
- Consumes: `AudiencePickerPresentationStyle` (`Compatibility/AudiencePickerPresentation.swift:18`) comme modèle.
- Produces: `func meeshySheet(detents:) -> some View` (modifier `View`), consommé par la Task 11.

- [ ] **Step 1 : Lire le modèle existant**

```bash
cd /Users/smpceo/Documents/v2_meeshy
sed -n '1,60p' packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AudiencePickerPresentation.swift
sed -n '1,40p' packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptivePresentationStyle.swift
grep -rn "StoryTimelinePresentationStyle" packages/ apps/ | grep -v Binary
```

Confirmer que `StoryTimelinePresentationStyle` n'a bien aucun call-site avant de le retirer.

- [ ] **Step 2 : Écrire le test des detents par défaut**

```swift
import XCTest
@testable import MeeshyUI

final class MeeshySheetStyleTests: XCTestCase {

    /// Un inspecteur de piste doit laisser le playhead et les pistes visibles :
    /// le detent par défaut ne couvre pas tout l'écran.
    func test_inspectorDetents_leaveTimelineVisible() {
        XCTAssertEqual(MeeshySheetStyle.inspectorFraction, 0.45, accuracy: 0.0001)
        XCTAssertLessThan(MeeshySheetStyle.inspectorFraction, 0.6)
    }
}
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

```bash
./apps/ios/meeshy.sh test
```

- [ ] **Step 4 : Implémenter la primitive**

```swift
import SwiftUI

/// Présentation standard des sheets Meeshy.
///
/// Les surfaces de configuration étaient des ZStack maison (scrim +
/// DragGesture + hauteur calculée), ce qui imposait une guerre de zIndex et
/// des `ignoresSafeArea` en cascade. Cette primitive centralise ce que
/// `AudiencePickerPresentationStyle` faisait déjà correctement, gating
/// iOS 16.4 compris.
enum MeeshySheetStyle {
    /// Fraction d'écran d'un inspecteur : laisse le playhead et les pistes
    /// visibles pendant la configuration.
    static let inspectorFraction: CGFloat = 0.45
}

extension View {
    /// Sheet Meeshy standard : detents, poignée, matériau, coins.
    func meeshySheet(detents: Set<PresentationDetent>) -> some View {
        self
            .presentationDetents(detents)
            .presentationDragIndicator(.visible)
            .presentationBackground(.ultraThinMaterial)
            .presentationContentInteraction(.scrolls)
            .presentationCornerRadius(28)
    }

    /// Sheet d'inspecteur : hauteur qui préserve la visibilité de la timeline.
    func meeshyInspectorSheet() -> some View {
        meeshySheet(detents: [.fraction(MeeshySheetStyle.inspectorFraction), .large])
    }
}
```

Vérifier le floor de déploiement du package : `presentationBackground` et `presentationCornerRadius` exigent iOS 16.4. Si le floor est plus bas, reprendre le gating `if #available` de `AudiencePickerPresentationStyle`.

- [ ] **Step 5 : Vérifier le vert et committer**

```bash
./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test
git add packages/MeeshySDK/Sources/MeeshyUI/Compatibility/
git commit -m "feat(sdk/ui): MeeshySheetStyle, primitive de sheet partagée

Centralise ce que AudiencePickerPresentationStyle faisait déjà bien
(detents, poignée, matériau, coins, gating iOS 16.4) et absorbe
StoryTimelinePresentationStyle, resté orphelin sans call-site."
```

---

## Task 11 : Inspecteurs timeline en sheet

`TimelineInspectorHost` est monté en `.overlay(alignment: .bottomTrailing)` (`StoryTimelineView.swift:358`) et `ClipInspector` fait jusqu'à 360 pt de large (`ClipInspector.swift:302`) — il recouvre les pistes qu'il édite. `InspectorPresentation` déclare un style `.popover` derrière lequel il n'existe aucun `.popover()` SwiftUI.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/StoryTimelineView.swift:355-365`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineInspectorHost.swift:11, 233, 281, 322`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/InspectorPresentation.swift:6`

**Interfaces:**
- Consumes: `meeshyInspectorSheet()` (Task 10).
- Produces: rien de nouveau.

- [ ] **Step 1 : Lire la structure de l'hôte et l'identité de sélection**

```bash
cd /Users/smpceo/Documents/v2_meeshy
sed -n '1,60p' packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineInspectorHost.swift
sed -n '350,370p' packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/StoryTimelineView.swift
sed -n '1,40p' packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/InspectorPresentation.swift
```

Identifier ce qui pilote l'ouverture (sélection de clip / keyframe / transition) — c'est ce qui devient l'`item` du `.sheet(item:)`.

- [ ] **Step 2 : Écrire le test de garde**

Le montage SwiftUI n'est pas directement testable ; verrouiller par analyse de source, comme le fait déjà `StoryGroupIntroOverlayGuardTests`. Créer `packages/MeeshySDK/Tests/.../TimelineInspectorPresentationGuardTests.swift` :

```swift
import XCTest

/// L'inspecteur recouvrait les pistes qu'il édite (overlay bottomTrailing,
/// jusqu'à 360 pt de large). Il doit être présenté en sheet, avec un detent
/// qui laisse le playhead visible.
final class TimelineInspectorPresentationGuardTests: XCTestCase {

    func test_timelineView_doesNotMountInspectorAsOverlay() throws {
        let source = try sourceText("StoryTimelineView.swift")
        XCTAssertFalse(source.contains("TimelineInspectorHost")
                       && source.contains(".overlay(alignment: .bottomTrailing)"),
                       "l'inspecteur ne doit plus être un overlay sur les pistes")
    }

    func test_inspectorHost_usesMeeshyInspectorSheet() throws {
        let source = try sourceText("TimelineInspectorHost.swift")
        XCTAssertTrue(source.contains("meeshyInspectorSheet"),
                      "l'inspecteur doit utiliser la primitive de sheet partagée")
    }

    private func sourceText(_ fileName: String) throws -> String {
        // Résoudre depuis #filePath vers Sources/, comme les guards existants.
        // Reprendre exactement l'helper de StoryGroupIntroOverlayGuardTests.
        fatalError("remplacer par l'helper de résolution des guards existants")
    }
}
```

Remplacer le `fatalError` par l'helper réellement utilisé par les guards du repo avant de lancer.

- [ ] **Step 3 : Lancer, vérifier l'échec**

```bash
./apps/ios/meeshy.sh test
```

- [ ] **Step 4 : Migrer le montage**

Dans `StoryTimelineView.swift`, remplacer l'`.overlay(alignment: .bottomTrailing) { TimelineInspectorHost(...) }` par une présentation en sheet pilotée par la sélection :

```swift
        .sheet(item: $inspectorSelection) { selection in
            TimelineInspectorHost(selection: selection, /* … dépendances existantes … */)
                .meeshyInspectorSheet()
        }
```

Adapter au type de sélection réel relevé au Step 1 (il doit être `Identifiable` ; l'y conformer si nécessaire). Dans `InspectorPresentation.swift`, retirer le cas `.popover` qui ne correspondait à aucun `.popover()` réel, ou le renommer pour refléter ce qu'il fait vraiment (padding / corner / maxWidth).

- [ ] **Step 5 : Vérifier le vert et committer**

```bash
./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ \
        packages/MeeshySDK/Tests/
git commit -m "refactor(sdk/timeline): inspecteurs en sheet au lieu d'overlay

TimelineInspectorHost était monté en overlay bottomTrailing et ClipInspector
fait jusqu'à 360 pt — l'inspecteur recouvrait les pistes qu'il édite.
Présenté en sheet avec un detent 0.45 qui laisse playhead et pistes visibles.

InspectorPresentation déclarait un style .popover derrière lequel il n'y
avait aucun .popover() SwiftUI."
```

---

## Task 12 : Validation E2E sur `Meeshy-iOS26` + déploiement gateway

**Files:**
- Create: `tasks/story-sync-e2e-checklist-2026-07-25.md`

**Interfaces:**
- Consumes: toutes les tâches précédentes.
- Produces: la checklist renseignée avec les preuves visuelles.

- [ ] **Step 1 : Suite complète verte**

```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh test
```

Lire le `.xcresult` — l'exit code n'est pas fiable. Un « TEST FAILED » masque souvent une erreur de compilation, et les erreurs Swift 6.2 s'empilent (le premier lot masque les suivants).

- [ ] **Step 2 : Build et installation sur le simulateur**

```bash
./apps/ios/meeshy.sh build
xcrun simctl install C295B364-8CA6-4214-BC52-E411A97EBFE2 <chemin .app produit>
xcrun simctl launch C295B364-8CA6-4214-BC52-E411A97EBFE2 me.meeshy.app
```

`simctl install` préserve session et keychain. `meeshy.sh build` auto-incrémente la version ; ne pas s'en étonner.

- [ ] **Step 3 : Composer une story de test à éléments décalés**

Créer une story portant au moins : un texte à `startTime = 0`, un texte à `startTime = 3 s`, un sticker à `startTime = 5 s` avec `fadeIn`, et une durée pinnée à 8 s via le timeline editor. Jouer le preview et capturer à t = 1 s, 4 s, 6 s.

- [ ] **Step 4 : Publier puis relire, capturer aux mêmes instants**

Ouvrir la story publiée depuis le viewer et capturer à t = 1 s, 4 s, 6 s. Les paires doivent correspondre — c'est le critère de succès n° 1.

- [ ] **Step 5 : Dérouler la checklist**

Créer `tasks/story-sync-e2e-checklist-2026-07-25.md` et renseigner chaque ligne avec sa preuve :

```markdown
# Checklist E2E — Story sync (2026-07-25)

Simulateur : Meeshy-iOS26 · C295B364-8CA6-4214-BC52-E411A97EBFE2

## Synchronisation composition ↔ lecture
- [ ] Texte à startTime=0 visible dès t=0 dans le viewer
- [ ] Texte à startTime=3s absent à t=1s, présent à t=4s
- [ ] Sticker à startTime=5s : fadeIn visible, pas d'apparition brutale
- [ ] Captures preview vs viewer aux mêmes t : identiques
- [ ] Barre à 100 % exactement à la fin de la timeline pinnée (8 s)

## Pause / reprise
- [ ] Long-press : barre, canvas, vidéo et audio gelés ensemble
- [ ] Relâchement : reprise depuis la position figée, sans saut
- [ ] Long-press en toute fin de slide : pas d'auto-advance au relâchement
- [ ] Ouverture d'une sheet (langues, emoji) : même gel

## Interlude et ordre non-vues
- [ ] Passage d'auteur à auteur : interlude ~2,6 s, avatar et bannière, centré
- [ ] Pas d'interlude à l'ouverture depuis le tray (décision retenue)
- [ ] Groupe 5 stories dont 3 vues : démarre à la 4e
- [ ] Groupe entièrement vu : redémarre à la 1re
- [ ] Story sous l'interlude non marquée vue si on revient en arrière
- [ ] Transition fluide, sans saccade ni clignotement

## Transitions
- [ ] Slide sortante : pas de réapparition d'éléments hors fenêtre
- [ ] Pas de double scale sur la sortie
- [ ] Fond en dégradé : deux couleurs, pas monochrome

## Inspecteurs timeline
- [ ] Sélection d'un clip : sheet, playhead et pistes restent visibles
- [ ] Keyframe et transition : même sheet cohérente
- [ ] Aucun recouvrement des pistes éditées
```

Capturer une courte vidéo pour chaque section jugeant la fluidité (interlude, pause/reprise, transitions).

```bash
xcrun simctl io C295B364-8CA6-4214-BC52-E411A97EBFE2 recordVideo /tmp/story-interlude.mp4
```

- [ ] **Step 6 : Déployer le gateway**

Vérifier d'abord que la CI de la Task 1 a produit les images :

```bash
gh run list --limit 5
```

Puis, une fois vert :

```bash
ssh root@meeshy.me "cd /opt/meeshy/production && docker compose pull && docker compose up -d"
ssh root@meeshy.me "cd /opt/meeshy/production && docker compose ps"
```

Le `docker-compose.yml` de production **diverge** du repo (noms de conteneurs `meeshy-*`, images `isopen/*`) — ne jamais l'écraser depuis le repo. Compter ~30 s de healthcheck avant que Traefik ne route.

- [ ] **Step 7 : Vérifier `banner` en production**

```bash
curl -s -X POST https://gate.meeshy.me/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<user>","password":"<pass>"}' | jq -r '.data.token'
# puis, avec le token :
curl -s "https://gate.meeshy.me/api/v1/posts/stories?limit=5" \
  -H "Authorization: Bearer <token>" | jq '.data[0].author | keys'
```

Attendu : `banner` figure dans les clés. Identifiants dans `apps/ios/fastlane/.env` (hors dépôt).

- [ ] **Step 8 : Commit final**

```bash
git add tasks/story-sync-e2e-checklist-2026-07-25.md
git commit -m "docs(story): checklist E2E de validation de la synchronisation"
git push origin main
```

---

## Auto-revue du plan

**Couverture de la spec**

| Exigence de la spec | Tâche |
|---|---|
| WS0 — câbler `onPlaybackTime` | 3 |
| WS0 — timer esclave, repli | 2, 3 |
| WS0 — D9 armement timer | 4 |
| WS0 — pause unifiée, reprise en phase | 2 (règle), 12 (vérification) |
| WS0 — `StoryPlaybackClock` pure testable | 2 |
| WS1 — D5 canvas sortant `.play` | 5 |
| WS1 — D2/D3 closing unique, constantes | 6 |
| WS1 — D1 `applyOpening` | 6 |
| WS1 — D7 parsing dégradé | 7 |
| WS2 — marquage vue après interlude | 8 |
| WS2 — `banner` sans aller-retour | 1, 9 |
| WS2 — tests ordre non-vues | 9 |
| WS2 — interlude inter-groupes, 2,6 s | contrainte globale (aucun changement) |
| WS3 — `MeeshySheetStyle` | 10 |
| WS3 — inspecteurs en sheet | 11 |
| WS4 — TDD | chaque tâche |
| WS4 — checklist E2E, captures, vidéos | 12 |
| §4 — déploiement gateway | 1 (push), 12 (deploy) |
| §5 — canvas muet, durée nulle, interlude annulé | 2, 8 |

Aucune exigence sans tâche.

**Cohérence des types** — `StoryPlaybackClock.resolve` (Task 2) est appelé avec la même signature en Task 3. `StoryGroup.entryIndex(stories:now:)` (Task 9) porte le même nom partout. `meeshyInspectorSheet()` (Task 10) est consommé sous ce nom en Task 11. `StoryViewedMarkingPolicy.shouldMarkNow(isGroupIntroVisible:)` (Task 8) est utilisé à l'identique.

**Placeholders** — deux `fatalError` explicites (Tasks 9 et 11) marquent des helpers à substituer par les factories réelles du repo, relevées au premier step de leur tâche. Ils sont volontaires et bornés : le step les désigne nommément comme à remplacer avant exécution. Aucun autre TBD.
