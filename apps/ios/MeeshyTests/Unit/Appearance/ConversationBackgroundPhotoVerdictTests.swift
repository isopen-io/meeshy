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

    func test_probe_signatureOnlyWhenTheMetadataRouteSaysGoneOrEncrypted() async {
        let gone = ConversationBackgroundPhotoProbe { _ in throw APIError.serverError(404, nil) }
        let outage = ConversationBackgroundPhotoProbe { _ in throw URLError(.notConnectedToInternet) }
        let reachable = ConversationBackgroundPhotoProbe { _ in false }
        let encrypted = ConversationBackgroundPhotoProbe { _ in true }
        let isGone = await gone.fallsBackToSignature(attachmentId: "a")
        let isOutageSignature = await outage.fallsBackToSignature(attachmentId: "a")
        let isReachableSignature = await reachable.fallsBackToSignature(attachmentId: "a")
        let isEncryptedSignature = await encrypted.fallsBackToSignature(attachmentId: "a")
        XCTAssertTrue(isGone)
        XCTAssertFalse(isOutageSignature)
        XCTAssertFalse(isReachableSignature)
        XCTAssertTrue(isEncryptedSignature, "une pièce chiffrée hors de la fenêtre chargée : faute de clé, Signature — comme le web")
    }

    func test_aLateVerdict_settlesOnlyThePhotoStillShown() {
        let shown = ConversationBackgroundResolution.photo(attachmentId: "a", veil: 0.2, blur: 0)
        XCTAssertTrue(ConversationBackgroundPhotoVerdict.settles(probed: "a", current: shown))
        XCTAssertFalse(ConversationBackgroundPhotoVerdict.settles(probed: "a", current: .photo(attachmentId: "b", veil: 0.2, blur: 0)),
                       "le verdict d'une photo quittée ne repeint pas la suivante en Signature")
        XCTAssertFalse(ConversationBackgroundPhotoVerdict.settles(probed: "a", current: .signature))
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

/// #10708 — le sélecteur rouvert s'ouvre sur les packs installés déjà lus pour CE compte, pas sur
/// les packs d'office qu'une lecture réseau remplacerait sous le doigt.
@MainActor
final class InstalledWallpapersMemoTests: XCTestCase {

    func test_theLastReadListIsServedToTheSameAccountOnly() {
        var memo = InstalledWallpapersMemo()
        XCTAssertNil(memo.packs(for: "u1"), "rien de lu : les packs d'office")
        memo.remember([ShopPack(slug: "aurore", name: "Aurore")], for: "u1")
        XCTAssertEqual(memo.packs(for: "u1")?.map(\.slug), ["aurore"])
        XCTAssertNil(memo.packs(for: "u2"), "un autre compte ne lit pas la liste du premier")
        XCTAssertNil(memo.packs(for: nil))
    }
}
