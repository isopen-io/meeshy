import XCTest
import SwiftUI
@testable import MeeshyUI

/// #11412 — les avatars des vues du SDK se repeignent au battement de présence
/// que l'app pose à sa racine (`meeshyPresenceRefresh`), et préfèrent la carte
/// vivante (`meeshyPresenceResolver`) à la présence servie sans date, qui ne
/// décroît jamais.
@MainActor
final class MeeshyLivePresenceTests: XCTestCase {

    private func source(_ relative: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Profile
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .appendingPathComponent("Sources/MeeshyUI")
            .appendingPathComponent(relative)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_presenceRefresh_withoutAnApp_isAbsent() {
        let refresh = EnvironmentValues().meeshyPresenceRefresh
        XCTAssertNil(refresh)
    }

    func test_profileHeader_bothAvatarsRepaintOnTheHeartbeat() throws {
        let code = try source("Profile/UserProfileSheet+Header.swift")
        XCTAssertEqual(
            code.components(separatedBy: "MeeshyLivePresence {").count - 1, 2,
            "le grand avatar et celui de la barre compacte se repeignent tous deux"
        )
    }

    func test_pickerAndMentions_preferTheLiveMap_thenRepaint() throws {
        for file in ["Story/AudienceUserPickerView.swift", "Story/MentionSuggestions.swift"] {
            let code = try source(file)
            XCTAssertTrue(code.contains("presenceState: presenceResolver?(user.id) ?? user.servedPresence"), file)
            XCTAssertTrue(code.contains("MeeshyLivePresence {"), file)
        }
    }

    func test_notificationRow_avatarRepaintsOnTheHeartbeat() throws {
        XCTAssertTrue(try source("Notifications/NotificationRowView.swift").contains("MeeshyLivePresence {"))
    }
}
