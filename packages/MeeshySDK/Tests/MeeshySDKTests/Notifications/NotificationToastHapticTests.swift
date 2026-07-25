import XCTest
@testable import MeeshySDK

/// Le toggle « Vibrations » doit avoir un consommateur réel : l'haptique jouée
/// à l'apparition d'un toast in-app. Avant ce correctif, `vibrationEnabled`
/// était persistée mais jamais lue nulle part.
@MainActor
final class NotificationToastHapticTests: XCTestCase {

    override func setUp() {
        super.setUp()
        UserPreferencesManager.shared.resetToDefaults()
        UserPreferencesManager.shared.pendingCategories.removeAll()
        NotificationToastManager.shared.hapticPlayer = nil
    }

    override func tearDown() {
        NotificationToastManager.shared.hapticPlayer = nil
        UserPreferencesManager.shared.resetToDefaults()
        UserPreferencesManager.shared.pendingCategories.removeAll()
        super.tearDown()
    }

    private func makeEvent() throws -> SocketNotificationEvent {
        try JSONDecoder().decode(SocketNotificationEvent.self, from: Data("""
        {
            "id": "\(UUID().uuidString)", "userId": "u1", "type": "new_message",
            "content": "Salut",
            "actor": { "id": "a1", "username": "alice", "displayName": "Alice" },
            "context": { "conversationId": "c-haptic", "conversationTitle": "Alice", "conversationType": "direct" }
        }
        """.utf8))
    }

    func test_toastHaptic_respectsVibrationEnabled() throws {
        var haptics = 0
        NotificationToastManager.shared.hapticPlayer = { haptics += 1 }

        UserPreferencesManager.shared.updateNotification { $0.vibrationEnabled = false }
        NotificationToastManager.shared.handleNewNotification(try makeEvent())
        XCTAssertEqual(haptics, 0, "Vibrations OFF → aucune haptique au toast")

        UserPreferencesManager.shared.updateNotification { $0.vibrationEnabled = true }
        NotificationToastManager.shared.handleNewNotification(try makeEvent())
        XCTAssertEqual(haptics, 1, "Vibrations ON → une haptique par toast")
    }
}
