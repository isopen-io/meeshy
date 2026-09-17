import XCTest
import UIKit
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// **#6757 — un clip de premier plan qui finit AVANT sa fenêtre reste à l'écran,
/// et ne se lit plus comme un stall.**
///
/// La story de recette pose un clip de 6,000 s sur un panorama. La timeline de la
/// slide gèle (chargement du fond, stall) pendant que l'AVPlayer, lui, roule : le
/// clip atteint la fin de son ITEM alors que sa FENÊTRE (`startTime ..< startTime
/// + duration`, `StoryRenderer.shouldRender`) est encore ouverte. Trois défauts
/// s'enchaînaient, et la pause les figeait (captures 244 à 247) :
/// - la couche se masquait à la fin de l'item — le panorama seul restait ;
/// - le clip fini restait le « média primaire » : sa pause de fin se lisait comme
///   un stall — spinner, timeline gelée ;
/// - le recalage (reprise, self-heal) le ramenait au playhead et le rejouait.
@MainActor
final class ReaderFinishedClipTests: XCTestCase {

    private func clipFileURL() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("reader-finished-clip-\(UUID().uuidString).mp4")
        try Data().write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    private func clip(duration: Double?, url: URL) -> StoryMediaObject {
        StoryMediaObject(id: "clip-paysage", mediaURL: url.absoluteString, kind: .video,
                         aspectRatio: 16.0 / 9.0, startTime: 0, duration: duration)
    }

    private func readerClipLayer(duration: Double?) throws -> StoryMediaLayer {
        let layer = StoryMediaLayer()
        layer.configure(with: clip(duration: duration, url: try clipFileURL()),
                        geometry: CanvasGeometry(renderSize: CGSize(width: 412, height: 732)),
                        mode: .play)
        XCTAssertNotNil(layer.avPlayer, "préalable : la couche de lecture a ouvert son player")
        return layer
    }

    /// Joue la fin d'item telle qu'AVFoundation la notifie, puis vide la file
    /// principale, où l'observer de fin est inscrit.
    private func playToEnd(_ layer: StoryMediaLayer) {
        NotificationCenter.default.post(name: .AVPlayerItemDidPlayToEndTime,
                                        object: layer.avPlayer?.currentItem)
        let drained = expectation(description: "file principale vidée")
        DispatchQueue.main.async { drained.fulfill() }
        wait(for: [drained], timeout: 1)
    }

    // MARK: - La vidéo reste sur sa dernière image tant que sa fenêtre est ouverte

    func test_aClipEndingInsideItsWindow_staysOnScreen() throws {
        let layer = try readerClipLayer(duration: 6)

        playToEnd(layer)

        XCTAssertFalse(layer.isHidden,
                       "Sa disparition appartient à sa FENÊTRE, pas à l'horloge du player : la vidéo reste sur sa dernière image, en pause comme en lecture")
    }

    func test_aClipWithoutDeclaredWindow_stillLeavesAtItsEnd() throws {
        let layer = try readerClipLayer(duration: nil)

        playToEnd(layer)

        XCTAssertTrue(layer.isHidden,
                      "Sans durée déclarée, sa fenêtre est infinie et rien d'autre ne la retirerait : elle part à la fin de l'item (09cfcf95f0)")
    }

    // MARK: - Un clip fini n'est pas un stall

    func test_aFinishedClip_noLongerDrivesTheStoryTimeline() throws {
        var effects = StoryEffects()
        effects.background = "#112233"
        effects.mediaObjects = [clip(duration: 6, url: try clipFileURL())]
        let view = StoryCanvasUIView(slide: StorySlide(id: "slide-clip", effects: effects, duration: 6),
                                     mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()
        let clipLayer = try XCTUnwrap(
            view.itemsContainer.sublayers?.compactMap { $0 as? StoryMediaLayer }.first,
            "préalable : le clip est rendu dans sa fenêtre")
        XCTAssertNotNil(view.primaryMediaPlayer(), "préalable : en lecture, le clip pilote la timeline")

        playToEnd(clipLayer)

        XCTAssertNil(view.primaryMediaPlayer(),
                     "Un clip joué jusqu'au bout n'attend plus rien : sa pause de fin se lisait comme un stall — spinner et timeline gelée")
    }

    // MARK: - La reprise ne rejoue pas la fin d'un clip fini

    func test_resumingAFinishedClip_leavesItOnItsLastImage() throws {
        let layer = try readerClipLayer(duration: 6)
        playToEnd(layer)

        layer.isPlaybackActive = true

        XCTAssertEqual(layer.avPlayer?.rate, 0,
                       "La reprise le laisse sur sa dernière image : le recalage sur un playhead en retard rejouait sa fin")
    }
}
