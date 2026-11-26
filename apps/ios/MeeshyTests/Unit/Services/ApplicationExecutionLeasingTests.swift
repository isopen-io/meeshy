import MeeshyE2EE
import os
import UIKit
import XCTest
@testable import Meeshy

/// Le bail E2EE de l'app (#12668) : le verrou du groupe d'apps ne se tient que
/// sous une tâche d'arrière-plan déclarée, et cette tâche se rend exactement
/// une fois, à la fin de la prise — jamais pendant qu'elle tient le verrou.
final class ApplicationExecutionLeasingTests: XCTestCase {
    private func makeSUT(
        remaining: TimeInterval = .greatestFiniteMagnitude,
        identifier: UIBackgroundTaskIdentifier = UIBackgroundTaskIdentifier(rawValue: 42)
    ) -> (sut: ApplicationExecutionLeasing, system: FakeBackgroundTasks) {
        let system = FakeBackgroundTasks(remaining: remaining, identifier: identifier)
        return (ApplicationExecutionLeasing(system: system.system), system)
    }

    func test_withLease_inTheForeground_runsTheBodyInsideOneBackgroundTask() throws {
        let (sut, system) = makeSUT()

        let value = try sut.withLease { lease -> Int in
            XCTAssertEqual(system.begun, 1)
            XCTAssertEqual(system.ended, [], "la tâche tient pendant le corps")
            XCTAssertFalse(lease.isExpired)
            return 5
        }

        XCTAssertEqual(value, 5)
        XCTAssertEqual(system.ended, [UIBackgroundTaskIdentifier(rawValue: 42)])
    }

    func test_withLease_withTooLittleBackgroundTime_isRefused_withoutAskingForATask() {
        let (sut, system) = makeSUT(remaining: ApplicationExecutionLeasing.minimumRemaining - 0.1)
        var ran = false

        XCTAssertThrowsError(try sut.withLease { _ in ran = true }) { error in
            XCTAssertEqual(error as? E2EEExecutionLeaseError, .refused)
        }
        XCTAssertFalse(ran)
        XCTAssertEqual(system.begun, 0)
    }

    func test_withLease_whenTheSystemRefusesTheTask_isRefused() {
        let (sut, system) = makeSUT(identifier: .invalid)
        var ran = false

        XCTAssertThrowsError(try sut.withLease { _ in ran = true }) { error in
            XCTAssertEqual(error as? E2EEExecutionLeaseError, .refused)
        }
        XCTAssertFalse(ran)
        XCTAssertEqual(system.ended, [], "une tâche refusée ne se rend pas")
    }

    func test_anExpirationDuringTheBody_marksTheLease_andTheTaskEndsOnceAfterTheBody() throws {
        let (sut, system) = makeSUT()

        let expiredInside = try sut.withLease { lease -> Bool in
            system.fireExpiration()
            XCTAssertEqual(system.ended, [], "rendre la tâche ici exposerait le verrou tenu à la suspension")
            return lease.isExpired
        }

        XCTAssertTrue(expiredInside)
        XCTAssertEqual(system.ended.count, 1)
    }

    func test_anExpirationAfterTheBody_neverEndsTheTaskTwice() throws {
        let (sut, system) = makeSUT()

        try sut.withLease { _ in }
        system.fireExpiration()

        XCTAssertEqual(system.ended.count, 1)
    }

    func test_aBodyThatThrows_stillEndsTheTask() {
        struct Boom: Error {}
        let (sut, system) = makeSUT()

        XCTAssertThrowsError(try sut.withLease { _ in throw Boom() })
        XCTAssertEqual(system.ended.count, 1)
    }
}

final class FakeBackgroundTasks: Sendable {
    private struct State {
        var begun = 0
        var ended: [UIBackgroundTaskIdentifier] = []
        var expiration: (@Sendable () -> Void)?
    }

    private let state = OSAllocatedUnfairLock(initialState: State())
    private let remaining: TimeInterval
    private let identifier: UIBackgroundTaskIdentifier

    init(remaining: TimeInterval, identifier: UIBackgroundTaskIdentifier) {
        self.remaining = remaining
        self.identifier = identifier
    }

    var begun: Int { state.withLock { $0.begun } }
    var ended: [UIBackgroundTaskIdentifier] { state.withLock { $0.ended } }
    func fireExpiration() { state.withLock { $0.expiration }?() }

    var system: ApplicationExecutionLeasing.System {
        ApplicationExecutionLeasing.System(
            begin: { [self] _, expiration in
                state.withLock { current in
                    current.begun += 1
                    current.expiration = expiration
                }
                return identifier
            },
            end: { [self] identifier in state.withLock { $0.ended.append(identifier) } },
            remaining: { [remaining] in remaining }
        )
    }
}
