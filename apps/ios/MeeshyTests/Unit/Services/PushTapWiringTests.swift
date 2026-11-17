import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// ios-systeme-6 (#18911, audit du lot) — le CÂBLAGE de la porte d'un toucher de
/// bannière. `PushTapConsumption.decide` et `PushTapAddressee.resolve` sont
/// éprouvées seules ; ces témoins gardent ce qui les relie : le défaut d'ouverture
/// marque la charge du compte désigné, et la racine ne navigue que par la porte.
///
/// La porte échoue FERMÉ (`nil` ⇒ effacé) : retirer le marquage du défaut
/// jetterait en silence TOUS les touchers, et retirer la porte rouvrirait le
/// défaut — sans ces témoins, aucun des deux ne rougissait.
@MainActor
final class PushTapWiringTests: XCTestCase {

    private static let tappedUser = MeeshyUser(id: "tap-wiring-user", username: "tapwiring", email: "tap@test.io", displayName: "Tap")

    private final class Recorder {
        var navigated: [String?] = []
        var cleared = 0
    }

    private func payload(addressedTo: String?) -> NotificationPayload {
        NotificationPayload(userInfo: ["type": "message", "conversationId": "conv-1"], addressedTo: addressedTo)
    }

    // MARK: - Le défaut d'ouverture

    func test_defaultOpenNotification_marksThePublishedPayloadWithTheActiveAccount() {
        let previousUser = AuthManager.shared.currentUser
        AuthManager.shared.currentUser = Self.tappedUser
        defer {
            AuthManager.shared.currentUser = previousUser
            PushNotificationManager.shared.clearPendingNotification()
        }

        NotificationActionHandler.shared.openNotification(["type": "message", "conversationId": "conv-1"])

        XCTAssertEqual(PushNotificationManager.shared.pendingNotificationPayload?.conversationId, "conv-1")
        XCTAssertEqual(PushNotificationManager.shared.pendingNotificationPayload?.addressedTo, Self.tappedUser.id,
                       "une charge non marquée serait effacée par la porte : le toucher ne mènerait nulle part")
    }

    // MARK: - La porte de consommation

    func test_consume_underTheAddressedAccount_navigatesThenClears() {
        let recorder = Recorder()

        PushTapAddressee.consume(
            payload(addressedTo: "user-A"), isAuthenticated: true, currentUserId: "user-A",
            navigate: { recorder.navigated.append($0.conversationId) }, clear: { recorder.cleared += 1 }
        )

        XCTAssertEqual(recorder.navigated, ["conv-1"])
        XCTAssertEqual(recorder.cleared, 1)
    }

    func test_consume_underAnotherAccount_clearsWithoutNavigating() {
        let recorder = Recorder()

        PushTapAddressee.consume(
            payload(addressedTo: "user-A"), isAuthenticated: true, currentUserId: "user-B",
            navigate: { recorder.navigated.append($0.conversationId) }, clear: { recorder.cleared += 1 }
        )

        XCTAssertEqual(recorder.navigated, [], "B ne tombe pas dans la conversation de A")
        XCTAssertEqual(recorder.cleared, 1)
    }

    func test_consume_aTapMarkedWithoutASession_clearsWithoutNavigating() {
        let recorder = Recorder()

        PushTapAddressee.consume(
            payload(addressedTo: nil), isAuthenticated: true, currentUserId: "user-B",
            navigate: { recorder.navigated.append($0.conversationId) }, clear: { recorder.cleared += 1 }
        )

        XCTAssertEqual(recorder.navigated, [])
        XCTAssertEqual(recorder.cleared, 1)
    }

    func test_consume_whileSignedOut_keepsThePayloadForLater() {
        let recorder = Recorder()

        PushTapAddressee.consume(
            payload(addressedTo: "user-A"), isAuthenticated: false, currentUserId: "user-A",
            navigate: { recorder.navigated.append($0.conversationId) }, clear: { recorder.cleared += 1 }
        )

        XCTAssertEqual(recorder.navigated, [])
        XCTAssertEqual(recorder.cleared, 0, "le démarrage à froid publie avant la restauration de session : la charge attend")
    }

    func test_consume_withNoPayload_doesNothing() {
        let recorder = Recorder()

        PushTapAddressee.consume(
            nil, isAuthenticated: true, currentUserId: "user-A",
            navigate: { recorder.navigated.append($0.conversationId) }, clear: { recorder.cleared += 1 }
        )

        XCTAssertEqual(recorder.navigated, [])
        XCTAssertEqual(recorder.cleared, 0)
    }

    // MARK: - La racine consomme par la porte

    func test_rootLayers_consumeThePendingPayloadThroughTheGate() throws {
        let source = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/RootLayers/RootSharedLayers.swift"))
        let receiver = try XCTUnwrap(source.range(of: ".onReceive(PushNotificationManager.shared.$pendingNotificationPayload)"))
        let body = source[receiver.upperBound...].prefix(600)

        XCTAssertTrue(body.contains("PushTapAddressee.consume("),
                      "le toucher passe par la porte : sinon un compte suivant navigue dans la conversation d'un autre")
    }
}
