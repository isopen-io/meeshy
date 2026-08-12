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

// MARK: - "En ligne" confirmation only after a down state was actually surfaced

@MainActor
final class ConnectionBannerOnlineConfirmationTests: XCTestCase {

    func test_confirm_downSurfaced_toConnected_isTrue() {
        XCTAssertTrue(ConnectionBanner.shouldConfirmReturnOnline(downWasSurfaced: true, new: .connected))
    }

    func test_confirm_downSurfaced_toSyncing_isTrue() {
        XCTAssertTrue(ConnectionBanner.shouldConfirmReturnOnline(downWasSurfaced: true, new: .syncing))
    }

    /// The bug we are fixing: at cold start (and on resume-from-background) the
    /// socket blips through `.disconnected` before connecting, but the
    /// "Reconnexion" pill was never surfaced (grace window not elapsed). No down
    /// state was shown, so the green "En ligne" must NOT flash.
    func test_confirm_noDownSurfaced_toConnected_isFalse() {
        XCTAssertFalse(ConnectionBanner.shouldConfirmReturnOnline(downWasSurfaced: false, new: .connected))
    }

    func test_confirm_noDownSurfaced_toSyncing_isFalse() {
        XCTAssertFalse(ConnectionBanner.shouldConfirmReturnOnline(downWasSurfaced: false, new: .syncing))
    }

    func test_confirm_downSurfaced_toDisconnected_isFalse() {
        XCTAssertFalse(ConnectionBanner.shouldConfirmReturnOnline(downWasSurfaced: true, new: .disconnected))
    }

    func test_confirm_downSurfaced_toOffline_isFalse() {
        XCTAssertFalse(ConnectionBanner.shouldConfirmReturnOnline(downWasSurfaced: true, new: .offline))
    }
}

// MARK: - "Reconnexion" grace window (debounce so fast reconnects stay silent)

@MainActor
final class ConnectionBannerReconnectingGraceTests: XCTestCase {

    func test_grace_startsWhenNewlyDisconnectedFromConnected() {
        XCTAssertTrue(ConnectionBanner.shouldStartReconnectingGrace(previous: .connected, new: .disconnected))
    }

    func test_grace_startsWhenDisconnectedFromOffline() {
        XCTAssertTrue(ConnectionBanner.shouldStartReconnectingGrace(previous: .offline, new: .disconnected))
    }

    /// Cold start: the banner mounts and the socket is connecting — the grace
    /// window must still open so a *stalled* (> 3 s) connection is surfaced.
    func test_grace_startsWhenDisconnectedFromNil() {
        XCTAssertTrue(ConnectionBanner.shouldStartReconnectingGrace(previous: nil, new: .disconnected))
    }

    /// Staying disconnected must not restart the window (would push the pill
    /// further away on every intermediate emission).
    func test_grace_doesNotRestartWhenAlreadyDisconnected() {
        XCTAssertFalse(ConnectionBanner.shouldStartReconnectingGrace(previous: .disconnected, new: .disconnected))
    }

    func test_grace_notStartedForNonDisconnectedTargets() {
        XCTAssertFalse(ConnectionBanner.shouldStartReconnectingGrace(previous: .disconnected, new: .connected))
        XCTAssertFalse(ConnectionBanner.shouldStartReconnectingGrace(previous: .connected, new: .syncing))
        XCTAssertFalse(ConnectionBanner.shouldStartReconnectingGrace(previous: .connected, new: .offline))
    }

    /// At the deadline the "Reconnexion" pill is surfaced only if the socket is
    /// STILL disconnected; a reconnect that landed during the window cancels it.
    func test_surface_reconnecting_onlyWhenStillDisconnected() {
        XCTAssertTrue(ConnectionBanner.shouldSurfaceReconnecting(statusAtDeadline: .disconnected))
        XCTAssertFalse(ConnectionBanner.shouldSurfaceReconnecting(statusAtDeadline: .connected))
        XCTAssertFalse(ConnectionBanner.shouldSurfaceReconnecting(statusAtDeadline: .syncing))
        XCTAssertFalse(ConnectionBanner.shouldSurfaceReconnecting(statusAtDeadline: .offline))
    }
}
