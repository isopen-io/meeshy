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
}
