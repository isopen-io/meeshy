import XCTest
@testable import MeeshyUI

final class SharedAVPlayerManagerReleaseTests: XCTestCase {

    // NOT @MainActor at class level. Each test hops via MainActor.run for the
    // singleton access. Voir feedback_meeshyui_default_isolation.

    func test_release_noOps_whenActiveUrlEmpty() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop() // clean baseline
            XCTAssertEqual(m.activeURL, "")

            m.release(urlString: "https://example.com/video.mp4")

            XCTAssertEqual(m.activeURL, "")
            XCTAssertNil(m.player)
        }
    }

    func test_release_noOps_whenDifferentUrl() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop()
            // Simulate a different URL being active.
            m.activeURL = "https://example.com/other.mp4"

            m.release(urlString: "https://example.com/video.mp4")

            // Active URL préservée (autre vidéo en cours).
            XCTAssertEqual(m.activeURL, "https://example.com/other.mp4")
            // Reset pour les tests suivants.
            m.stop()
        }
    }

    func test_release_clearsState_whenActiveMatches() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop()
            m.activeURL = "https://example.com/video.mp4"

            m.release(urlString: "https://example.com/video.mp4")

            XCTAssertEqual(m.activeURL, "")
            XCTAssertNil(m.player)
            XCTAssertFalse(m.isPlaying)
        }
    }
}
