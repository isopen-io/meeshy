import XCTest
import MeeshySDK
@testable import MeeshyUI

/// L'export timeline coupait la lecture de la preview (`start()`) sans
/// JAMAIS la relancer — aucune des trois sorties (fin, échec, annulation) ne
/// reprenait le transport, laissant la timeline muette derrière l'aperçu
/// plein écran ou après un « Annuler ». Ces tests verrouillent la reprise
/// sur les trois chemins, et sa NON-reprise quand la timeline était déjà à
/// l'arrêt avant l'export (ne pas la faire démarrer toute seule).
@MainActor
final class TimelineExportPlaybackResumeTests: XCTestCase {

    private func makeComposer() -> StoryComposerViewModel {
        StoryComposerViewModel()
    }

    /// Draine la file du MainActor un nombre BORNÉ de fois — même patron que
    /// `TimelineExportParityTests.drainMainActorQueue` (autre fichier, donc
    /// inaccessible d'ici) : assez pour qu'une continuation déjà relâchée
    /// atteigne son point de reprise. Pas d'assertion temporelle.
    private func drainMainActorQueue() async {
        for _ in 0..<200 { await Task.yield() }
    }

    // MARK: - Fin d'export

    func test_finished_resumesPlayback_whenItWasPlayingBeforeExport() async {
        let composer = makeComposer()
        composer.timelineViewModel.togglePlayback()
        XCTAssertTrue(composer.timelineViewModel.isPlaying, "précondition : la timeline doit jouer avant l'export")

        let exporter = SpyTimelineStoryExporter()
        let controller = TimelineExportController(
            exporter: exporter,
            usernameProvider: { nil },
            introProvider: { nil }
        )

        controller.start(composer: composer)
        XCTAssertFalse(composer.timelineViewModel.isPlaying,
                       "start() doit couper la lecture pour lancer le bake")

        await exporter.waitForCall()
        await drainMainActorQueue()

        XCTAssertTrue(composer.timelineViewModel.isPlaying,
                      "la fin de l'export doit relancer la lecture qui jouait avant")
    }

    func test_finished_doesNotResumePlayback_whenItWasNotPlayingBeforeExport() async {
        let composer = makeComposer()
        XCTAssertFalse(composer.timelineViewModel.isPlaying, "précondition : la timeline est à l'arrêt")

        let exporter = SpyTimelineStoryExporter()
        let controller = TimelineExportController(
            exporter: exporter,
            usernameProvider: { nil },
            introProvider: { nil }
        )

        controller.start(composer: composer)
        await exporter.waitForCall()
        await drainMainActorQueue()

        XCTAssertFalse(composer.timelineViewModel.isPlaying,
                       "une timeline déjà arrêtée avant l'export ne doit pas se mettre à jouer seule")
    }

    // MARK: - Échec d'export

    func test_failed_resumesPlayback_whenItWasPlayingBeforeExport() async {
        let composer = makeComposer()
        composer.timelineViewModel.togglePlayback()

        let exporter = SpyTimelineStoryExporter()
        exporter.errorToThrow = StubExportError()
        let controller = TimelineExportController(
            exporter: exporter,
            usernameProvider: { nil },
            introProvider: { nil }
        )

        controller.start(composer: composer)
        await exporter.waitForCall()
        await drainMainActorQueue()

        if case .failed = controller.phase {} else {
            XCTFail("l'export doit se solder par .failed quand l'exporteur lève une erreur")
        }
        XCTAssertTrue(composer.timelineViewModel.isPlaying,
                      "un export en échec doit tout de même relancer la lecture qui jouait avant")
    }

    // MARK: - Annulation

    /// Annulation PENDANT la résolution d'identité — même scénario que
    /// `TimelineExportParityTests.test_timelineExport_cancelledDuringIdentityResolution_neverStartsTheExport`,
    /// augmenté de l'assertion de reprise de lecture.
    func test_cancel_resumesPlayback_whenItWasPlayingBeforeExport() async {
        let composer = makeComposer()
        composer.timelineViewModel.togglePlayback()

        let exporter = SpyTimelineStoryExporter()
        let resolver = ManualIntroResolver()
        let controller = TimelineExportController(
            exporter: exporter,
            usernameProvider: { "alice" },
            introProvider: { await resolver.resolve() },
            introTimeout: .seconds(5)
        )

        controller.start(composer: composer)
        await resolver.waitUntilSuspended()
        XCTAssertFalse(composer.timelineViewModel.isPlaying, "start() doit avoir coupé la lecture")

        controller.cancel()

        XCTAssertTrue(composer.timelineViewModel.isPlaying,
                      "annuler doit relancer la lecture qui jouait avant l'export")

        resolver.release()
        await drainMainActorQueue()
        XCTAssertEqual(exporter.callCount, 0, "l'export annulé ne doit jamais atteindre l'exporteur")
    }

    func test_cancel_doesNotResumePlayback_whenItWasNotPlayingBeforeExport() async {
        let composer = makeComposer()

        let exporter = SpyTimelineStoryExporter()
        let resolver = ManualIntroResolver()
        let controller = TimelineExportController(
            exporter: exporter,
            usernameProvider: { "alice" },
            introProvider: { await resolver.resolve() },
            introTimeout: .seconds(5)
        )

        controller.start(composer: composer)
        await resolver.waitUntilSuspended()

        controller.cancel()

        XCTAssertFalse(composer.timelineViewModel.isPlaying,
                       "annuler ne doit jamais démarrer une lecture qui n'avait pas cours")

        resolver.release()
        await drainMainActorQueue()
    }
}

// MARK: - Doubles

/// Erreur neutre pour piloter le chemin `.failed`.
private struct StubExportError: Error {}

/// Capture les entrées reçues par `TimelineExportController.start(composer:)`
/// et peut être configurée pour échouer (`errorToThrow`). Jumeau de
/// `TimelineExportParityTests.SpyTimelineStoryExporter` (autre fichier, donc
/// inaccessible d'ici) : même contrat, augmenté de la capacité à lever une
/// erreur pour couvrir le chemin `.failed`.
@MainActor
private final class SpyTimelineStoryExporter: TimelineStoryExporting {
    private(set) var callCount = 0
    var errorToThrow: Error?
    private var continuation: CheckedContinuation<Void, Never>?

    func export(
        slide: StorySlide,
        to outputURL: URL,
        watermark: StoryExportWatermark?,
        intro: StoryExportIntroContent?,
        audioResolver: (@Sendable (StoryAudioPlayerObject) -> URL?)?,
        progress: ((Double) -> Void)?
    ) async throws -> URL {
        callCount += 1
        continuation?.resume()
        continuation = nil
        if let errorToThrow { throw errorToThrow }
        return outputURL
    }

    func waitForCall() async {
        if callCount > 0 { return }
        await withCheckedContinuation { continuation = $0 }
    }
}

/// Résolution d'identité pilotable : `resolve()` suspend jusqu'à ce que le
/// test appelle `release(_:)`, et `waitUntilSuspended()` donne au test un
/// point de synchronisation déterministe. Jumeau de
/// `TimelineExportParityTests.ManualIntroResolver` (autre fichier, donc
/// inaccessible d'ici).
@MainActor
private final class ManualIntroResolver {

    private var pending: CheckedContinuation<StoryExportIntroContent?, Never>?
    private var suspensionWaiter: CheckedContinuation<Void, Never>?
    private var releasedValue: StoryExportIntroContent?
    private var hasReleased = false
    private(set) var isSuspended = false

    func resolve() async -> StoryExportIntroContent? {
        if hasReleased { return releasedValue }
        return await withCheckedContinuation { continuation in
            pending = continuation
            isSuspended = true
            suspensionWaiter?.resume()
            suspensionWaiter = nil
        }
    }

    func waitUntilSuspended() async {
        if isSuspended { return }
        await withCheckedContinuation { suspensionWaiter = $0 }
    }

    func release(_ content: StoryExportIntroContent? = nil) {
        hasReleased = true
        releasedValue = content
        isSuspended = false
        pending?.resume(returning: content)
        pending = nil
    }
}
