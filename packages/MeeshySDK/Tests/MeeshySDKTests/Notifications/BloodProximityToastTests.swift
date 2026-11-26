import XCTest
@testable import MeeshySDK

/// App ouverte, « Lina est tout près » (#20540) se dit en UNE bannière : la passerelle émet `notification:new` ET
/// `location:blood-proximity` pour la même approche, et le push du premier plan arrive par-dessus. Seul
/// `notification:new` pose la carte (titre et corps déjà rendus) ; une seconde livraison du même id n'en pose pas une
/// autre, et la préférence coupée n'en pose aucune. L'haptique jouée à l'apparition compte les bannières.
@MainActor
final class BloodProximityToastTests: XCTestCase {

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

    private func makeEvent(id: String = UUID().uuidString) throws -> SocketNotificationEvent {
        try JSONDecoder().decode(SocketNotificationEvent.self, from: Data("""
        {
            "id": "\(id)", "userId": "me", "type": "blood_proximity",
            "title": "Lina est tout près",
            "content": "À 500 m — touche pour vous voir tous les deux sur la carte",
            "metadata": { "action": "view_profile", "userId": "lina42", "distanceMeters": 500 },
            "actor": { "id": "lina42", "username": "lina", "displayName": "Lina" }
        }
        """.utf8))
    }

    func test_bloodProximity_arrivingTwiceUnderTheSameId_showsOneBanner() throws {
        var banners = 0
        NotificationToastManager.shared.hapticPlayer = { banners += 1 }
        let id = UUID().uuidString

        NotificationToastManager.shared.handleNewNotification(try makeEvent(id: id))
        NotificationToastManager.shared.handleNewNotification(try makeEvent(id: id))

        XCTAssertEqual(banners, 1, "une approche, une bannière")
        XCTAssertEqual(NotificationToastManager.shared.currentToast?.notificationType, .bloodProximity)
        XCTAssertEqual(NotificationToastManager.shared.currentToast?.apiMetadata?.userId, "lina42")
    }

    func test_bloodProximity_preferenceOff_showsNoBanner() throws {
        var banners = 0
        NotificationToastManager.shared.hapticPlayer = { banners += 1 }
        UserPreferencesManager.shared.updateNotification { $0.receivesBloodProximity = false }

        NotificationToastManager.shared.handleNewNotification(try makeEvent())

        XCTAssertEqual(banners, 0)
    }
}
