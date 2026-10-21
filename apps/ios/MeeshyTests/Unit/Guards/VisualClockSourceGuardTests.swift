import XCTest
@testable import Meeshy

/// **Une valeur visuelle suit l'écran, pas un `Timer`** (#9883).
///
/// Un `Timer` n'est pas synchronisé avec le rafraîchissement ProMotion : à
/// 30 ou 60 Hz fixes il réveille le fil principal à côté de la cadence de
/// l'écran, et il continue de battre quand la valeur qu'il écrit ne change plus
/// (texte qui ne défile pas, liste sans vitesse, fête terminée). Les horloges
/// visuelles passent par `TimelineView(.animation(minimumInterval:paused:))` ou
/// par `CADisplayLink` (`WeakDisplayLinkTarget`, plage 30…60) : toutes deux
/// peuvent être MISES EN PAUSE, un `Timer` qu'on laisse tourner non.
///
/// La garde est écrite en deux temps, comme `PersistentEffectLifecycleSourceGuardTests` :
/// la détection est d'abord éprouvée sur des fragments littéraux (le fautif
/// d'avant le correctif doit être vu), puis appliquée aux fichiers réels.
///
/// Reste assumé hors garde : `SyncPill.dotTimer`, un battement DISCRET à 2 Hz
/// (points d'activité et parité du pouls), gardé par `SyncPillTimerStateTests`
/// et `TickedRepeatForeverAnimationSourceGuardTests`. Il est nommé ici, donc il
/// ne peut pas être rejoint par un second `Timer` sans que cette garde rougisse.
final class VisualClockSourceGuardTests: XCTestCase {

    // MARK: - 1. La détection, éprouvée sur des fragments

    /// Les lignes qui créent un `Timer`, hors battements discrets nommés.
    static func timerDrivers(in source: String) -> [String] {
        let creators = ["Timer.publish(", "Timer(timeInterval", "Timer.scheduledTimer("]
        return AppSourceGuard.strippedLines(source)
            .filter { line in creators.contains(where: line.contains) }
            .filter { !$0.contains("dotTimer") }
    }

    func test_theOldAudioTrimFragment_isSeen() {
        let before = "let timer = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in"
        XCTAssertEqual(Self.timerDrivers(in: before).count, 1,
                       "La détection laisse passer le Timer 60 Hz d'avant le correctif : elle ne mesure rien.")
    }

    func test_theOldMarqueeFragment_isSeen() {
        let before = "@State private var marqueeTimer = Timer.publish(every: 1.0 / 30.0, on: .main, in: .common).autoconnect()"
        XCTAssertEqual(Self.timerDrivers(in: before).count, 1)
    }

    func test_aTimerInAComment_isNotSeen() {
        XCTAssertTrue(Self.timerDrivers(in: "// Timer.publish(every: 0.5) était ici").isEmpty)
    }

    func test_theNamedDiscreteBeat_isTheOnlyAllowedTimer() {
        let beat = "@State private var dotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()"
        XCTAssertTrue(Self.timerDrivers(in: beat).isEmpty)
    }

    // MARK: - 2. Les fichiers réels

    private static let appFiles = [
        "Meeshy/Features/Main/Components/MessageEffectModifiers.swift",
        "Meeshy/Features/Main/Components/SyncPill.swift",
        "Meeshy/Features/Main/Views/ConversationListView+ChipDrag.swift",
        "Meeshy/Features/Auth/Arrival/ArrivalCelebrationView.swift",
    ]

    private static let sdkFiles = [
        "packages/MeeshySDK/Sources/MeeshyUI/Story/StickerMotionMark.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Media/AudioTrimPreviewPlayer.swift",
    ]

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine du dépôt
    }

    private func app(_ path: String) throws -> String {
        try AppSourceGuard.stripComments(AppSourceGuard.unit(path))
    }

    private func sdk(_ path: String) throws -> String {
        let source = try String(contentsOf: repoRoot().appendingPathComponent(path), encoding: .utf8)
        return AppSourceGuard.stripComments(source)
    }

    func test_noVisualClock_isDrivenByATimer() throws {
        let sources = try Self.appFiles.map { ($0, try app($0)) } + Self.sdkFiles.map { ($0, try sdk($0)) }
        XCTAssertEqual(sources.count, 6)
        for (path, source) in sources {
            XCTAssertFalse(source.isEmpty, "\(path) est illisible : la garde ne vise plus rien.")
            XCTAssertEqual(
                Self.timerDrivers(in: source), [],
                "\(path) pilote une valeur visuelle par un Timer. Utiliser TimelineView(.animation(minimumInterval:paused:)) "
                + "ou WeakDisplayLinkTarget.makeLink(frameRateRange: .clock)."
            )
        }
    }

    // MARK: - 3. Le halo de lueur : flou posé une fois, seule l'opacité s'anime

    private func block(_ declaration: String, in source: String) throws -> String {
        let start = try XCTUnwrap(source.range(of: declaration), "`\(declaration)` a disparu.")
        let rest = source[start.upperBound...]
        let boundaries = ["\nstruct ", "\nprivate struct ", "\nnonisolated enum ", "\nextension ", "\n// MARK: -"]
        let end = boundaries.compactMap { rest.range(of: $0)?.lowerBound }.min() ?? rest.endIndex
        return String(source[start.lowerBound..<end])
    }

    func test_glowEffect_blursItsHaloOnce_andAnimatesOnlyTheOpacity() throws {
        let glow = try block("struct GlowEffect", in: try app("Meeshy/Features/Main/Components/MessageEffectModifiers.swift"))
        XCTAssertFalse(glow.contains(".shadow("),
                       "Le halo est de nouveau une `.shadow` : son rayon animé force un nouveau flou à chaque image.")
        XCTAssertTrue(glow.contains(".blur(radius: GlowHalo.blurRadius)"),
                      "Le halo n'est plus flouté par un rayon CONSTANT.")
        XCTAssertTrue(glow.contains(".opacity(GlowHalo.opacity("),
                      "L'opacité du halo ne vient plus de la loi `GlowHalo.opacity`.")
        XCTAssertFalse(glow.contains("radius: glowing"), "Le rayon dépend de l'état animé.")
    }

    // MARK: - 4. La comète : une seule passe hors écran, flou non coupé

    func test_cometLayer_isRasterisedOnce_withRoomForItsBlur() throws {
        let comet = try block("struct RainbowCometLayer", in: try app("Meeshy/Features/Main/Components/MessageEffectModifiers.swift"))
        XCTAssertTrue(comet.contains(".drawingGroup()"),
                      "La comète empile de nouveau ses flous (deux par segment) sans passe unique.")
        XCTAssertTrue(comet.contains(".padding(-RainbowCometBleed.margin)"),
                      "`drawingGroup` coupe aux bornes de la vue : sans marge négative le flou de la comète est tronqué.")
    }

    // MARK: - 5. Le marquee de la pastille

    func test_syncPill_marqueeFollowsTheScreen_andOnlyWhileItScrolls() throws {
        let source = try app("Meeshy/Features/Main/Components/SyncPill.swift")
        XCTAssertFalse(source.contains("marqueeTimer"), "Le marquee repasse par un Timer.")
        XCTAssertFalse(source.contains("marqueeOffset"),
                       "Le décalage redevient un @State écrit à chaque tic : 30 réévaluations par seconde du chrome.")
        XCTAssertTrue(source.contains("TimelineView(.animation(minimumInterval:"),
                      "Le marquee n'est plus porté par une TimelineView.")
        XCTAssertTrue(source.contains("paused: isPausedByUser"),
                      "La pause utilisateur (WCAG 2.2.2) ne met plus l'horloge en pause.")
        XCTAssertTrue(source.contains("SyncPillMarquee.offset("),
                      "Le décalage ne vient plus de la loi pure du temps écoulé.")
    }

    // MARK: - 6. L'auto-scroll de la chip

    func test_chipAutoScroll_followsTheDisplay_andSleepsAtZeroSpeed() throws {
        let source = try app("Meeshy/Features/Main/Views/ConversationListView+ChipDrag.swift")
        XCTAssertTrue(source.contains("WeakDisplayLinkTarget.makeLink(frameRateRange: .clock)"),
                      "Le pilote n'est plus un CADisplayLink à proxy faible sur l'horloge 30…60 (`.clock`).")
        XCTAssertTrue(source.contains("ChipAutoScroll.displacement("),
                      "Le pas n'est plus le temps RÉEL écoulé (loi `displacement`) mais une fraction nominale.")
        XCTAssertTrue(source.contains("isPaused"),
                      "Le link tourne de nouveau à vitesse nulle : il doit se mettre en pause.")
    }

    // MARK: - 7. La fête de l'arrivée

    func test_arrivalFireworks_pauseTheirClock_onceTheShowIsOver() throws {
        let source = try app("Meeshy/Features/Auth/Arrival/ArrivalCelebrationView.swift")
        XCTAssertTrue(source.contains("TimelineView(.animation(paused: isOver))"),
                      "Le feu d'artifice bat encore à la cadence de l'écran après sa dernière gerbe.")
        XCTAssertTrue(source.contains("ArrivalFireworks.isOver(at:"),
                      "La fin du spectacle ne vient plus de la loi du temps.")
    }

    // MARK: - 8. Le SDK : lecture du rognage et vignettes animées

    func test_audioTrimPreview_followsTheDisplay() throws {
        let source = try sdk("packages/MeeshySDK/Sources/MeeshyUI/Media/AudioTrimPreviewPlayer.swift")
        XCTAssertTrue(source.contains("WeakDisplayLinkTarget.makeLink(frameRateRange: .clock)"),
                      "La lecture du rognage ne suit plus l'horloge 30…60 (`.clock`).")
        XCTAssertFalse(source.contains("Task { @MainActor"),
                       "Une `Task` par tic est de retour : l'horloge d'affichage est déjà sur le fil principal.")
    }

    func test_stickerMotionPreview_pausesOnceSettledOrOffScreen() throws {
        let source = try sdk("packages/MeeshySDK/Sources/MeeshyUI/Story/StickerMotionMark.swift")
        XCTAssertTrue(source.contains("paused: isSettled || !isOnScreen"),
                      "La vignette anime encore après son dernier mouvement ou hors de l'écran.")
        XCTAssertTrue(source.contains("settlesAfter"),
                      "La fin d'un mouvement en un coup ne vient plus de `StickerAnimation.settlesAfter`.")
    }
}
