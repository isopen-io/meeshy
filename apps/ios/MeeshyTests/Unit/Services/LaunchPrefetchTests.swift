import XCTest
@testable import Meeshy
import MeeshySDK

/// #11558, #11587 — le trousseau du premier écran, le conteneur du groupe d'app
/// et le client REST se préparent hors du fil principal dès l'entrée du
/// processus, et jamais sous XCTest.
@MainActor
final class LaunchPrefetchTests: XCTestCase {

    private let outsideXCTest: [String: String] = [:]
    private let underXCTest = ["XCTestConfigurationFilePath": "/tmp/x"]

    func test_start_launchesTheStartersBeforeReturning() {
        let launched = Locked(0)
        let starter: @Sendable () -> Void = { launched.mutate { $0 += 1 } }

        LaunchPrefetch.start(environment: outsideXCTest, steps: .init(starters: [starter, starter], offMain: []))

        XCTAssertEqual(launched.read { $0 }, 2, "en vol avant que le premier lecteur ne les demande")
    }

    func test_start_runsTheOffMainStepsOffTheMainThread() {
        let ran = expectation(description: "steps ran")
        ran.expectedFulfillmentCount = 2
        let threads = Locked<[Bool]>([])
        let step: @Sendable () -> Void = {
            let onMain = Thread.isMainThread
            threads.mutate { $0.append(onMain) }
            ran.fulfill()
        }

        LaunchPrefetch.start(environment: outsideXCTest, steps: .init(starters: [], offMain: [step, step]))

        wait(for: [ran], timeout: 2)
        XCTAssertEqual(threads.read { $0 }, [false, false])
    }

    func test_start_underXCTest_runsNothing() {
        let ran = expectation(description: "no step")
        ran.isInverted = true
        let launched = Locked(0)

        LaunchPrefetch.start(
            environment: underXCTest,
            steps: .init(starters: [{ launched.mutate { $0 += 1 } }], offMain: [{ ran.fulfill() }])
        )

        wait(for: [ran], timeout: 0.3)
        XCTAssertEqual(launched.read { $0 }, 0)
    }

    func test_production_preparesTheKeychain_theAppGroupContainer_andTheRESTClient() {
        XCTAssertEqual(LaunchPrefetch.Steps.production.starters.count, 2)
        XCTAssertEqual(LaunchPrefetch.Steps.production.offMain.count, 1)
    }

    func test_appGroupContainer_isTheOneTheDatabaseDirectoryUses() {
        XCTAssertEqual(
            AppGroupContainer.url,
            FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: AppGroupContainer.identifier)
        )
    }
}
