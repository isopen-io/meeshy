import XCTest

/// Source-level accessibility guard for the iPad header notification bell in
/// `ConversationListView+Overlays.swift`.
///
/// The bell renders a visible unread-count badge (`Text("\(min(iPadNotificationCount, 99))")`)
/// but originally exposed only a static `.accessibilityLabel` of "Notifications" — so
/// VoiceOver users heard "Notifications" with no idea how many items were unread, while
/// sighted users saw the count. The count MUST be restated to VoiceOver (WCAG 1.3.1 Info &
/// Relationships / 4.1.2 Name, Role, Value) via `.accessibilityValue`, mirroring the compact
/// bell in `RootView` which already announces `a11y.notifications.unread_count`.
final class ConversationListOverlaysAccessibilityTests: XCTestCase {

    private func iosRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Views
            .deletingLastPathComponent() // Unit
            .deletingLastPathComponent() // MeeshyTests
            .deletingLastPathComponent() // apps/ios
    }

    private func overlaysSource() throws -> String {
        let url = iosRoot()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationListView+Overlays.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_notificationBell_announcesUnreadCountToVoiceOver() throws {
        let source = try overlaysSource()
        guard let range = source.range(of: "if let onNotificationsTap") else {
            XCTFail("ConversationListView+Overlays must define the notification bell button"); return
        }
        let vicinity = String(source[range.lowerBound...].prefix(2200))
        XCTAssertTrue(
            vicinity.contains(".accessibilityValue("),
            "The notification bell must expose an .accessibilityValue — its static " +
            "\"Notifications\" label alone drops the visible unread-count badge from VoiceOver."
        )
        XCTAssertTrue(
            vicinity.contains("a11y.notifications.unread_count") && vicinity.contains("iPadNotificationCount"),
            "The bell's accessibility value must restate the unread count via the shared " +
            "a11y.notifications.unread_count key — identical to RootView's compact bell."
        )
    }

    /// Guards the latent i18n regression: `a11y.notifications.unread_count` was referenced in
    /// code (RootView + the iPad bell) with only a French `defaultValue`, but had NO catalog
    /// entry — so every non-French device announced the count in French. The catalog must now
    /// carry the key for all five supported locales.
    func test_unreadCountKey_isLocalizedForEverySupportedLocale() throws {
        let url = iosRoot().appendingPathComponent("Meeshy/Localizable.xcstrings")
        let data = try Data(contentsOf: url)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let strings = json?["strings"] as? [String: Any]
        let entry = strings?["a11y.notifications.unread_count"] as? [String: Any]
        let localizations = entry?["localizations"] as? [String: Any]
        XCTAssertNotNil(localizations, "a11y.notifications.unread_count must exist in Localizable.xcstrings")
        for locale in ["de", "en", "es", "fr", "pt-BR"] {
            XCTAssertNotNil(
                localizations?[locale],
                "a11y.notifications.unread_count must be translated for \(locale) — otherwise the " +
                "unread count is announced in French on \(locale) devices."
            )
        }
    }
}
