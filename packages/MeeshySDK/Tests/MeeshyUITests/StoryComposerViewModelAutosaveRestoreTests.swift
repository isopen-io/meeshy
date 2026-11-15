import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

// #8848 — l'hôte du meuble rend au ViewModel une composition relue de son
// brouillon, en UNE porte publique.
@MainActor
final class StoryComposerViewModelAutosaveRestoreTests: XCTestCase {

    private func makeSlides() -> [StorySlide] {
        var premiere = StorySlide(id: "s1")
        premiere.content = "Bonjour"
        return [premiere, StorySlide(id: "s2")]
    }

    private func makeImage() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 2, height: 2)).image { _ in }
    }

    func test_restoreAutosavedComposition_withSlidesAndMedia_restoresEverything() {
        let vm = StoryComposerViewModel()
        let fond = makeImage()
        let objet = makeImage()
        let video = URL(fileURLWithPath: "/tmp/v.mp4")
        let versionAvant = vm.loadedImagesVersion

        vm.restoreAutosavedComposition(slides: makeSlides(),
                                       currentSlideIndex: 1,
                                       slideImages: ["s1": fond],
                                       images: ["o1": objet],
                                       videoURLs: ["o2": video],
                                       audioURLs: [:],
                                       stickerAnimations: ["k": Data([1])])

        XCTAssertEqual(vm.slides.map(\.id), ["s1", "s2"])
        XCTAssertEqual(vm.slides.first?.content, "Bonjour")
        XCTAssertEqual(vm.currentSlideIndex, 1)
        XCTAssertTrue(vm.slideImages["s1"] === fond)
        XCTAssertTrue(vm.loadedImages["o1"] === objet)
        XCTAssertEqual(vm.loadedVideoURLs["o2"], video)
        XCTAssertEqual(vm.loadedStickerAnimations["k"], Data([1]))
        XCTAssertNotEqual(vm.loadedImagesVersion, versionAvant)
    }

    func test_restoreAutosavedComposition_withOutOfRangeIndex_clampsToLastSlide() {
        let vm = StoryComposerViewModel()

        vm.restoreAutosavedComposition(slides: makeSlides(), currentSlideIndex: 9,
                                       slideImages: [:], images: [:], videoURLs: [:],
                                       audioURLs: [:], stickerAnimations: [:])

        XCTAssertEqual(vm.currentSlideIndex, 1)
    }

    func test_restoreAutosavedComposition_withNoSlides_keepsOneBlankSlide() {
        let vm = StoryComposerViewModel()

        vm.restoreAutosavedComposition(slides: [], currentSlideIndex: 0,
                                       slideImages: [:], images: [:], videoURLs: [:],
                                       audioURLs: [:], stickerAnimations: [:])

        XCTAssertEqual(vm.slides.count, 1)
        XCTAssertEqual(vm.currentSlideIndex, 0)
    }
}
