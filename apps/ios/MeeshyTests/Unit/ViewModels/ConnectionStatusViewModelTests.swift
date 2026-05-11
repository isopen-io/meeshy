//
//  ConnectionStatusViewModelTests.swift
//  MeeshyTests
//
//  Phase 4 Task 4.7 — unit tests for ConnectionStatusViewModel.
//

import Combine
import XCTest
@testable import Meeshy

@MainActor
final class ConnectionStatusViewModelTests: XCTestCase {

    // MARK: - Factory

    private struct Harness {
        let sut: ConnectionStatusViewModel
        let online: CurrentValueSubject<Bool, Never>
        let connected: CurrentValueSubject<Bool, Never>
        let pending: CurrentValueSubject<Int, Never>
    }

    private func makeSUT(
        online: Bool = true,
        connected: Bool = true,
        pending: Int = 0
    ) -> Harness {
        let onlineSubject = CurrentValueSubject<Bool, Never>(online)
        let connectedSubject = CurrentValueSubject<Bool, Never>(connected)
        let pendingSubject = CurrentValueSubject<Int, Never>(pending)
        let sut = ConnectionStatusViewModel(
            isOnlinePublisher: onlineSubject.eraseToAnyPublisher(),
            isConnectedPublisher: connectedSubject.eraseToAnyPublisher(),
            pendingCountPublisher: pendingSubject.eraseToAnyPublisher()
        )
        return Harness(
            sut: sut,
            online: onlineSubject,
            connected: connectedSubject,
            pending: pendingSubject
        )
    }

    /// Yields the run-loop so the `.receive(on: DispatchQueue.main)` sink
    /// hop in `ConnectionStatusViewModel` has a chance to update `status`.
    private func flush() async {
        for _ in 0..<3 {
            await Task.yield()
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
    }

    // MARK: - Status Derivation

    func test_status_whenOffline_isOffline() async {
        let harness = makeSUT(online: false, connected: false, pending: 5)
        await flush()
        XCTAssertEqual(harness.sut.status, .offline)
    }

    func test_status_whenOnlineButSocketDisconnected_isDisconnected() async {
        let harness = makeSUT(online: true, connected: false, pending: 0)
        await flush()
        XCTAssertEqual(harness.sut.status, .disconnected)
    }

    func test_status_whenConnectedWithPendingOutbox_isSyncing() async {
        let harness = makeSUT(online: true, connected: true, pending: 3)
        await flush()
        XCTAssertEqual(harness.sut.status, .syncing)
    }

    func test_status_whenConnectedAndOutboxEmpty_isConnected() async {
        let harness = makeSUT(online: true, connected: true, pending: 0)
        await flush()
        XCTAssertEqual(harness.sut.status, .connected)
    }

    func test_status_transitionsFromSyncingToConnectedWhenOutboxDrains() async {
        let harness = makeSUT(online: true, connected: true, pending: 2)
        await flush()
        XCTAssertEqual(harness.sut.status, .syncing)

        harness.pending.send(0)
        await flush()
        XCTAssertEqual(harness.sut.status, .connected)
    }

    // MARK: - Pure derivation

    func test_derive_offlineBeatsOtherSignals() {
        XCTAssertEqual(
            ConnectionStatusViewModel.derive(online: false, connected: true, pending: 0),
            .offline
        )
    }

    func test_derive_disconnectedWhenOnlineButSocketDown() {
        XCTAssertEqual(
            ConnectionStatusViewModel.derive(online: true, connected: false, pending: 7),
            .disconnected
        )
    }
}
