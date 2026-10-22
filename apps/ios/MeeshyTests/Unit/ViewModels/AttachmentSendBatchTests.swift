import XCTest
import UIKit
@testable import Meeshy
import MeeshySDK

@MainActor
final class AttachmentSendBatchTests: XCTestCase {

    private typealias Planned = MultiAttachmentSendPlanner.PlannedMessage

    private func attachment(_ id: String, mimeType: String = "image/jpeg", capturedInApp: Bool = false) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, mimeType: mimeType, capturedInApp: capturedInApp)
    }

    private func group(_ kind: MultiAttachmentSendPlanner.Kind, _ attachments: [MeeshyMessageAttachment], text: String? = nil) -> OutgoingMediaGroup {
        OutgoingMediaGroup(
            group: Planned(kind: kind, attachments: attachments, text: text, carriesReply: false),
            tempId: "cid_group", locals: attachments
        )
    }

    private let place = SharedPlace(latitude: 48.85, longitude: 2.35)

    private func makeBatch(plan: [Planned], mediaFiles: [String: URL]) -> AttachmentSendBatch {
        AttachmentSendBatch(
            plan: plan, mediaGroupSends: [], mediaFiles: mediaFiles, thumbnails: [:],
            textGroup: nil, textTempId: nil, place: nil, relation: .none, replyToId: nil,
            protection: MessageProtectionIntent(), language: "fr", currentUserId: "me", guestAllowedKinds: nil
        )
    }

    // MARK: - textTempId

    func test_textTempId_withoutTextNorPlace_isNil() {
        let id = AttachmentSendBatch.textTempId(textGroup: nil, place: nil, generate: { "cid_text" })

        XCTAssertNil(id)
    }

    func test_textTempId_withBlankTextAndNoPlace_isNil() {
        let blank = Planned(kind: .text, attachments: [], text: "  \n", carriesReply: false)

        XCTAssertNil(AttachmentSendBatch.textTempId(textGroup: blank, place: nil, generate: { "cid_text" }))
    }

    func test_textTempId_withText_isGenerated() {
        let text = Planned(kind: .text, attachments: [], text: "Salut", carriesReply: false)

        XCTAssertEqual(AttachmentSendBatch.textTempId(textGroup: text, place: nil, generate: { "cid_text" }), "cid_text")
    }

    func test_textTempId_placeAloneWithoutTextGroup_isGenerated() {
        XCTAssertEqual(AttachmentSendBatch.textTempId(textGroup: nil, place: place, generate: { "cid_place" }), "cid_place")
    }

    func test_textTempId_placeWithBlankTextGroup_isNil() {
        let blank = Planned(kind: .text, attachments: [], text: nil, carriesReply: false)

        XCTAssertNil(AttachmentSendBatch.textTempId(textGroup: blank, place: place, generate: { "cid_place" }))
    }

    // MARK: - cleanupURLs

    func test_cleanupURLs_separatesAudioFromVisual_andSkipsMissingFiles() {
        let voice = attachment("voice", mimeType: "audio/mp4")
        let photo = attachment("photo")
        let lost = attachment("lost")
        let audioURL = URL(fileURLWithPath: "/tmp/voice.m4a")
        let photoURL = URL(fileURLWithPath: "/tmp/photo.jpg")
        let batch = makeBatch(
            plan: [
                Planned(kind: .audio, attachments: [voice], text: nil, carriesReply: false),
                Planned(kind: .visual, attachments: [photo, lost], text: nil, carriesReply: false),
                Planned(kind: .text, attachments: [], text: "légende", carriesReply: false)
            ],
            mediaFiles: ["voice": audioURL, "photo": photoURL]
        )

        let urls = batch.cleanupURLs()

        XCTAssertEqual(urls.audio, [audioURL])
        XCTAssertEqual(urls.visual, [photoURL])
    }

    // MARK: - MediaGroupUploadItem.items

    func test_items_audioGroup_forcesAudioMp4() {
        let voice = attachment("voice", mimeType: "audio/x-m4a")
        let url = URL(fileURLWithPath: "/tmp/voice.m4a")

        let items = MediaGroupUploadItem.items(
            for: group(.audio, [voice]), mediaFiles: ["voice": url], thumbnails: [:], transcriptions: [:]
        )

        XCTAssertEqual(items.map(\.mimeType), ["audio/mp4"])
        XCTAssertEqual(items.map(\.isAudio), [true])
        XCTAssertEqual(items.map(\.isImage), [false])
    }

    func test_items_visualGroup_keepsMimeTypeAndFlagsImages() {
        let photo = attachment("photo", mimeType: "image/png")
        let url = URL(fileURLWithPath: "/tmp/photo.png")

        let items = MediaGroupUploadItem.items(
            for: group(.visual, [photo]), mediaFiles: ["photo": url], thumbnails: [:], transcriptions: [:]
        )

        XCTAssertEqual(items.map(\.mimeType), ["image/png"])
        XCTAssertEqual(items.map(\.isImage), [photo.type == .image])
        XCTAssertEqual(items.map(\.isAudio), [false])
    }

    func test_items_dropsAttachmentsWithoutFile_andKeepsComposerOrder() {
        let first = attachment("a")
        let missing = attachment("b")
        let last = attachment("c")
        let urls = ["a": URL(fileURLWithPath: "/tmp/a.jpg"), "c": URL(fileURLWithPath: "/tmp/c.jpg")]

        let items = MediaGroupUploadItem.items(
            for: group(.visual, [first, missing, last]), mediaFiles: urls, thumbnails: [:], transcriptions: [:]
        )

        XCTAssertEqual(items.map(\.attachmentId), ["a", "c"])
    }

    func test_items_carriesTheLocalTranscriptionAndCaptureProvenance() {
        let voice = attachment("voice", mimeType: "audio/mp4", capturedInApp: true)
        let transcription = MessageTranscription(attachmentId: "voice", text: "Bonjour", language: "fr")

        let items = MediaGroupUploadItem.items(
            for: group(.audio, [voice]), mediaFiles: ["voice": URL(fileURLWithPath: "/tmp/voice.m4a")],
            thumbnails: [:], transcriptions: ["voice": transcription]
        )

        XCTAssertEqual(items.first?.transcription, transcription.tusUploadMetadata)
        XCTAssertEqual(items.first?.capturedInApp, true)
    }
}
