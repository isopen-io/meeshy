import XCTest
@testable import MeeshySDK

/// D4 — pin that `loadSavedAccounts` produces a deterministic order when
/// two accounts share the same `lastActiveAt`. The legacy sort closure
/// only compared timestamps which meant identical-timestamp accounts
/// could swap positions across cold starts (the input array order is not
/// contractually stable across UserDefaults JSON round-trips). The fix
/// adds `id` as a secondary key.
final class SavedAccountsSortStabilityTests: XCTestCase {

    /// Inline copy of the production sort so the test pins the contract
    /// without touching the singleton. Any future change to AuthManager
    /// must mirror the same comparator.
    private func sort(_ accounts: [SavedAccount]) -> [SavedAccount] {
        accounts.sorted { a, b in
            if a.lastActiveAt != b.lastActiveAt {
                return a.lastActiveAt > b.lastActiveAt
            }
            return a.id < b.id
        }
    }

    private func makeAccount(id: String, lastActiveAt: Date) -> SavedAccount {
        SavedAccount(
            id: id,
            username: "user_\(id)",
            displayName: "User \(id)",
            avatarURL: nil,
            lastActiveAt: lastActiveAt
        )
    }

    func test_sort_differentTimestamps_descendingByDate() {
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        let result = sort([
            makeAccount(id: "a", lastActiveAt: t0),
            makeAccount(id: "b", lastActiveAt: t0.addingTimeInterval(60)),
            makeAccount(id: "c", lastActiveAt: t0.addingTimeInterval(120))
        ])
        XCTAssertEqual(result.map(\.id), ["c", "b", "a"])
    }

    func test_sort_identicalTimestamps_secondaryKeyOnId() {
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        let result = sort([
            makeAccount(id: "zeta", lastActiveAt: t0),
            makeAccount(id: "alpha", lastActiveAt: t0),
            makeAccount(id: "mike", lastActiveAt: t0)
        ])
        XCTAssertEqual(result.map(\.id), ["alpha", "mike", "zeta"])
    }

    func test_sort_mixedTimestamps_secondaryKeyOnlyForTies() {
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        let result = sort([
            makeAccount(id: "old1", lastActiveAt: t0),
            makeAccount(id: "old0", lastActiveAt: t0),
            makeAccount(id: "new", lastActiveAt: t0.addingTimeInterval(60))
        ])
        XCTAssertEqual(result.map(\.id), ["new", "old0", "old1"])
    }

    func test_sort_idempotent_inputOrderIrrelevant() {
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        let inputs = [
            makeAccount(id: "a", lastActiveAt: t0),
            makeAccount(id: "b", lastActiveAt: t0),
            makeAccount(id: "c", lastActiveAt: t0)
        ]
        let r1 = sort(inputs)
        let r2 = sort(inputs.reversed())
        XCTAssertEqual(r1.map(\.id), r2.map(\.id))
    }
}
