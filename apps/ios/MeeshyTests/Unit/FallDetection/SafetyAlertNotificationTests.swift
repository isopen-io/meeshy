import UserNotifications
import XCTest
import MeeshySDK
@testable import Meeshy

/// L'alerte de sécurité d'un Sang (#18748) : la catégorie `MEESHY_SAFETY_ALERT` est remise au système, sans action (le
/// lecteur n'a rien à répondre) et avec un aperçu masqué GÉNÉRIQUE — aucun mot de santé à l'écran verrouillé.
final class SafetyAlertNotificationTests: XCTestCase {

    func test_theRegisteredCategories_includeTheSafetyAlert_withoutAction_andAGenericHiddenPreview() throws {
        var registered: Set<UNNotificationCategory> = []
        AppDelegate.registerNotificationCategories(bundle: .main) { registered = $0 }

        let category = try XCTUnwrap(registered.first { $0.identifier == "MEESHY_SAFETY_ALERT" })
        XCTAssertTrue(category.actions.isEmpty)
        XCTAssertEqual(category.hiddenPreviewsBodyPlaceholder, FallDetectionWording.hiddenPreviewPlaceholder(bundle: .main))
        XCTAssertFalse(category.hiddenPreviewsBodyPlaceholder.localizedCaseInsensitiveContains("chute"))
    }

    func test_aPushedClearing_namesThePerson_evenAppClosed() {
        XCTAssertEqual(FallDetectionCenter.clearedUserId(in: ["type": "safety_alert_cleared", "userId": "peer"]), "peer")
        XCTAssertNil(FallDetectionCenter.clearedUserId(in: ["type": "safety_alert", "userId": "peer"]))
        XCTAssertNil(FallDetectionCenter.clearedUserId(in: ["type": "safety_alert_cleared", "userId": ""]))
    }

    @MainActor
    func test_aForeignWakeIsNotHandled() {
        XCTAssertFalse(FallDetectionCenter.handledClearingWake(["type": "new_message", "userId": "peer"]) { _ in })
    }

    func test_aForeignPushIsNotRouted() {
        XCTAssertFalse(FallDetectionCenter.routesForegroundPush(["type": "new_message", "userId": "peer"]))
    }
}
