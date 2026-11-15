import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #14181 — **une vignette peint les pastilles de son à leur RANG**, comme le
/// lecteur (#13901) : une pastille qu'une image recouvre disparaît sous elle,
/// une pastille que rien ne recouvre reste au-dessus de tout.
@MainActor
final class SceneThumbnailSoundChipRankTests: XCTestCase {

    private let tuile = CGSize(width: 90, height: 160)

    private static let rouge: UIImage = {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: 64, height: 64), format: format).image { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 64, height: 64))
        }
    }()

    /// Une image rouge au centre, au rang 2, et une pastille de son au même
    /// endroit, au rang `sonZ`.
    private func scene(sonZ: Int?) -> StorySlide {
        var slide = StorySlide(id: "rang-vignette")
        slide.effects.background = "FFFFFF"
        slide.effects.mediaObjects = [StoryMediaObject(id: "photo", mediaURL: "file:///photo.png", aspectRatio: 1,
                                                       zIndex: 2)]
        var son = StoryAudioPlayerObject(id: "son", x: 0.5, y: 0.5)
        son.zIndex = sonZ
        slide.effects.audioPlayerObjects = [son]
        return slide
    }

    private func pixel(_ image: UIImage, x: Int, y: Int) -> (r: Int, g: Int, b: Int) {
        guard let cg = image.cgImage,
              let context = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return (-1, -1, -1) }
        context.draw(cg, in: CGRect(x: -x, y: -(cg.height - 1 - y), width: cg.width, height: cg.height))
        guard let octets = context.data?.assumingMemoryBound(to: UInt8.self) else { return (-1, -1, -1) }
        return (Int(octets[0]), Int(octets[1]), Int(octets[2]))
    }

    private func estRouge(_ c: (r: Int, g: Int, b: Int)) -> Bool {
        c.r > 200 && c.g < 70 && c.b < 70
    }

    // MARK: - La tuile du rail (`SceneThumbnailRenderer`)

    private func tuileDuRail(_ slide: StorySlide) -> UIImage {
        SceneThumbnailRenderer.thumbnail(slide: slide, bgImage: nil, loadedImages: ["photo": Self.rouge],
                                         size: tuile, scale: 2,
                                         store: SceneThumbnailStore(), reductions: SceneThumbnailCache())
    }

    func test_railTile_aChipUnderAnImage_isHiddenByIt() {
        let image = tuileDuRail(scene(sonZ: 1))

        XCTAssertTrue(estRouge(pixel(image, x: 90, y: 160)),
                      "la pastille enfouie sous l'image ne se peint pas par-dessus elle")
    }

    func test_railTile_aChipAboveTheImage_staysOnTop() {
        let image = tuileDuRail(scene(sonZ: 3))

        XCTAssertFalse(estRouge(pixel(image, x: 90, y: 160)), "la pastille que rien ne recouvre se voit")
    }

    func test_railTile_anUnrankedChip_staysOnTop() {
        let image = tuileDuRail(scene(sonZ: nil))

        XCTAssertFalse(estRouge(pixel(image, x: 90, y: 160)), "une pastille sans rang reste au-dessus de tout")
    }

    // MARK: - La bande de slides (`SlideMiniPreview`)

    private func bande(_ slide: StorySlide) throws -> UIImage {
        let vue = SlideMiniPreview(effects: slide.effects, bgImage: nil, drawingData: nil,
                                   loadedImages: ["photo": Self.rouge], index: 0)
            .frame(width: tuile.width, height: tuile.height)
        let renderer = ImageRenderer(content: vue)
        renderer.scale = 2
        return try XCTUnwrap(renderer.uiImage)
    }

    func test_slideStrip_aChipUnderAnImage_isHiddenByIt() throws {
        let image = try bande(scene(sonZ: 1))

        XCTAssertTrue(estRouge(pixel(image, x: 90, y: 160)),
                      "la pastille enfouie sous l'image ne se peint pas par-dessus elle")
    }

    func test_slideStrip_aChipAboveTheImage_staysOnTop() throws {
        let image = try bande(scene(sonZ: 3))

        XCTAssertFalse(estRouge(pixel(image, x: 90, y: 160)), "la pastille que rien ne recouvre se voit")
    }

    // MARK: - La loi partagée

    func test_theStack_putsTheBuriedChipAtItsRank_andLeavesTheOthersToTheOverlay() {
        let enfouie = SceneAudioStageRule.stackedObjects(in: scene(sonZ: 1).effects).map(\.id)
        let dessus = SceneAudioStageRule.stackedObjects(in: scene(sonZ: 3).effects).map(\.id)

        XCTAssertEqual(enfouie, ["son", "photo"], "la pastille enfouie s'empile sous l'image qui la recouvre")
        XCTAssertEqual(dessus, ["photo"], "une pastille que rien ne recouvre est l'affaire de la surcouche")
    }
}
