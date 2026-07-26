import XCTest
import MeeshySDK
@testable import MeeshyUI

/// Garde de parité (Task 9, 2026-07-26) : TOUT chemin d'export de story doit
/// fournir filigrane ET interlude à l'exporteur. Sans ce test, un chemin
/// d'export pourrait réintroduire silencieusement la divergence constatée le
/// 2026-07-26 : l'export de l'outil timeline sortait un MP4 SANS interlude
/// de marque et avec un filigrane amputé du pseudo, alors que les trois
/// autres chemins (`StoryPhotoSaveService`, `StoryExportShareViewModel`,
/// `StoryVideoExportService`) les portaient tous les deux.
///
/// Vérifie les ENTRÉES passées à l'exporteur, pas des pixels : c'est ce qui a
/// régressé (l'appelant a-t-il transmis watermark/intro), pas « le rendu
/// final est-il visuellement correct » — déjà couvert par
/// `StoryExportBrandedEndToEndTests` et `StoryExporter_WatermarkTests`.
@MainActor
final class TimelineExportParityTests: XCTestCase {

    private func makeComposer() -> StoryComposerViewModel {
        StoryComposerViewModel()
    }

    /// Le cœur de la garde : quand une identité est résolue, elle doit
    /// atteindre l'exporteur — EXACTEMENT comme le filigrane.
    func test_timelineExport_passesWatermarkAndIntroToExporter() async {
        let exporter = SpyTimelineStoryExporter()
        let expectedIntro = StoryExportIntroContent(displayName: "Alice", username: "alice",
                                                    accentColorHex: "4ECDC4")
        let controller = TimelineExportController(exporter: exporter, introProvider: { expectedIntro })

        controller.start(composer: makeComposer())
        await exporter.waitForCall()

        XCTAssertNotNil(exporter.lastWatermark, "l'export timeline doit graver le filigrane")
        XCTAssertNotNil(exporter.lastIntro, "l'export timeline doit graver l'interlude de marque")
        XCTAssertEqual(exporter.lastIntro?.username, "alice",
                       "l'interlude doit porter l'identité résolue, pas une valeur par défaut")
    }

    /// Sans identité résolue (pas de session), l'interlude est légitimement
    /// absent — même dégradation gracieuse que les 3 autres chemins — mais
    /// le FILIGRANE, lui, ne dépend d'aucune session : il doit rester présent
    /// dans tous les cas. Une régression qui omettrait le filigrane pour une
    /// raison indépendante de l'identité serait invisible au premier test.
    func test_timelineExport_withoutIdentity_stillCarriesTheWatermark() async {
        let exporter = SpyTimelineStoryExporter()
        let controller = TimelineExportController(exporter: exporter, introProvider: { nil })

        controller.start(composer: makeComposer())
        await exporter.waitForCall()

        XCTAssertNotNil(exporter.lastWatermark,
                        "le filigrane Meeshy doit toujours être gravé, identité résolue ou non")
        XCTAssertNil(exporter.lastIntro, "sans identité résolue, l'interlude est absent — pas simulé")
    }
}

// MARK: - Double

/// Capture les entrées reçues par `TimelineExportController.start(composer:)`
/// sans toucher AVFoundation — `start()` n'est pas `async` (il lance un
/// `Task` interne), d'où l'attente par continuation plutôt qu'un simple
/// `await`.
@MainActor
private final class SpyTimelineStoryExporter: TimelineStoryExporting {
    private(set) var lastWatermark: StoryExportWatermark?
    private(set) var lastIntro: StoryExportIntroContent?
    private(set) var callCount = 0
    private var continuation: CheckedContinuation<Void, Never>?

    func export(
        slide: StorySlide,
        to outputURL: URL,
        watermark: StoryExportWatermark?,
        intro: StoryExportIntroContent?,
        audioResolver: (@Sendable (StoryAudioPlayerObject) -> URL?)?,
        progress: ((Double) -> Void)?
    ) async throws -> URL {
        lastWatermark = watermark
        lastIntro = intro
        callCount += 1
        continuation?.resume()
        continuation = nil
        return outputURL
    }

    /// Suspend jusqu'au premier appel à `export`, ou retourne immédiatement
    /// s'il a déjà eu lieu — évite une course si `start()` a déjà résolu
    /// avant que le test n'observe.
    func waitForCall() async {
        if callCount > 0 { return }
        await withCheckedContinuation { continuation = $0 }
    }
}
