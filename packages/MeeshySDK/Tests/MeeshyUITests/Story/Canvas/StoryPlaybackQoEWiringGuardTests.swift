import XCTest

/// #11287 — garde de source : les sites qui branchent la QoE sur la
/// lecture d'une story (le comportement AVFoundation n'est pas observable ici).
final class StoryPlaybackQoEWiringGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Canvas/
            .deletingLastPathComponent()   // Story/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_theLayer_notifiesTheAttach_throughTheSessionOpener() throws {
        let playback = try source("Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer+Playback.swift")
        XCTAssertTrue(playback.contains("notifyPlayerAttached()"))
        XCTAssertEqual(playback.components(separatedBy: "onPlayerAttached?()").count - 1, 1,
                       "l'attache passe par `notifyPlayerAttached`, qui ouvre la session avant de prévenir le canvas")
    }

    func test_dismantle_closesTheSession() throws {
        let layer = try source("Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift")
        XCTAssertTrue(layer.contains("releaseBackgroundPlayer()"))
        let playback = try source("Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer+Playback.swift")
        XCTAssertTrue(playback.contains("playbackQoE.finish(reason: .swiped)"))
        XCTAssertTrue(playback.contains("playbackQoE.finish(reason: .backgrounded)"))
        let reader = try source("Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift")
        XCTAssertTrue(reader.contains("static func dismantleUIView"))
    }

    func test_reader_resolvesItsTarget_fromWhatTheHostDeclares() throws {
        let src = try source("Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift")
        XCTAssertEqual(src.components(separatedBy: "view.backgroundLayer.declarePlaybackQoETarget(playbackQoETarget(in: context))").count - 1, 2,
                       "le montage ET un changement d'identité résolvent la cible par la même loi")
        XCTAssertTrue(src.contains("context.environment.readsPublishedStories"))
        XCTAssertFalse(src.contains("kind: .story, id: storyItem.id"),
                       "l'identité servie au canvas n'est pas la story : elle est composée par le lecteur de scènes")
    }

    func test_scenePlayer_measuresTheCarrier_notTheComposedIdentity() throws {
        let src = try source("Sources/MeeshyUI/Story/ScenePlayer/MeeshyScenePlayer.swift")
        XCTAssertTrue(src.contains("reader.playbackQoEStoryId = carrier?.id"))
    }

    /// Seul le lecteur des stories PUBLIÉES déclare la surface ; l'aperçu du
    /// composer, monté dans le même fichier, ne la déclare pas.
    func test_onlyThePublishedStoryViewer_declaresTheSurface() throws {
        let src = try source("../../apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift")
        XCTAssertEqual(src.components(separatedBy: ".environment(\\.readsPublishedStories, true)").count - 1, 1)
        let preview = try XCTUnwrap(src.range(of: "struct StoryPreviewReader"))
        XCTAssertFalse(src[preview.lowerBound...].contains("readsPublishedStories"))
    }

    /// `StoryCanvasUIView` est hors budget de cohésion : la QoE ne l'étend pas.
    func test_theCanvas_carriesNoPlaybackQoEWiring() throws {
        let canvasDir = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/Canvas")
        let files = try FileManager.default.contentsOfDirectory(atPath: canvasDir.path)
            .filter { $0.hasPrefix("StoryCanvasUIView") && $0.hasSuffix(".swift") }
        XCTAssertFalse(files.isEmpty)
        for file in files {
            let src = try String(contentsOf: canvasDir.appendingPathComponent(file), encoding: .utf8)
            XCTAssertFalse(src.contains("playbackQoE"), file)
        }
    }

    func test_observer_attachesItemObserversLate_forALoopedQueuePlayer() throws {
        let src = try source("Sources/MeeshyUI/Media/PlaybackQoEObserver.swift")
        XCTAssertTrue(src.contains("publisher(for: \\.currentItem"))
    }
}
