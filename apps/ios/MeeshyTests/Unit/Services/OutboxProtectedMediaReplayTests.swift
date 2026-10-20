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
        let source = try ["ConversationView+AttachmentHandlers.swift", "AttachmentGroupOutbox.swift"]
            .map { try String(contentsOf: Self.appRoot.appendingPathComponent("Features/Main/Views/\($0)"), encoding: .utf8) }
            .joined(separator: "\n")
        let regex = try NSRegularExpression(pattern: #"carriesReply \? (?:replyId|replyToId) : nil,\s*protection: protection"#)
        let hits = regex.numberOfMatches(in: source, range: NSRange(source.startIndex..., in: source))
        XCTAssertEqual(hits, 4, "les quatre mises en file média (hors ligne et échec en ligne, audio et visuel) portent l'intention")
    }

    // MARK: - Rejeu texte : la langue d'origine voyage

    /// Le rejeu TEXTE du flusher omettait `originalLanguage` (les rejeux média,
    /// protégé et socket la portent) : tout message écrit hors ligne ou après
    /// un échec d'envoi arrivait sans langue, et le serveur la redevinait.
    func test_textReplayRequest_carriesTheOriginalLanguage() throws {
        let item = OfflineQueueItem(conversationId: "conv-1", content: "Bonjour",
                                    clientMessageId: "cid_text", originalLanguage: "fr")
        let body = try json(OutboxDispatcher.textReplayRequest(for: item, copyAttachmentsFromMessageId: nil))
        XCTAssertEqual(body["originalLanguage"] as? String, "fr")
        XCTAssertEqual(body["content"] as? String, "Bonjour")
        XCTAssertEqual(body["clientMessageId"] as? String, "cid_text")
    }

    func test_textReplayRequest_keepsTheProtection() throws {
        let item = OfflineQueueItem(conversationId: "conv-1", content: "secret", clientMessageId: "cid_vo",
                                    protection: MessageProtectionIntent(ephemeral: nil, isViewOnce: true))
        let body = try json(OutboxDispatcher.textReplayRequest(for: item, copyAttachmentsFromMessageId: "m-src"))
        XCTAssertEqual(body["isViewOnce"] as? Bool, true)
        XCTAssertEqual(body["copyAttachmentsFromMessageId"] as? String, "m-src")
    }

    /// #9914, #10947 — un transfert d'UNE pièce mis en file la rejoue seule :
    /// sans la clé, la passerelle recopierait tout le lot écarté.
    func test_textReplayRequest_keepsTheChosenPieceOfAForward() throws {
        let item = OfflineQueueItem(conversationId: "conv-1", content: "", clientMessageId: "cid_fw",
                                    forwardedFromId: "m-src", forwardedAttachmentIds: ["p3"])
        let body = try json(OutboxDispatcher.textReplayRequest(for: item, copyAttachmentsFromMessageId: nil))
        XCTAssertEqual(body["forwardedFromId"] as? String, "m-src")
        XCTAssertEqual(body["forwardedAttachmentIds"] as? [String], ["p3"])
    }

    // MARK: - Un envoi média ne part que complet

    func test_requireCompleteUpload_oneOfThreeFailed_throwsTheOriginalError() {
        let cut = URLError(.networkConnectionLost)
        XCTAssertThrowsError(try OutboxDispatcher.requireCompleteUpload(
            uploadedIds: ["up1", "up2"], firstUploadError: cut, emptyDescription: "none")) { error in
            XCTAssertEqual((error as? URLError)?.code, .networkConnectionLost,
                           "un envoi partiel ferait perdre la troisième photo")
        }
    }

    func test_requireCompleteUpload_nothingUploaded_throws() {
        XCTAssertThrowsError(try OutboxDispatcher.requireCompleteUpload(
            uploadedIds: [], firstUploadError: nil, emptyDescription: "none"))
    }

    func test_requireCompleteUpload_allUploaded_passes() {
        XCTAssertNoThrow(try OutboxDispatcher.requireCompleteUpload(
            uploadedIds: ["up1"], firstUploadError: nil, emptyDescription: "none"))
    }
}
