import XCTest
@testable import MeeshySDK

/// #11558 — la migration d'accessibilité énumérait tout le trousseau à CHAQUE
/// démarrage à froid, sur le fil principal. Une passe complète suffit.
final class KeychainAccessibilityMigrationGateTests: XCTestCase {

    private func isolatedDefaults() throws -> (UserDefaults, String) {
        let suite = "KeychainAccessibilityMigrationGateTests.\(UUID().uuidString)"
        return (try XCTUnwrap(UserDefaults(suiteName: suite)), suite)
    }

    func test_runOnce_firstLaunch_runsTheMigration() throws {
        let (defaults, suite) = try isolatedDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        var runs = 0

        KeychainAccessibilityMigrationGate(defaults: defaults).runOnce { runs += 1; return true }

        XCTAssertEqual(runs, 1)
    }

    func test_runOnce_afterACompletePass_neverRunsAgain() throws {
        let (defaults, suite) = try isolatedDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        var runs = 0
        let gate = KeychainAccessibilityMigrationGate(defaults: defaults)

        gate.runOnce { runs += 1; return true }
        gate.runOnce { runs += 1; return true }
        KeychainAccessibilityMigrationGate(defaults: defaults).runOnce { runs += 1; return true }

        XCTAssertEqual(runs, 1)
    }

    func test_runOnce_afterAnIncompletePass_runsAgainNextLaunch() throws {
        let (defaults, suite) = try isolatedDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        var runs = 0
        let gate = KeychainAccessibilityMigrationGate(defaults: defaults)

        gate.runOnce { runs += 1; return false }
        gate.runOnce { runs += 1; return true }
        gate.runOnce { runs += 1; return true }

        XCTAssertEqual(runs, 2)
    }
}
