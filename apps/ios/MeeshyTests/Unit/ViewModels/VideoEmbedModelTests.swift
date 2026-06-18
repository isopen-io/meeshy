import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class VideoEmbedModelTests: XCTestCase {

    override func tearDown() {
        MediaSessionCoordinator.shared.setCallActive(false)
        super.tearDown()
    }

    func test_start_whenCallActive_staysIdle() {
        MediaSessionCoordinator.shared.setCallActive(true)
        let model = VideoEmbedModel()
        model.start()
        XCTAssertEqual(model.phase, .idle)
    }

    func test_start_whenNoCall_movesToLoading() {
        MediaSessionCoordinator.shared.setCallActive(false)
        let model = VideoEmbedModel()
        model.start()
        XCTAssertEqual(model.phase, .loading)
    }

    func test_stop_resetsToIdle() {
        MediaSessionCoordinator.shared.setCallActive(false)
        let model = VideoEmbedModel()
        model.start()
        model.stop()
        XCTAssertEqual(model.phase, .idle)
    }

    func test_onState_playingMovesToPlaying() {
        MediaSessionCoordinator.shared.setCallActive(false)
        let model = VideoEmbedModel()
        model.start()
        model.onState(.playing)
        XCTAssertEqual(model.phase, .playing)
    }
}
