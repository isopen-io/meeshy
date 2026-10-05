import XCTest
import UIKit
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// **Le `⋯` du composer remet au moteur la scène ENTIÈRE** (#8599).
///
/// Le contrôleur passait un index de stickers vide et aucun son : un sticker
/// collé sortait sous son repli 🖼️, une image retouchée sous son original, un
/// son pas encore téléversé ne sonnait pas. Il reçoit désormais les entrées que
/// `StoryComposerViewModel.exportInputs(for:)` construit — la même construction
/// que l'export timeline — et les remet TELLES QUELLES au bake.
@MainActor
final class ComposerSceneExportInputsTests: XCTestCase {

    private func makeSUT() -> (sut: ComposerSceneExportController, exporter: MockShareExporter) {
        let exporter = MockShareExporter(behavior: .success)
        let sut = ComposerSceneExportController(exporter: exporter,
                                                photoSaver: StubPhotoSaver(),
                                                toasts: MockFeedbackToast(),
                                                brandIntro: { nil })
        return (sut, exporter)
    }

    func test_export_handsTheSceneInputsToTheBake() async throws {
        let (sut, exporter) = makeSUT()
        let bitmap = UIGraphicsImageRenderer(size: CGSize(width: 2, height: 2)).image { _ in }
        let son = URL(fileURLWithPath: "/tmp/voix-de-session.m4a")
        let inputs = StoryExportInputs(stickerImageSources: ["pm-stk": "file:///tmp/stk.png"],
                                       images: ["stk-colle": bitmap],
                                       audioURLs: ["aud-1": son])

        sut.export(.share, slide: StorySlide(), inputs: inputs)
        try await waitUntil { exporter.prepareCallCount == 1 }

        let recu = try XCTUnwrap(exporter.lastInputs)
        XCTAssertTrue(recu.images["stk-colle"] === bitmap, "le sticker collé doit atteindre le bake")
        XCTAssertEqual(recu.stickerImageSources, ["pm-stk": "file:///tmp/stk.png"])
        XCTAssertEqual(recu.audioResolver?(StoryAudioPlayerObject(id: "aud-1")), son,
                       "le son de session doit atteindre le bake")
        sut.cancel()
    }

    private func waitUntil(_ condition: @escaping @MainActor () -> Bool) async throws {
        for _ in 0..<200 where !condition() {
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTAssertTrue(condition(), "condition jamais atteinte")
    }
}
