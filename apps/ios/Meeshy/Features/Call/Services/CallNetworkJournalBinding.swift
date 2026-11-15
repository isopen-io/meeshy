import Combine
import Foundation
import MeeshySDK

// MARK: - Media faults

protocol CallMediaFaultReporting: AnyObject {
    func report(stage: String, error: Error)
}

/// Where the media stack says it failed (#8698): capture refused, camera
/// unavailable. A shared relay, like `CallQualityStatsFeed`, so the journal
/// hears it without building the WebRTC stack before a call.
final class CallMediaFaultFeed: CallMediaFaultReporting {
    static let shared = CallMediaFaultFeed()
    static let reasonLimit = 120

    private let subject = PassthroughSubject<String, Never>()

    nonisolated deinit {}

    var faults: AnyPublisher<String, Never> {
        subject.eraseToAnyPublisher()
    }

    func report(stage: String, error: Error) {
        subject.send(Self.reason(stage: stage, error: error))
    }

    static func reason(stage: String, error: Error) -> String {
        String("\(stage): \(error.localizedDescription)".prefix(reasonLimit))
    }
}

// MARK: - Binding

/// Feeds the call stack's live signals to the network journal of the call in
/// progress (#8698) — one binding per stack, like `CallPreviewBinding`. The
/// journal lives in the ACTIVE account's cache (`CallNetworkJournalStore`),
/// so it is purged with the account.
@MainActor
final class CallNetworkJournalBinding {
    nonisolated deinit {}

    static let shared = CallNetworkJournalBinding()

    private let store: CallNetworkJournalStoreProviding
    private let readings: AnyPublisher<CallQualityReading?, Never>
    private let faults: AnyPublisher<String, Never>
    private let now: () -> Date
    private var recorder = CallNetworkJournalRecorder.idle
    private var pendingWrite: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()
    private weak var boundManager: CallManager?

    init(
        store: CallNetworkJournalStoreProviding = CallNetworkJournalStore.shared,
        readings: AnyPublisher<CallQualityReading?, Never> = CallQualityStatsFeed.shared.readings,
        faults: AnyPublisher<String, Never> = CallMediaFaultFeed.shared.faults,
        now: @escaping () -> Date = { Date() }
    ) {
        self.store = store
        self.readings = readings
        self.faults = faults
        self.now = now
    }

    func bind(_ manager: CallManager) {
        guard boundManager !== manager else { return }
        boundManager = manager
        bind(
            callIds: manager.$currentCallId.eraseToAnyPublisher(),
            states: manager.$callState.eraseToAnyPublisher(),
            links: manager.$connectionQuality.eraseToAnyPublisher(),
            tiers: manager.$liveVideoQualityLevel.compactMap { $0 }.eraseToAnyPublisher()
        )
    }

    func bind(
        callIds: AnyPublisher<String?, Never>,
        states: AnyPublisher<CallState, Never>,
        links: AnyPublisher<PeerConnectionState, Never>,
        tiers: AnyPublisher<VideoQualityLevel, Never>
    ) {
        cancellables = []
        let inputs: [AnyPublisher<CallNetworkJournalInput, Never>] = [
            callIds.map { CallNetworkJournalInput.call(id: $0) }.eraseToAnyPublisher(),
            states.map { CallNetworkJournalInput.state($0) }.eraseToAnyPublisher(),
            links.map { CallNetworkJournalInput.link($0) }.eraseToAnyPublisher(),
            tiers.map { CallNetworkJournalInput.tier($0) }.eraseToAnyPublisher(),
            readings.compactMap { $0.map(CallNetworkJournalInput.reading) }.eraseToAnyPublisher(),
            faults.map { CallNetworkJournalInput.mediaFault($0) }.eraseToAnyPublisher()
        ]
        Publishers.MergeMany(inputs)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] input in self?.record(input) }
            .store(in: &cancellables)
    }

    /// Waits for every event recorded so far to reach the store — the tests'
    /// synchronisation point; production never needs to wait.
    func flush() async {
        await pendingWrite?.value
    }

    private func record(_ input: CallNetworkJournalInput) {
        let (next, events) = recorder.reducing(input, at: now())
        recorder = next
        guard !events.isEmpty, let callId = next.callId, let startedAt = next.startedAt else { return }
        let previous = pendingWrite
        let store = store
        pendingWrite = Task {
            await previous?.value
            for event in events {
                await store.append(event, callId: callId, startedAt: startedAt)
            }
        }
    }
}
