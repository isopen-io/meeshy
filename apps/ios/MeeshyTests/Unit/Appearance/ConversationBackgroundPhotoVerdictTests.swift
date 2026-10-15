import XCTest
import MeeshySDK
@testable import Meeshy

/// #10707 — une panne passagère garde la dernière photo ; seule une pièce disparue ou
/// refusée (404, 403, 410) rend le fond à Signature. #10706 — une pièce chiffrée ne part
/// jamais au réseau : sans clé sur l'appareil, Signature.
final class ConversationBackgroundPhotoVerdictTests: XCTestCase {

    private func encryptedImage() -> MeeshyMessageAttachment {
        var attachment = MeeshyMessageAttachment.image()
        attachment.isEncrypted = true
        return attachment
    }

    func test_goneStatuses_fallBackToSignature() {
        for status in [403, 404, 410] {
            XCTAssertEqual(ConversationBackgroundPhotoVerdict.of(APIError.serverError(status, nil)), .gone, "\(status)")
        }
        XCTAssertEqual(ConversationBackgroundPhotoVerdict.of(MeeshyError.server(statusCode: 404, message: "")), .gone)
        XCTAssertEqual(ConversationBackgroundPhotoVerdict.of(MeeshyError.forbidden(reason: nil, body: nil)), .gone)
        XCTAssertEqual(ConversationBackgroundPhotoVerdict.of(APIError.unauthorized), .transient)
    }

    func test_outageAndServerFaults_keepTheLastPhoto() {
        XCTAssertEqual(ConversationBackgroundPhotoVerdict.of(APIError.networkError(URLError(.notConnectedToInternet))), .transient)
        XCTAssertEqual(ConversationBackgroundPhotoVerdict.of(APIError.serverError(503, nil)), .transient)
        XCTAssertEqual(ConversationBackgroundPhotoVerdict.of(APIError.serverError(500, nil)), .transient)
        XCTAssertEqual(ConversationBackgroundPhotoVerdict.of(URLError(.timedOut)), .transient)
    }

    func test_probe_goneOnlyWhenTheMetadataRouteSaysSo() async {
        let gone = ConversationBackgroundPhotoProbe { _ in throw APIError.serverError(404, nil) }
        let outage = ConversationBackgroundPhotoProbe { _ in throw URLError(.notConnectedToInternet) }
        let reachable = ConversationBackgroundPhotoProbe { _ in }
        let isGone = await gone.isGone(attachmentId: "a")
        let isOutageGone = await outage.isGone(attachmentId: "a")
        let isReachableGone = await reachable.isGone(attachmentId: "a")
        XCTAssertTrue(isGone)
        XCTAssertFalse(isOutageGone)
        XCTAssertFalse(isReachableGone)
    }

    func test_encryptedAttachment_isNeverFetched_andCannotBePaintedWithoutAKey() {
        let encrypted = encryptedImage()
        XCTAssertEqual(ConversationBackgroundPhotoVerdict.source(for: encrypted), .needsDeviceKey)
        XCTAssertEqual(ConversationBackgroundPhotoVerdict.source(for: .image()), .clear)
        XCTAssertEqual(ConversationBackgroundPhotoVerdict.source(for: nil), .clear)
    }

    func test_pickerOffersNoEncryptedPhoto() {
        XCTAssertFalse(ConversationBackgroundPhotoVerdict.mayBeOffered(encryptedImage()))
        XCTAssertTrue(ConversationBackgroundPhotoVerdict.mayBeOffered(.image()))
    }
}
