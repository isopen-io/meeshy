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

    func test_fromMediaObject_videoKind_resolvesURL() {
        let media = StoryMediaObject(
            id: "m1", postMediaId: "pm1",
            mediaType: "video", placement: "media",
            x: 0.5, y: 0.5
        )
        let url = URL(fileURLWithPath: "/tmp/v.mp4")
        let urls = ["m1": url]
        let source = TimelineMediaSource.fromMediaObject(media, videoURLs: urls, audioURLs: [:])
        XCTAssertEqual(source?.kind, .video)
        XCTAssertEqual(source?.url, url)
        XCTAssertEqual(source?.id, "m1")
    }

    func test_fromMediaObject_imageKind_returnsImageSourceWithNilURL() {
        let media = StoryMediaObject(
            id: "m2", postMediaId: "pm2",
            mediaType: "image", placement: "media"
        )
        let source = TimelineMediaSource.fromMediaObject(media, videoURLs: [:], audioURLs: [:])
        XCTAssertEqual(source?.kind, .image)
        XCTAssertNil(source?.url)
    }

    func test_fromMediaObject_unknownKind_returnsNil() {
        let media = StoryMediaObject(
            id: "m3", postMediaId: "pm3",
            mediaType: "unknown_type", placement: "media"
        )
        let source = TimelineMediaSource.fromMediaObject(media, videoURLs: [:], audioURLs: [:])
        XCTAssertNil(source)
    }

    func test_fromAudioObject_returnsAudioSource() {
        let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pma1")
        let url = URL(fileURLWithPath: "/tmp/song.m4a")
        let source = TimelineMediaSource.fromAudioObject(audio, audioURLs: ["a1": url])
        XCTAssertEqual(source?.kind, .audio)
        XCTAssertEqual(source?.url, url)
        XCTAssertEqual(source?.id, "a1")
    }
}
