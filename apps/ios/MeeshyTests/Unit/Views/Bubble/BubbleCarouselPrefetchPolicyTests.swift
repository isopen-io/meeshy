import XCTest
import MeeshySDK
@testable import Meeshy

/// `BubbleCarouselView.shouldPrefetch` (2026-07-21) : le prefetch ±1 du
/// carousel de bulle téléchargeait des images pleine taille sans consulter
/// `MediaDownloadPolicyEngine` — données cellulaires consommées malgré la
/// préférence 'Jamais'/'Wi-Fi uniquement'. Décision pure par pièce, taille
/// comprise (#14639).
final class BubbleCarouselPrefetchPolicyTests: XCTestCase {

    private let never = MediaDownloadPreferences(image: .never, audio: .never, audioTranslation: .never, video: .never)
    private let wifiOnly = MediaDownloadPreferences(image: .wifiOnly, audio: .wifiOnly, audioTranslation: .wifiOnly, video: .wifiOnly)

    private func piece(_ type: String, size: Int) -> MessageAttachment {
        MessageAttachment(id: "x", mimeType: type, fileSize: size, fileUrl: "https://x/x")
    }

    func test_shouldPrefetch_largeMedia_followsThePolicyOfItsKind() {
        let image = piece("image/jpeg", size: 2_000_000)
        let video = piece("video/mp4", size: 2_000_000)
        XCTAssertTrue(BubbleCarouselView.shouldPrefetch(image, condition: .wifi, prefs: wifiOnly))
        XCTAssertFalse(BubbleCarouselView.shouldPrefetch(image, condition: .badCellular, prefs: wifiOnly))
        XCTAssertFalse(BubbleCarouselView.shouldPrefetch(video, condition: .wifi, prefs: never))
    }

    /// #14639 — sous 100 Ko, la pièce part quel que soit le réseau ; seul le hors-ligne la retient.
    func test_shouldPrefetch_under100KB_ignoresTheNetworkPolicy_butNotOffline() {
        for type in ["image/jpeg", "video/mp4"] {
            XCTAssertTrue(BubbleCarouselView.shouldPrefetch(piece(type, size: 99_999), condition: .badCellular, prefs: never), type)
            XCTAssertFalse(BubbleCarouselView.shouldPrefetch(piece(type, size: 102_400), condition: .badCellular, prefs: never), type)
            XCTAssertFalse(BubbleCarouselView.shouldPrefetch(piece(type, size: 99_999), condition: .offline, prefs: never), type)
        }
    }

    // MARK: - Page courante, bornée

    /// Le bouton de fermeture lisait `items[max(0, min(i, count - 1))]` : avec un
    /// carrousel resté monté alors que les visuels du message sont tombés à zéro
    /// (suppression pour tous, vue unique consommée), cela devient `items[0]`
    /// sur un tableau vide — plantage au tap sur la croix.
    func test_currentAttachment_emptyItems_isNil() {
        XCTAssertNil(BubbleCarouselView.currentAttachment(at: 0, in: []))
        XCTAssertNil(BubbleCarouselView.currentAttachment(at: 3, in: []))
    }

    func test_currentAttachment_staleIndex_clampsToLastPage() {
        let a = MessageAttachment(id: "a", mimeType: "image/jpeg", fileUrl: "https://x/a.jpg")
        let b = MessageAttachment(id: "b", mimeType: "image/jpeg", fileUrl: "https://x/b.jpg")
        XCTAssertEqual(BubbleCarouselView.currentAttachment(at: 5, in: [a, b])?.id, "b")
        XCTAssertEqual(BubbleCarouselView.currentAttachment(at: -1, in: [a, b])?.id, "a")
        XCTAssertEqual(BubbleCarouselView.currentAttachment(at: 0, in: [a, b])?.id, "a")
    }

    // MARK: - La liste bouge sous le carrousel (cycle 4)

    /// Une pièce retirée AVANT la page montrée : l'indice seul désignait la
    /// pièce suivante, et l'indicateur disait « 3 / 2 ». La page suit la pièce.
    func test_reanchoredPage_followsTheShownAttachment_toItsNewRank() {
        let a = MessageAttachment(id: "a", mimeType: "image/jpeg", fileUrl: "https://x/a.jpg")
        let b = MessageAttachment(id: "b", mimeType: "image/jpeg", fileUrl: "https://x/b.jpg")
        let c = MessageAttachment(id: "c", mimeType: "image/jpeg", fileUrl: "https://x/c.jpg")

        let landing = BubbleCarouselView.reanchoredPage(shownId: "c", index: 2, in: [b, c])

        XCTAssertEqual(landing?.id, "c")
        XCTAssertEqual(landing?.index, 1)
        XCTAssertEqual(BubbleCarouselView.reanchoredPage(shownId: "a", index: 0, in: [c, a, b])?.index, 1,
                       "réordonnée : la pièce montrée reste la même")
    }

    /// La pièce montrée a disparu : la page voisine, bornée ; plus rien : nil.
    func test_reanchoredPage_whenTheShownAttachmentLeft_landsOnTheNeighbour() {
        let a = MessageAttachment(id: "a", mimeType: "image/jpeg", fileUrl: "https://x/a.jpg")
        let b = MessageAttachment(id: "b", mimeType: "image/jpeg", fileUrl: "https://x/b.jpg")

        XCTAssertEqual(BubbleCarouselView.reanchoredPage(shownId: "gone", index: 5, in: [a, b])?.id, "b")
        XCTAssertEqual(BubbleCarouselView.reanchoredPage(shownId: "gone", index: 5, in: [a, b])?.index, 1)
        XCTAssertNil(BubbleCarouselView.reanchoredPage(shownId: "gone", index: 0, in: []))
    }

    // MARK: - Les points : UN seul allongé, à la page visible (#18824)

    func test_dotWidth_onlyTheVisiblePage_isLong() {
        for current in 0..<4 {
            let widths = (0..<4).map { CarouselPageDots.width(of: $0, current: current) }
            XCTAssertEqual(widths.filter { $0 == CarouselPageDots.longDotWidth }.count, 1)
            XCTAssertEqual(widths[current], CarouselPageDots.longDotWidth)
            XCTAssertGreaterThan(CarouselPageDots.longDotWidth, CarouselPageDots.dotSide)
        }
    }

    func test_dotWidth_otherPages_areRoundDots() {
        XCTAssertEqual(CarouselPageDots.width(of: 0, current: 2), CarouselPageDots.dotSide)
        XCTAssertEqual(CarouselPageDots.width(of: 3, current: 2), CarouselPageDots.dotSide)
    }

    func test_showsDots_fromTwoToSevenPages_thenACounter() {
        XCTAssertFalse(CarouselPageDots.showsDots(count: 1))
        XCTAssertTrue(CarouselPageDots.showsDots(count: 2))
        XCTAssertTrue(CarouselPageDots.showsDots(count: 7))
        XCTAssertFalse(CarouselPageDots.showsDots(count: 8))
    }

    func test_page_followsTheShownAttachment() {
        let items = ["a", "b", "c"].map { MessageAttachment(id: $0, mimeType: "image/jpeg", fileUrl: "https://x/\($0).jpg") }
        XCTAssertEqual(CarouselPageDots.page(of: "b", in: items, fallback: 0), 1)
        XCTAssertEqual(CarouselPageDots.page(of: nil, in: items, fallback: 2), 2)
        XCTAssertEqual(CarouselPageDots.page(of: "gone", in: items, fallback: 9), 2, "borné aux pages existantes")
    }

    func test_pageLabel_saysThePageAndTheCount() {
        let label = CarouselPageDots.pageLabel(page: 1, count: 4)
        XCTAssertFalse(label.isEmpty)
        XCTAssertNotEqual(label, CarouselPageDots.pageLabel(page: 2, count: 4))
        XCTAssertFalse(label.contains("%"), "les arguments sont posés")
    }

    func test_previewPresentation_opensNothing_threadPresentationOpensFullscreen() {
        XCTAssertFalse(BubbleCarouselView.Presentation.preview.opensFullscreen)
        XCTAssertFalse(BubbleCarouselView.Presentation.preview.showsCloseButton)
        XCTAssertTrue(BubbleCarouselView.Presentation.thread.opensFullscreen)
        XCTAssertTrue(BubbleCarouselView.Presentation.thread.showsCloseButton)
    }
}
