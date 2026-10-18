import XCTest
import MeeshySDK
@testable import Meeshy

/// `BubbleCarouselView.shouldPrefetchAttachment` (2026-07-21) : le prefetch
/// ±1 du carousel de bulle téléchargeait des images pleine taille sans
/// consulter `MediaDownloadPolicyEngine` — données cellulaires consommées
/// malgré la préférence 'Jamais'/'Wi-Fi uniquement'. Décision pure gatant
/// chaque type d'attachment sur le résultat déjà résolu du policy engine.
final class BubbleCarouselPrefetchPolicyTests: XCTestCase {

    func test_shouldPrefetchAttachment_image_gatedOnAllowImage() {
        XCTAssertTrue(BubbleCarouselView.shouldPrefetchAttachment(
            kind: .image, allowImage: true, allowVideo: false))
        XCTAssertFalse(BubbleCarouselView.shouldPrefetchAttachment(
            kind: .image, allowImage: false, allowVideo: true))
    }

    func test_shouldPrefetchAttachment_video_gatedOnAllowVideo() {
        XCTAssertTrue(BubbleCarouselView.shouldPrefetchAttachment(
            kind: .video, allowImage: false, allowVideo: true))
        XCTAssertFalse(BubbleCarouselView.shouldPrefetchAttachment(
            kind: .video, allowImage: true, allowVideo: false))
    }

    func test_shouldPrefetchAttachment_bothDisallowed_neverPrefetches() {
        XCTAssertFalse(BubbleCarouselView.shouldPrefetchAttachment(
            kind: .image, allowImage: false, allowVideo: false))
        XCTAssertFalse(BubbleCarouselView.shouldPrefetchAttachment(
            kind: .video, allowImage: false, allowVideo: false))
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
}
