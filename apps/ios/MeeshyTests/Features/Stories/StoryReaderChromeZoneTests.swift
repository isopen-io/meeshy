import XCTest
import CoreGraphics
@testable import Meeshy

/// #11045 — seule la SCÈNE pagine. Un glissé né sur un composant posé sur la
/// scène (barre de composition et ses émojis rapides, panneau d'émojis) ne
/// devient jamais l'axe horizontal du lecteur.
final class StoryReaderChromeZoneTests: XCTestCase {

    private let composer = CGRect(x: 16, y: 700, width: 358, height: 120)
    private let rail = CGRect(x: 330, y: 300, width: 44, height: 260)

    func test_yieldsHorizontalAxis_dragBornOnTheComposer_yields() {
        XCTAssertTrue(StoryReaderChromeZone.yieldsHorizontalAxis(
            chromeFrames: [composer], dragStart: CGPoint(x: 100, y: 760)))
    }

    func test_yieldsHorizontalAxis_dragBornOnTheScene_keepsPaging() {
        XCTAssertFalse(StoryReaderChromeZone.yieldsHorizontalAxis(
            chromeFrames: [composer, rail], dragStart: CGPoint(x: 100, y: 400)))
    }

    func test_yieldsHorizontalAxis_noChromePublished_keepsPaging() {
        XCTAssertFalse(StoryReaderChromeZone.yieldsHorizontalAxis(
            chromeFrames: [], dragStart: CGPoint(x: 100, y: 760)))
    }

    func test_yieldsHorizontalAxis_framesAreNotMergedIntoABoundingBox() {
        XCTAssertFalse(StoryReaderChromeZone.yieldsHorizontalAxis(
            chromeFrames: [composer, rail], dragStart: CGPoint(x: 200, y: 600)),
            "Entre le rail et le composeur, c'est la scène : l'union des cadres ne doit pas la confisquer.")
    }

    func test_chromeFramesKey_concatenatesEveryPublishedFrame() {
        var value = StoryReaderChromeFramesKey.defaultValue
        StoryReaderChromeFramesKey.reduce(value: &value) { [composer] }
        StoryReaderChromeFramesKey.reduce(value: &value) { [rail] }
        XCTAssertEqual(value, [composer, rail])
    }
}
