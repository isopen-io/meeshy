import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

final class TimelineMediaSourceTests: XCTestCase {
    func test_init_video_storesURLAndKindVideo() {
        let url = URL(fileURLWithPath: "/tmp/test.mp4")
        let source = TimelineMediaSource(id: "clip-1", kind: .video, url: url)
        XCTAssertEqual(source.id, "clip-1")
        XCTAssertEqual(source.kind, .video)
        XCTAssertEqual(source.url, url)
    }
}
