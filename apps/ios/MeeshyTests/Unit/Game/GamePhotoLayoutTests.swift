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

    // MARK: - Le carré QR du lien (#9554)

    func test_theBanner_takesAFifthOfTheWidth_inBothFormats() {
        for format in PhotoFormat.allCases {
            XCTAssertEqual(GamePhotoLayout.layout(format, referral: true).banner?.height ?? 0, format.size.width * 0.2, accuracy: 0.001, "\(format)")
        }
    }

    func test_theQRSquare_is181PixelsWide_atTheEndOfTheBanner_onWholePixels() {
        for format in PhotoFormat.allCases {
            let layout = GamePhotoLayout.layout(format, referral: true)
            guard let banner = layout.banner, let qr = layout.qr else { return XCTFail("\(format)") }
            XCTAssertEqual(qr.size, CGSize(width: 181, height: 181), "\(format)")
            XCTAssertTrue(banner.contains(qr), "\(format)")
            XCTAssertEqual(qr, qr.integral, "\(format) : un carré à cheval sur deux pixels se lit mal")
            XCTAssertGreaterThan(qr.minX, banner.midX, "\(format) : en fin de ligne")
            XCTAssertEqual(banner.maxX - qr.maxX, qr.minY - banner.minY, accuracy: 0.001, "\(format) : la même marge au bord et en haut")
        }
        XCTAssertEqual(GamePhotoLayout.layout(.story, referral: true).qr, CGRect(x: 827, y: 1668, width: 181, height: 181))
    }

    func test_rightToLeft_theQRSquareMovesToTheLeft_andNothingElseMoves() {
        for format in PhotoFormat.allCases {
            let ltr = GamePhotoLayout.layout(format, referral: true)
            let rtl = GamePhotoLayout.layout(format, referral: true, rightToLeft: true)
            guard let banner = rtl.banner, let qr = rtl.qr, let ltrQR = ltr.qr else { return XCTFail("\(format)") }
            XCTAssertLessThan(qr.maxX, banner.midX, "\(format)")
            XCTAssertEqual(qr.minX - banner.minX, banner.maxX - ltrQR.maxX, accuracy: 0.001, "\(format)")
            XCTAssertEqual(qr.minY, ltrQR.minY)
            XCTAssertEqual(rtl.banner, ltr.banner)
            XCTAssertEqual(rtl.mee, ltr.mee)
            XCTAssertEqual(rtl.meo, ltr.meo)
            XCTAssertEqual(rtl.emblem, ltr.emblem)
        }
    }

    func test_withoutABanner_thereIsNoQRSquare() {
        for format in PhotoFormat.allCases {
            XCTAssertNil(GamePhotoLayout.layout(format).qr)
        }
    }

    func test_readsRightToLeft_followsTheLanguageOfTheApp() {
        XCTAssertTrue(GamePhotoLayout.readsRightToLeft(languages: ["ar"]))
        XCTAssertFalse(GamePhotoLayout.readsRightToLeft(languages: ["fr", "ar"]))
        XCTAssertFalse(GamePhotoLayout.readsRightToLeft(languages: ["pt-BR"]))
        XCTAssertFalse(GamePhotoLayout.readsRightToLeft(languages: []))
    }

    func test_theBannerDoesNotMoveTheEmblem() {
        for format in PhotoFormat.allCases {
            XCTAssertEqual(GamePhotoLayout.layout(format, referral: true).emblem, GamePhotoLayout.layout(format).emblem)
        }
    }
}
