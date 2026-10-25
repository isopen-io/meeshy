import XCTest
@testable import MeeshySDK

/// **Une conversation vue chiffrée de bout en bout le reste** (#12949, décision
/// porteur du 2026-10-25, spec E2EE libsignal § 5) : le régime est monotone,
/// seule la frontière d'activation est datée, et aucun message chiffré ou
/// déchiffré sur l'appareil n'admet une traduction du serveur (#12935).
final class EndToEndRegimeIrreversibleTests: XCTestCase {
    private let activation = Date(timeIntervalSince1970: 500)

    private var endToEnd: EndToEndRegime { EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation) }

    private func peerMessage(at seconds: TimeInterval, isEncrypted: Bool = false, mode: String? = nil) -> MeeshyMessage {
        let createdAt = Date(timeIntervalSince1970: seconds)
        return MeeshyMessage(
            id: "m-\(Int(seconds))", conversationId: "c1", senderId: "u-peer",
            content: isEncrypted ? "Q2lwaGVy" : "On se voit demain ?", isEncrypted: isEncrypted, encryptionMode: mode,
            createdAt: createdAt, updatedAt: createdAt
        )
    }

    // MARK: - Monotone

    func test_aServedDowngrade_neverClosesTheEncryptedRegime_inEitherOrder() {
        for downgrade in [EndToEndRegime.serverReadable, EndToEndRegime(encryptionMode: "server", enabledAt: nil)] {
            XCTAssertEqual(endToEnd.merging(downgrade), endToEnd)
            XCTAssertEqual(downgrade.merging(endToEnd), endToEnd)
        }
    }

    func test_twoActivations_keepTheEarliestBoundary() {
        let later = EndToEndRegime(encryptionMode: "e2ee", enabledAt: Date(timeIntervalSince1970: 900))
        let undated = EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil)

        XCTAssertEqual(later.merging(endToEnd).enabledAt, activation)
        XCTAssertEqual(endToEnd.merging(undated).enabledAt, activation)
        XCTAssertNil(undated.merging(nil).enabledAt)
    }

    func test_aServerReadableRegime_mergedWithNothing_staysServerReadable() {
        XCTAssertEqual(EndToEndRegime(encryptionMode: "server", enabledAt: activation).merging(nil), .serverReadable)
        XCTAssertFalse(EndToEndRegime(encryptionMode: nil, enabledAt: nil).isEndToEnd)
    }

    // MARK: - La frontière d'activation

    func test_theActivation_splitsHistoryFromTheEncryptedEra() {
        XCTAssertFalse(endToEnd.governs(createdAt: Date(timeIntervalSince1970: 100)))
        XCTAssertTrue(endToEnd.governs(createdAt: activation))
        XCTAssertTrue(endToEnd.governs(createdAt: nil), "un instant inconnu se range dans l'ère chiffrée")
        XCTAssertTrue(EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil).governs(createdAt: Date(timeIntervalSince1970: 1)))
        XCTAssertFalse(EndToEndRegime.serverReadable.governs(createdAt: nil))
    }

    /// #12936 — une activation servie dans le futur est bornée à l'instant de sa lecture.
    func test_anActivationServedInTheFuture_isBoundedByTheReadingInstant() {
        let readAt = Date(timeIntervalSince1970: 10_000)
        let regime = EndToEndRegime(encryptionMode: "e2ee", enabledAt: Date(timeIntervalSince1970: 99_999), readAt: readAt)

        XCTAssertEqual(regime.enabledAt, readAt)
        XCTAssertTrue(regime.governs(createdAt: Date(timeIntervalSince1970: 10_000)))
    }

    // MARK: - Les traductions du serveur

    func test_wireTranslations_onlyForPlaintextTheServerRead_beforeTheActivation() {
        XCTAssertTrue(endToEnd.admitsWireTranslations(of: peerMessage(at: 100)))
        XCTAssertFalse(endToEnd.admitsWireTranslations(of: peerMessage(at: 900)), "le serveur l'a forgée")
        XCTAssertTrue(EndToEndRegime.serverReadable.admitsWireTranslations(of: peerMessage(at: 900)))
    }

    /// #12935 — un message chiffré de bout en bout, ou déchiffré sur l'appareil,
    /// n'admet aucune traduction du serveur, quelle que soit sa date.
    func test_wireTranslations_neverForAnEndToEndMessage_whateverItsDate() {
        var decrypted = peerMessage(at: 100, isEncrypted: true, mode: "e2ee")
        decrypted.adoptDecryptedContent("Salut")

        for regime in [endToEnd, EndToEndRegime.serverReadable] {
            XCTAssertFalse(regime.admitsWireTranslations(of: peerMessage(at: 100, isEncrypted: true, mode: "e2ee")))
            XCTAssertFalse(regime.admitsWireTranslations(of: peerMessage(at: 100, isEncrypted: true)), "chiffré sans mode : fail-closed")
            XCTAssertFalse(regime.admitsWireTranslations(of: decrypted))
        }
    }

    func test_wireTranslations_ofAMessageTheServerEncrypted_stayAdmitted() {
        XCTAssertTrue(EndToEndRegime.serverReadable.admitsWireTranslations(of: peerMessage(at: 900, isEncrypted: true, mode: "server")))
    }

    // MARK: - Ce que l'appareil retient

    func test_codable_roundTrips() throws {
        let decoded = try JSONDecoder().decode(EndToEndRegime.self, from: JSONEncoder().encode(endToEnd))

        XCTAssertEqual(decoded, endToEnd)
    }
}

/// Audit #12950 (B1) — la PROVENANCE prime sur les étiquettes servies : un
/// message que l'appareil a déchiffré reste chiffré de bout en bout même si le
/// serveur le ressert « server » dans une conversation servie sans mode.
final class EndToEndProvenanceTests: XCTestCase {
    func test_aMessageDecryptedOnDevice_relabeledServerReadable_staysEndToEnd() {
        var message = MeeshyMessage(
            id: "m1", conversationId: "c1", senderId: "u-peer", content: "Q2lwaGVy", originalLanguage: "en",
            isEncrypted: true, encryptionMode: "server"
        )
        message.adoptDecryptedContent("Salut")

        XCTAssertTrue(DeviceTranslationEligibility.isEndToEnd(message, conversationEncryptionMode: nil))
        XCTAssertEqual(DeviceTranslationEligibility.disposition(of: message, conversationEncryptionMode: nil), .ephemeral)
    }
}
