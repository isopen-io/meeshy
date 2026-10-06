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

    // MARK: - Le bandeau de parrainage (#7742)

    func test_withoutALink_thereIsNoBanner() {
        for format in PhotoFormat.allCases {
            XCTAssertNil(GamePhotoLayout.layout(format).banner)
        }
    }

    func test_theBanner_sitsAtTheBottom_insideTheImage_andAboveNothingElse() {
        for format in PhotoFormat.allCases {
            let layout = GamePhotoLayout.layout(format, referral: true)
            let bounds = CGRect(origin: .zero, size: format.size)
            guard let banner = layout.banner else { return XCTFail("\(format) : pas de bandeau") }
            XCTAssertTrue(bounds.contains(banner), "\(format)")
            XCTAssertGreaterThan(banner.width / banner.height, 3, "\(format) : un bandeau, pas une carte")
            XCTAssertEqual(banner.midX, format.size.width / 2, accuracy: 0.001)
        }
    }

    func test_withTheBanner_meeAndMeoStayAboveIt_andBelowTheDate() {
        for format in PhotoFormat.allCases {
            let layout = GamePhotoLayout.layout(format, referral: true)
            guard let banner = layout.banner else { return XCTFail("\(format)") }
            XCTAssertLessThanOrEqual(layout.mee.maxY, banner.minY, "\(format)")
            XCTAssertLessThanOrEqual(layout.meo.maxY, banner.minY, "\(format)")
            XCTAssertLessThan(layout.date.y, layout.mee.minY, "\(format)")
            XCTAssertLessThan(layout.emblem.maxY, layout.kicker.y - layout.kicker.size / 2, "\(format)")
        }
    }

    func test_theBannerDoesNotMoveTheEmblem() {
        for format in PhotoFormat.allCases {
            XCTAssertEqual(GamePhotoLayout.layout(format, referral: true).emblem, GamePhotoLayout.layout(format).emblem)
        }
    }
}
