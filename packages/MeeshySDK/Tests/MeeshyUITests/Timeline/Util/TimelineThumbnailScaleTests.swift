import XCTest
import UIKit
@testable import MeeshyUI

@MainActor
final class TimelineThumbnailScaleTests: XCTestCase {

    private func writePNG(width: Int, height: Int) throws -> URL {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)
        let data = renderer.pngData { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString).png")
        try data.write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    private func longestSide(_ image: UIImage?) throws -> Int {
        let cg = try XCTUnwrap(image?.cgImage)
        return max(cg.width, cg.height)
    }

    func test_imageStill_decodesAtTheInjectedScale() async throws {
        let url = try writePNG(width: 2000, height: 500)

        let atOne = await ImageStill.thumbnail(url: url, maxHeight: 40, scale: 1)
        let atThree = await ImageStill.thumbnail(url: url, maxHeight: 40, scale: 3)

        XCTAssertLessThanOrEqual(try longestSide(atOne), 160)
        XCTAssertGreaterThan(try longestSide(atThree), 160)
        XCTAssertLessThanOrEqual(try longestSide(atThree), 480)
    }

    func test_videoFilmstrip_keysAndBoundsByScale() {
        let url = URL(fileURLWithPath: "/tmp/clip.mp4")
        XCTAssertNotEqual(
            VideoFilmstrip.request(url: url, count: 6, maxHeight: 40, scale: 2),
            VideoFilmstrip.request(url: url, count: 6, maxHeight: 40, scale: 3))
        XCTAssertEqual(VideoFilmstrip.maximumSize(maxHeight: 40, scale: 3), CGSize(width: 160, height: 120))
    }
}
