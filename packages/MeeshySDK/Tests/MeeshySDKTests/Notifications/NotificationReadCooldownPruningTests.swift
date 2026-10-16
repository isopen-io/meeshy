import XCTest
@testable import MeeshySDK

/// Les fenêtres anti-rafale des « marquer lu » (conversation, post) ne gardent
/// que ce qu'elles protègent encore : une session de plusieurs jours n'empile
/// plus une entrée par conversation et par story jamais ouvertes.
final class NotificationReadCooldownPruningTests: XCTestCase {

    func test_stamping_forgetsTheExpiredWindows() {
        let now = Date()
        let stamps: [String: Date] = [
            "old": now.addingTimeInterval(-60),
            "recent": now.addingTimeInterval(-2),
        ]
        let next = NotificationToastManager.stampingCooldown(stamps, key: "new", at: now, window: 5)
        XCTAssertNil(next["old"], "sa fenêtre est passée : elle ne protège plus rien")
        XCTAssertNotNil(next["recent"], "encore dans sa fenêtre : la rafale reste bloquée")
        XCTAssertEqual(next["new"], now)
    }

    func test_stamping_aLongSession_staysBounded() {
        var stamps: [String: Date] = [:]
        let start = Date()
        for i in 0..<10_000 {
            stamps = NotificationToastManager.stampingCooldown(
                stamps, key: "c\(i)", at: start.addingTimeInterval(Double(i)), window: 5)
        }
        XCTAssertLessThanOrEqual(stamps.count, 5)
    }
}
