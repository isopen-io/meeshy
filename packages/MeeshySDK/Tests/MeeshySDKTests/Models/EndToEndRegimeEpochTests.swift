import XCTest
@testable import MeeshySDK

/// **Le régime se lit daté par son époque, pour la lecture comme pour l'envoi**
/// (#12883, spec E2EE libsignal § 5.2, directive #9224).
///
/// Le chiffrement se désactive depuis #12522. Une désactivation DATÉE (une
/// époque plus récente, servie par le statut, la bascule ou l'événement socket)
/// rend aux messages SUIVANTS les features serveur : ils sont ordinaires et
/// traduits par le serveur. Les messages de l'ère chiffrée gardent leur
/// verdict. Une annonce NON datée (une ligne de liste sans régime) ne rétrograde
/// toujours rien : elle ne se distingue pas d'une rétrogradation forcée.
final class EndToEndRegimeEpochTests: XCTestCase {
    private let activation = Date(timeIntervalSince1970: 500)
    private let deactivation = Date(timeIntervalSince1970: 5_000)

    private func peerMessage(at createdAt: Date) -> MeeshyMessage {
        MeeshyMessage(
            id: "m-\(Int(createdAt.timeIntervalSince1970))", conversationId: "c1", senderId: "u-peer",
            content: "On se voit demain ?", isEncrypted: false, createdAt: createdAt, updatedAt: createdAt
        )
    }

    private var rememberedEncrypted: EndToEndRegime {
        .dated(isEndToEnd: true, epoch: 1, at: activation, enabledAt: activation)
    }

    private var datedDeactivation: EndToEndRegime {
        .dated(isEndToEnd: false, epoch: 2, at: deactivation)
    }

    // MARK: - Après une désactivation datée

    func test_afterADeactivation_thePeersNextPlaintextIsOrdinaryAndTranslatedByTheServer() {
        let regime = datedDeactivation.merging(rememberedEncrypted)
        let after = peerMessage(at: Date(timeIntervalSince1970: 9_000))

        XCTAssertEqual(EndToEndPlaintextLaw.standing(of: after, in: regime), .ordinary)
        XCTAssertTrue(regime.admitsWireTranslations(forMessageCreatedAt: after.createdAt))
    }

    func test_afterADeactivation_aPlaintextOfTheEncryptedEraKeepsItsVerdict() {
        let regime = datedDeactivation.merging(rememberedEncrypted)
        let during = peerMessage(at: Date(timeIntervalSince1970: 2_000))

        XCTAssertEqual(EndToEndPlaintextLaw.standing(of: during, in: regime), .unencrypted)
        XCTAssertFalse(regime.admitsWireTranslations(forMessageCreatedAt: during.createdAt))
        XCTAssertTrue(regime.hasEncryptedEra)
    }

    func test_theOrderOfObservationsDoesNotMatter_theNewerEpochWins() {
        let oneWay = datedDeactivation.merging(rememberedEncrypted)
        let otherWay = rememberedEncrypted.merging(datedDeactivation)

        XCTAssertEqual(oneWay, otherWay)
        XCTAssertFalse(oneWay.isEndToEnd)
    }

    func test_anOlderEpochNeverReopensTheEncryptedRegime() {
        let regime = rememberedEncrypted.merging(datedDeactivation).merging(rememberedEncrypted)

        XCTAssertFalse(regime.isEndToEnd)
    }

    func test_twoObservationsOfTheSameEpochThatDisagree_failClosed() {
        let conflicting = EndToEndRegime.dated(isEndToEnd: true, epoch: 2, at: deactivation, enabledAt: deactivation)

        XCTAssertTrue(datedDeactivation.merging(conflicting).isEndToEnd)
        XCTAssertTrue(conflicting.merging(datedDeactivation).isEndToEnd)
    }

    // MARK: - Ce qui n'est pas daté ne rétrograde rien

    func test_anUndatedClearAnnouncement_neverDowngrades() {
        let regime = EndToEndRegime(encryptionMode: nil, enabledAt: nil).merging(rememberedEncrypted)
        let after = peerMessage(at: Date(timeIntervalSince1970: 9_000))

        XCTAssertEqual(EndToEndPlaintextLaw.standing(of: after, in: regime), .unencrypted)
        XCTAssertFalse(regime.admitsWireTranslations(forMessageCreatedAt: after.createdAt))
    }

    func test_aStaleUndatedEncryptedRow_doesNotReopenTheClosedEra() {
        let staleRow = EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation)
        let regime = staleRow.merging(datedDeactivation.merging(rememberedEncrypted))
        let after = peerMessage(at: Date(timeIntervalSince1970: 9_000))

        XCTAssertFalse(regime.isEndToEnd)
        XCTAssertEqual(EndToEndPlaintextLaw.standing(of: after, in: regime), .ordinary)
    }

    func test_anUndatedReactivationWithoutDate_failsClosedFromTheDeactivationOn() {
        let undated = EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil)
        let regime = undated.merging(datedDeactivation.merging(rememberedEncrypted))

        XCTAssertTrue(regime.isEndToEnd)
        XCTAssertTrue(regime.governs(createdAt: Date(timeIntervalSince1970: 9_000)))
        XCTAssertTrue(regime.governs(createdAt: Date(timeIntervalSince1970: 2_000)), "l'ère close garde son verdict")
    }

    // MARK: - Une réactivation

    func test_aDatedReactivation_opensANewEra_andTheClearIntervalStaysOrdinary() {
        let reactivation = Date(timeIntervalSince1970: 20_000)
        let regime = EndToEndRegime.dated(isEndToEnd: true, epoch: 3, at: reactivation, enabledAt: reactivation)
            .merging(datedDeactivation.merging(rememberedEncrypted))

        XCTAssertTrue(regime.isEndToEnd)
        XCTAssertTrue(regime.governs(createdAt: Date(timeIntervalSince1970: 2_000)))
        XCTAssertFalse(regime.governs(createdAt: Date(timeIntervalSince1970: 9_000)))
        XCTAssertTrue(regime.governs(createdAt: Date(timeIntervalSince1970: 25_000)))
    }

    // MARK: - Ce que l'appareil retient

    /// Un régime retenu AVANT les époques (non daté) est plus ancien que toute
    /// bascule datée qu'on apprend ensuite : la désactivation clôt son ère.
    func test_aDatedDeactivationSupersedingUndatedMemory_closesItsEra() {
        let legacy = EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation)

        let learned = datedDeactivation.superseding(legacy)

        XCTAssertFalse(learned.isEndToEnd)
        XCTAssertTrue(learned.governs(createdAt: Date(timeIntervalSince1970: 2_000)))
        XCTAssertFalse(learned.governs(createdAt: Date(timeIntervalSince1970: 9_000)))
    }

    func test_superseding_anOlderDatedRegime_isDecidedByTheEpoch() {
        let newer = EndToEndRegime.dated(isEndToEnd: true, epoch: 1, at: activation, enabledAt: activation)

        XCTAssertFalse(newer.superseding(datedDeactivation).isEndToEnd, "l'époque 2 reste la plus récente")
    }

    func test_aRegimeRememberedBeforeEpochs_stillDecodes() throws {
        let stored = Data(#"{"isEndToEnd":true,"enabledAt":0}"#.utf8)

        let decoded = try JSONDecoder().decode(EndToEndRegime.self, from: stored)

        XCTAssertEqual(decoded, EndToEndRegime(isEndToEnd: true, enabledAt: Date(timeIntervalSinceReferenceDate: 0)))
    }

    func test_aClosedEraSurvivesTheRoundTrip() throws {
        let regime = datedDeactivation.merging(rememberedEncrypted)

        let decoded = try JSONDecoder().decode(EndToEndRegime.self, from: JSONEncoder().encode(regime))

        XCTAssertEqual(decoded, regime)
    }
}
