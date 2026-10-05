import MeeshySDK
import XCTest
@testable import Meeshy

// #8437 — la bulle de l'appel rejoue SON enregistrement, qu'il soit audio ou
// vidéo : un enregistrement vidéo n'est pas une pièce jointe ignorée.
final class BubbleCallRecordingTests: XCTestCase {

    private func attachment(_ id: String, mimeType: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, fileName: "\(id).bin", originalName: "\(id).bin", mimeType: mimeType, fileSize: 1)
    }

    func test_from_audioRecording_isPlayedAsAudio() {
        let recording = BubbleContent.CallRecording.from([attachment("a", mimeType: "audio/mp4")])

        XCTAssertEqual(recording?.attachment.id, "a")
        XCTAssertEqual(recording?.isVideo, false)
    }

    func test_from_videoRecording_isPlayedAsVideo() {
        let recording = BubbleContent.CallRecording.from([attachment("v", mimeType: "video/mp4")])

        XCTAssertEqual(recording?.attachment.id, "v")
        XCTAssertEqual(recording?.isVideo, true)
    }

    func test_from_noMedia_hasNoRecording() {
        XCTAssertNil(BubbleContent.CallRecording.from([attachment("d", mimeType: "application/pdf")]))
    }
}
