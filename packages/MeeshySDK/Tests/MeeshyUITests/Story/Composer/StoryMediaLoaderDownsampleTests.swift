import XCTest
@testable import MeeshyUI

/// S5 — downsample d'une image DÉJÀ décodée (capture caméra, dernière photo de
/// la pellicule). Le chemin picker part d'une `Data` brute et n'encode qu'une
/// fois ; sans ce chemin, la caméra aurait dû encoder → décoder →
/// redimensionner → ré-encoder, soit deux générations de perte.
///
/// Les assertions de cadrage portent sur le CŒUR `nonisolated` — la seule
/// surface publique est `downsampledJPEG`, qui l'enveloppe. Une variante
/// publique `downsampled(image:)` a existé sans jamais avoir d'appelant hors
/// tests : une API que seuls ses tests exercent n'est pas une API.
@MainActor
final class StoryMediaLoaderDownsampleTests: XCTestCase {

    private func makeImage(width: CGFloat, height: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)
            .image { ctx in
                UIColor.systemTeal.setFill()
                ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
            }
    }

    func test_downsample_imageLongerThanTheBound_capsTheLongestSideAndKeepsTheRatio() {
        let result = StoryMediaLoader.downsample(
            image: makeImage(width: 2400, height: 1200), maxDimension: 1080)

        let size = try? XCTUnwrap(result).size
        XCTAssertEqual(size?.width ?? 0, 1080, accuracy: 1)
        XCTAssertEqual(size?.height ?? 0, 540, accuracy: 1)
    }

    func test_downsample_portraitImage_capsTheHeightNotTheWidth() {
        let result = StoryMediaLoader.downsample(
            image: makeImage(width: 1200, height: 2400), maxDimension: 1080)

        let size = try? XCTUnwrap(result).size
        XCTAssertEqual(size?.height ?? 0, 1080, accuracy: 1)
        XCTAssertEqual(size?.width ?? 0, 540, accuracy: 1)
    }

    func test_downsample_imageAlreadyUnderTheBound_returnsItUntouched() {
        let source = makeImage(width: 400, height: 300)

        let result = StoryMediaLoader.downsample(image: source, maxDimension: 1080)

        XCTAssertEqual(result, source, "Redimensionner vers le HAUT dégraderait sans gain.")
    }

    /// Le redimensionnement d'une photo 12 Mpx puis son encodage JPEG ne
    /// doivent PAS s'exécuter sur le thread principal : c'est un hitch visible
    /// au retour de la caméra. Ce test ne mesure pas une durée (ce serait
    /// flaky) — il prouve l'ISOLATION : le corps est `nonisolated`, donc
    /// appelable depuis une `Task.detached`. Si quelqu'un le ramenait sur le
    /// MainActor, ce test ne compilerait plus.
    func test_downsample_isNotMainActorIsolated_soTheResizeRunsOffTheMainThread() async {
        let source = makeImage(width: 2400, height: 1200)

        let resized = await Task.detached {
            StoryMediaLoader.downsample(image: source, maxDimension: 600)
        }.value

        XCTAssertEqual(resized?.size.width ?? 0, 600, accuracy: 1)
    }

    func test_downsampledJPEG_capsTheImageAndEncodesItInASinglePass() async {
        let source = makeImage(width: 2400, height: 1200)

        let encoded = await StoryMediaLoader.shared.downsampledJPEG(
            image: source, maxDimension: 1080, compressionQuality: 0.92)

        XCTAssertEqual(encoded?.image.size.width ?? 0, 1080, accuracy: 1)
        XCTAssertNotNil(encoded?.data, "L'unique encodage JPEG accompagne le downsample, hors MainActor.")
        XCTAssertGreaterThan(encoded?.data.count ?? 0, 0)
    }
}
