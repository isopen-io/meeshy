import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un média protégé envoyé hors ligne repart avec sa protection** (#8350).
///
/// Les branches MÉDIA du rejeu (audio `localAudioPaths`, visuels
/// `localMediaPaths`) repartaient par `sendWithAttachmentsAsync`, qui ne
/// transporte aucune protection : une photo floutée, à vue unique, éphémère ou
/// flamme-œil capturée hors ligne repartait EN CLAIR. Un envoi protégé repart
/// désormais par le POST, après le téléversement TUS, avec sa protection.
@MainActor
final class OutboxProtectedMediaReplayTests: XCTestCase {

    private func json(_ request: SendMessageRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(request)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func mediaItem(_ protection: MessageProtectionIntent) -> OfflineQueueItem {
        OfflineQueueItem(conversationId: "conv-1", content: "", clientMessageId: "cid_media",
                         localMediaPaths: ["pending-media/cid_media/0.jpg"], protection: protection)
    }

    func test_protectedMediaReplayRequest_blurred_carriesTheBlurAndTheUploads() throws {
        let request = try XCTUnwrap(OutboxDispatcher.protectedMediaReplayRequest(
            for: mediaItem(MessageProtectionIntent(ephemeral: nil, isBlurred: true)), uploadedIds: ["up1", "up2"]))

        let body = try json(request)
        XCTAssertEqual(body["attachmentIds"] as? [String], ["up1", "up2"])
        XCTAssertEqual(body["isBlurred"] as? Bool, true)
        XCTAssertEqual(body["clientMessageId"] as? String, "cid_media")
    }

    func test_protectedMediaReplayRequest_viewOnceAndDuration_carryBoth() throws {
        let request = try XCTUnwrap(OutboxDispatcher.protectedMediaReplayRequest(
            for: mediaItem(MessageProtectionIntent(ephemeral: .duration(.fifteenSeconds), isViewOnce: true)),
            uploadedIds: ["up1"]))

        let body = try json(request)
        XCTAssertEqual(body["isViewOnce"] as? Bool, true)
        XCTAssertEqual(body["ephemeralDuration"] as? Int, 15)
    }

    func test_protectedMediaReplayRequest_flameEye_sendsBothBitsWithoutDuration() throws {
        let request = try XCTUnwrap(OutboxDispatcher.protectedMediaReplayRequest(
            for: mediaItem(MessageProtectionIntent(ephemeral: .afterRead)), uploadedIds: ["up1"]))

        let body = try json(request)
        XCTAssertEqual(body["effectFlags"] as? UInt32, MessageEffectFlags([.ephemeral, .ephemeralAfterRead]).rawValue)
        XCTAssertNil(body["ephemeralDuration"])
    }

    func test_protectedMediaReplayRequest_unprotected_isNil_theSocketReplayStays() {
        XCTAssertNil(OutboxDispatcher.protectedMediaReplayRequest(for: mediaItem(.none), uploadedIds: ["up1"]))
    }

    // MARK: - Câblage

    private static var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Meeshy")
    }

    func test_wiring_bothMediaBranches_replayThroughTheProtectionAwareSender() throws {
        let source = try String(contentsOf: Self.appRoot.appendingPathComponent(
            "Features/Main/Services/OutboxDispatcher+Messages.swift"), encoding: .utf8)
        XCTAssertEqual(source.components(separatedBy: "try await replayUploadedAttachments(item").count - 1, 2,
                       "l'audio ET les visuels rejouent par le même envoi, qui porte la protection")
        XCTAssertEqual(source.components(separatedBy: "sendWithAttachmentsAsync(").count - 1, 1,
                       "un seul envoi socket, celui d'un média non protégé")
    }

    func test_wiring_offlineEnqueues_receiveTheIntent() throws {
        let source = try String(contentsOf: Self.appRoot.appendingPathComponent(
            "Features/Main/Views/ConversationView+AttachmentHandlers.swift"), encoding: .utf8)
        let regex = try NSRegularExpression(pattern: #"carriesReply \? replyId : nil,\s*protection: protection"#)
        let hits = regex.numberOfMatches(in: source, range: NSRange(source.startIndex..., in: source))
        XCTAssertEqual(hits, 4, "les quatre mises en file média (hors ligne et échec en ligne, audio et visuel) portent l'intention")
    }
}
