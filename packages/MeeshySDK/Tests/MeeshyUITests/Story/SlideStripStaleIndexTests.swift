import XCTest

/// Les actions d'une vignette (tap, menu contextuel « Éditer le fond ») capturent
/// l'`index` du `ForEach` au rendu. Un menu contextuel ouvert reste vivant pendant
/// qu'une autre action retire une slide : `viewModel.slides[index]` lisait alors
/// hors du tableau (plantage). `selectSlide(at:)` était déjà gardé ; la lecture
/// de la slide doit l'être aussi.
final class SlideStripStaleIndexTests: XCTestCase {

    private static var sourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/StoryComposerView+SlideStrip.swift")
    }

    func test_thumbActions_neverSubscriptSlidesUnchecked() throws {
        let code = try String(contentsOf: Self.sourceURL, encoding: .utf8)
        let reads = code.components(separatedBy: "viewModel.slides[index]").count - 1
        let guards = code.components(separatedBy: "guard viewModel.slides.indices.contains(index) else { return }").count - 1
        XCTAssertEqual(reads, 2, "le tap et « Éditer le fond » lisent la slide")
        XCTAssertEqual(guards, reads, "chaque lecture d'un index capturé au rendu est gardée en tête d'action")
    }
}
