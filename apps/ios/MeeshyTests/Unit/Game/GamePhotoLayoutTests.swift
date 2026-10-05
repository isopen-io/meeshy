import XCTest
@testable import Meeshy

/// Le cadre du moment (#9382) : une table en pixels de l'image finale, que l'aperçu et
/// la composition lisent toutes deux.
final class GamePhotoLayoutTests: XCTestCase {

    func test_theTwoFormats_are916ForTheStoryAnd11ForTheProfile() {
        XCTAssertEqual(PhotoFormat.story.size, CGSize(width: 1080, height: 1920))
        XCTAssertEqual(PhotoFormat.square.size, CGSize(width: 1080, height: 1080))
    }

    func test_everyElementStaysInsideTheImage() {
        for format in PhotoFormat.allCases {
            let layout = GamePhotoLayout.layout(format)
            let bounds = CGRect(origin: .zero, size: format.size)
            for rect in [layout.emblem, layout.mee, layout.meo, layout.signature] {
                XCTAssertTrue(bounds.contains(rect), "\(format) : \(rect) sort de l'image")
            }
        }
    }

    func test_emblemOnTop_thenKickerTitleDate_thenMeeAndMeoAtTheBottom() {
        for format in PhotoFormat.allCases {
            let layout = GamePhotoLayout.layout(format)
            XCTAssertLessThan(layout.emblem.maxY, layout.kicker.y - layout.kicker.size / 2, "\(format)")
            XCTAssertLessThan(layout.kicker.y, layout.title.y)
            XCTAssertLessThan(layout.title.y, layout.date.y)
            XCTAssertLessThan(layout.date.y, layout.mee.minY)
            XCTAssertEqual(layout.mee.minY, layout.meo.minY)
        }
    }

    func test_meeIsOnTheLeft_meoOnTheRight_theSignatureCenteredBetweenThem() {
        let layout = GamePhotoLayout.layout(.story)
        XCTAssertLessThan(layout.mee.maxX, layout.signature.minX)
        XCTAssertGreaterThan(layout.meo.minX, layout.signature.maxX)
        XCTAssertEqual(layout.signature.midX, PhotoFormat.story.size.width / 2, accuracy: 0.001)
    }

    func test_theEmblemIsCentered() {
        for format in PhotoFormat.allCases {
            XCTAssertEqual(GamePhotoLayout.layout(format).emblem.midX, format.size.width / 2, accuracy: 0.001)
        }
    }
}
