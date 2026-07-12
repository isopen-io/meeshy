import Foundation
import Combine
import MeeshySDK

/// Bridges the SDK outbox to the app-side EngagementTracker sink protocol.
public final class EngagementOutboxSink: EngagementSinking {
    public static let shared = EngagementOutboxSink()
    private let outbox: EngagementOutbox
    init(outbox: EngagementOutbox = .shared) { self.outbox = outbox }
    public func beginSession(_ s: EngagementSession) async { await outbox.beginSession(s) }
    public func checkpoint(_ s: EngagementSession) async { await outbox.checkpoint(s) }
    public func finalizeSession(_ s: EngagementSession) async { await outbox.finalizeSession(s) }
    public func requestFlush() async { await EngagementFlushTrigger.flushNow() }
}

/// Dispatches a finalized session to the network, dropping cross-user rows.
/// Closure-based (not protocol-based) so it stays `Sendable` under Swift 6 —
/// `PostServiceProviding` is not Sendable (app mock is a mutable class), so it
/// cannot be stored in a Sendable struct captured by the @Sendable flush closure.
public struct EngagementDispatcher: Sendable {
    private let record: @Sendable ([EngagementSession]) async throws -> Void
    private let currentUserId: @Sendable () -> String?
    public init(record: @escaping @Sendable ([EngagementSession]) async throws -> Void,
                currentUserId: @escaping @Sendable () -> String?) {
        self.record = record
        self.currentUserId = currentUserId
    }
    public func dispatch(_ sessions: [EngagementSession]) async -> EngagementDispatchOutcome {
        // Anti cross-user: after an account switch the outbox may still hold the
        // previous user's rows. Filter them out BEFORE the POST (the server also
        // trusts only the auth context). If every row is cross-user, drop them.
        let mine = currentUserId().map { uid in sessions.filter { $0.userId == uid } } ?? sessions
        guard !mine.isEmpty else { return .failedPermanent }
        do { try await record(mine); return .completed }
        catch { return .failedTransient }
    }
}

@MainActor
enum EngagementFlushTrigger {
    static func flushNow() async {
        let online = NetworkConditionMonitor.shared.isOnline
        guard online else { EngagementRetryScheduler.shared.scheduleSoon(); return }
        let uid = AuthManager.shared.currentUser?.id   // captured String? is Sendable
        let dispatcher = EngagementDispatcher(
            record: { sessions in try await PostService.shared.recordEngagement(sessions) },
            currentUserId: { uid })
        await EngagementOutbox.shared.flush { sessions in await dispatcher.dispatch(sessions) }
    }
}

@MainActor
final class EngagementRetryScheduler {
    static let shared = EngagementRetryScheduler()
    private var timer: Task<Void, Never>?
    private var networkCancellable: AnyCancellable?
    private init() {}

    func startObservingNetworkReconnect() {
        networkCancellable = NetworkConditionMonitor.shared.$condition
            .map { $0 != .offline }
            .removeDuplicates()
            .dropFirst()
            .filter { $0 }
            .sink { _ in Task { @MainActor in await EngagementFlushTrigger.flushNow() } }
    }
    func scheduleSoon() {
        timer?.cancel()
        timer = Task {
            try? await Task.sleep(nanoseconds: 30 * 1_000_000_000)
            guard !Task.isCancelled else { return }
            await EngagementFlushTrigger.flushNow()
        }
    }
}
