import XCTest

final class LockedSweepSourceGuardTests: XCTestCase {

    private static let migrated: [String] = [
        "Diagnostics/CryptoSignposts.swift",
        "Networking/DailyGestureLimit.swift",
        "Services/ListingContext.swift",
        "Persistence/OfflineQueue+PublicationCancel.swift",
        "Persistence/MessageRecord.swift",
        "Utils/NotificationDateFormatter.swift",
        "Utils/RelativeTimeFormatter.swift",
        "Networking/FileDigestMemo.swift",
        "Services/VisitorReaderKey.swift",
        "Services/EphemeralReceiptLedger.swift",
        "Services/SocialEvents.swift",
        "Services/SocialInteractionEvents.swift",
        "Notifications/SocialNotificationEvents.swift",
        "Cache/StoryViewedLedger.swift",
        "Cache/UserDisplayNameCache.swift",
    ]

    private static let keepsHistoricUncheckedSendable: Set<String> = [
        "Configuration/MeeshyConfig.swift",
    ]

    private static var sdkSources: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshySDK")
    }

    private static func codeLines(of relativePath: String) -> [String]? {
        let url = sdkSources.appendingPathComponent(relativePath)
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") }
    }

    private static func forbiddenTokens(for relativePath: String) -> [String] {
        let all = ["NSLock()", "nonisolated(unsafe)", "@unchecked Sendable"]
        guard keepsHistoricUncheckedSendable.contains(relativePath) else { return all }
        return all.filter { $0 != "@unchecked Sendable" }
    }

    func test_guard_seesTheMigratedSources() {
        let missing = Self.migrated.filter { Self.codeLines(of: $0) == nil }
        XCTAssertTrue(missing.isEmpty, "\(missing)")
    }

    func test_migratedFiles_holdNoNSLockNorUnsafeStatic_andNoUncheckedSendable() {
        let offenders = Self.migrated.flatMap { path -> [String] in
            let tokens = Self.forbiddenTokens(for: path)
            let lines = Self.codeLines(of: path) ?? []
            return lines.compactMap { line in
                tokens.first(where: { line.contains($0) }).map { "\(path): \($0)" }
            }
        }
        XCTAssertTrue(offenders.isEmpty, "\(offenders)")
    }
}
