import Testing
import Foundation
@testable import MeeshySDK

@Suite("MessageAttachment video sizing")
struct MessageAttachmentVideoSizingTests {

    private func makeAttachment(width: Int?, height: Int?) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: "att1",
            messageId: "msg1",
            fileName: "v.mp4",
            originalName: "v.mp4",
            mimeType: "video/mp4",
            fileSize: 1_000_000,
            filePath: "/tmp/v.mp4",
            fileUrl: "https://example.com/v.mp4",
            width: width,
            height: height,
            duration: 10_000,
            uploadedBy: "user1"
        )
    }

    @Test("16:9 landscape returns width / 1.778")
    func landscape16x9() {
        let att = makeAttachment(width: 1920, height: 1080)
        #expect(abs((att.videoHeight(forWidth: 280) - 157.5)) < 0.5)
    }

    @Test("9:16 portrait caps at 1.6 × width")
    func portrait9x16() {
        let att = makeAttachment(width: 1080, height: 1920)
        // Raw: 280 × (1920/1080) = 497.7 — cap = 280 × 1.6 = 448
        #expect(att.videoHeight(forWidth: 280, maxRatio: 1.6) == 448)
    }

    @Test("1:1 square returns width")
    func square1x1() {
        let att = makeAttachment(width: 500, height: 500)
        #expect(att.videoHeight(forWidth: 280) == 280)
    }

    @Test("missing dimensions falls back to 16:9")
    func missingDimensions() {
        let att = makeAttachment(width: nil, height: nil)
        #expect(abs((att.videoHeight(forWidth: 280) - 157.5)) < 0.5)
    }

    @Test("zero dimensions falls back to 16:9")
    func zeroDimensions() {
        let att = makeAttachment(width: 0, height: 0)
        #expect(abs((att.videoHeight(forWidth: 280) - 157.5)) < 0.5)
    }

    @Test("videoAspectRatio nil when missing")
    func aspectRatioNilWhenMissing() {
        let att = makeAttachment(width: nil, height: nil)
        #expect(att.videoAspectRatio == nil)
    }

    @Test("videoAspectRatio computed correctly")
    func aspectRatioComputed() {
        let att = makeAttachment(width: 1920, height: 1080)
        #expect(abs((att.videoAspectRatio ?? 0) - (1920.0 / 1080.0)) < 0.001)
    }
}
