import XCTest
@testable import MeeshySDK

/// Révocation de notifications (features 4/5) — le gateway retire une
/// notification déjà poussée par un push de contrôle SILENCIEUX dont le
/// `userInfo` porte `type = "notification_revoked"` et les ids joints par
/// virgule. Le parseur est PUR : il ne lit que ce type et rend la liste que
/// le retrait de bannières consomme — SANS filtrer les entrées vides, dont
/// le RANG porte un sens (`conversationIds` partage le même rang que
/// `notificationIds` ; une entrée vide au rang i affirme « pas de
/// conversation pour `notificationIds[i]` » — cf. #3894).
final class NotificationRevocationPayloadTests: XCTestCase {

    private func userInfo(
        type: String? = NotificationRevocationPayload.pushType,
        notificationIds: Any? = nil,
        conversationIds: Any? = nil
    ) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [:]
        if let type { info["type"] = type }
        if let notificationIds { info["notificationIds"] = notificationIds }
        if let conversationIds { info["conversationIds"] = conversationIds }
        return info
    }

    // MARK: - Parsing

    func test_init_withCommaJoinedIds_parsesEveryId() throws {
        let payload = try XCTUnwrap(NotificationRevocationPayload(userInfo: userInfo(
            notificationIds: "n1,n2,n3"
        )))
        XCTAssertEqual(payload.notificationIds, ["n1", "n2", "n3"])
        XCTAssertEqual(payload.conversationIds, [])
    }

    /// Le contrat gateway aligne `conversationIds[i]` sur `notificationIds[i]`
    /// (même rang) ; une entrée vide au rang 2 de `conversationIds` affirme
    /// qu'il n'y a pas de conversation pour le 2e id — la SUPPRIMER décalerait
    /// le rang 3 (`c3`) sur le mauvais id. Chaque tableau se trime (espaces
    /// rognés) mais AUCUNE entrée n'est filtrée : le rang est le contrat.
    func test_init_withEmptyEntries_preservesPositionalAlignmentBetweenBothArrays() throws {
        let payload = try XCTUnwrap(NotificationRevocationPayload(userInfo: userInfo(
            notificationIds: "n1, n2 ,n3",
            conversationIds: "c1,,c3"
        )))
        XCTAssertEqual(payload.notificationIds, ["n1", "n2", "n3"])
        XCTAssertEqual(payload.conversationIds, ["c1", "", "c3"],
                       "le vide au rang 2 doit rester à sa place — le filtrer désynchroniserait c3 sur n2")
    }

    func test_init_withOnlyEmptyIds_matchesNoDeliveredBanner() throws {
        let payload = try XCTUnwrap(NotificationRevocationPayload(userInfo: userInfo(
            notificationIds: ",,"
        )))
        XCTAssertFalse(payload.covers(["notificationId": "n1"]),
                        "un push de révocation sans id RÉEL reste un push de révocation (rien à retirer), pas un réveil de sync")
    }

    func test_init_withArrayIds_isAcceptedToo() throws {
        let payload = try XCTUnwrap(NotificationRevocationPayload(userInfo: userInfo(
            notificationIds: ["n1", "", "n2"]
        )))
        XCTAssertEqual(payload.notificationIds, ["n1", "", "n2"],
                       "le rang se préserve même pour notificationIds — covers() ignore déjà les ids vides")
    }

    // MARK: - Type gate

    func test_init_withoutType_isNil() {
        XCTAssertNil(NotificationRevocationPayload(userInfo: userInfo(type: nil, notificationIds: "n1")),
                     "sans `type`, ce n'est pas une révocation — le handler doit poursuivre vers la sync")
    }

    func test_init_withAnotherType_isNil() {
        XCTAssertNil(NotificationRevocationPayload(userInfo: userInfo(type: "new_message", notificationIds: "n1")))
        XCTAssertNil(NotificationRevocationPayload(userInfo: userInfo(type: "call_cancel", notificationIds: "n1")))
    }

    // MARK: - Delivered-banner predicate

    func test_covers_matchesADeliveredBannerByItsNotificationId() {
        let payload = NotificationRevocationPayload(notificationIds: ["n1", "n2"], conversationIds: [])
        XCTAssertTrue(payload.covers(["notificationId": "n2", "conversationId": "c9"]))
        XCTAssertFalse(payload.covers(["notificationId": "n3"]))
    }

    func test_covers_ignoresBannersWithoutNotificationId() {
        let payload = NotificationRevocationPayload(notificationIds: ["n1"], conversationIds: [])
        XCTAssertFalse(payload.covers(["conversationId": "c1"]),
                       "une bannière sans `notificationId` (appel, ancien format) n'est jamais retirée par erreur")
        XCTAssertFalse(payload.covers(["notificationId": ""]))
    }
}
