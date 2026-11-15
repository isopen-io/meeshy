import AVFoundation
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le voisin AFFICHE son lecteur préparé sans le prendre** (#9837).
///
/// La page voisine du lecteur de réels attache sa surface au lecteur préparé
/// du pool, en pause : sa première image est à l'écran pendant le geste. Le
/// moteur partagé doit pouvoir l'ADOPTER ensuite — regarder ne doit donc pas
/// retirer, et le pool doit prévenir quand il change.
private final class AnnouncementCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    func increment() { lock.withLock { count += 1 } }
    var value: Int { lock.withLock { count } }
}

@MainActor
final class StoryMediaLoaderPeekTests: XCTestCase {

    private func remoteURL() -> URL {
        URL(string: "https://cdn.example.invalid/reel-\(UUID().uuidString).mp4")!
    }

    func test_peek_leavesThePlayerInThePool_forTheEngineToAdopt() {
        let loader = StoryMediaLoader.shared
        loader.clearPlayerCache()
        let url = remoteURL()
        let prepared = AVPlayer()
        loader.returnPlayer(prepared, for: url)

        XCTAssertTrue(loader.peekCachedPlayer(for: url) === prepared)
        XCTAssertTrue(loader.peekCachedPlayer(for: url) === prepared,
                      "regarder deux fois rend la même instance : rien n'a été retiré")
        XCTAssertTrue(loader.cachedPlayer(for: url) === prepared,
                      "le moteur adopte l'instance même que la page voisine affichait")
        XCTAssertNil(loader.peekCachedPlayer(for: url))
    }

    func test_pool_announcesWhenAPlayerEntersAndLeaves() {
        let loader = StoryMediaLoader.shared
        loader.clearPlayerCache()
        let url = remoteURL()
        let counter = AnnouncementCounter()
        let token = NotificationCenter.default.addObserver(
            forName: StoryMediaLoader.poolDidChange, object: nil, queue: nil
        ) { _ in counter.increment() }
        defer { NotificationCenter.default.removeObserver(token) }

        loader.returnPlayer(AVPlayer(), for: url)
        XCTAssertEqual(counter.value, 1, "un lecteur entré dans le pool s'annonce")
        _ = loader.cachedPlayer(for: url)
        XCTAssertEqual(counter.value, 2, "un lecteur sorti du pool s'annonce aussi")
    }
}
