import XCTest
import MeeshySDK
@testable import Meeshy

/// Façade d'aperçu vidéo : l'ancien `VideoEmbedModel` (player WKWebView inline) a été retiré —
/// YouTube bloque la lecture embarquée par vérification d'origine (erreurs 15x). La façade
/// ouvre désormais la vidéo via un lien. Ces tests couvrent la résolution de l'URL ouverte.
@MainActor
final class VideoEmbedDestinationTests: XCTestCase {

    private func makeVideo(start: Int? = nil) -> EmbeddedVideo {
        EmbeddedVideo(provider: .youtube, videoId: "3JyCWwpoKfM", startSeconds: start)
    }

    func test_url_withoutTrackedLink_usesCanonicalWatchURL() {
        let url = VideoEmbedDestination.url(for: makeVideo(), trackedURL: nil)
        XCTAssertEqual(url.absoluteString, "https://www.youtube.com/watch?v=3JyCWwpoKfM")
    }

    func test_url_withStartSeconds_appendsTimestamp() {
        let url = VideoEmbedDestination.url(for: makeVideo(start: 90), trackedURL: nil)
        XCTAssertEqual(url.absoluteString, "https://www.youtube.com/watch?v=3JyCWwpoKfM&t=90s")
    }

    func test_url_withTrackedLink_prefersTrackedLink() {
        let tracked = URL(string: "https://meeshy.me/l/abc123")!
        let url = VideoEmbedDestination.url(for: makeVideo(), trackedURL: tracked)
        XCTAssertEqual(url, tracked)
    }
}
