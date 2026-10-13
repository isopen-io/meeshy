import Foundation
import Combine
import MeeshySDK
import os
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Ce qu'un lecteur SANS compte a vu (#10483)

/// Envoie les impressions et les vues d'un lecteur sans compte par la porte
/// unique `POST /social/events`, sous son jeton (`X-Session-Token`).
protocol VisitorReachReporting: AnyObject {
    @MainActor func record(_ events: [SocialEvent])
    @MainActor func flushNow() async
}

/// Une occurrence en attente et l'identité sous laquelle elle a été VUE : un
/// compte qui se connecte entre-temps ne la reprend pas à son compte.
nonisolated struct PendingVisitorEvent: Codable, Equatable {
    let event: SocialEvent
    let token: String
}

/// Sur le modèle d'`ImpressionBatcher` : groupement court, vidage au passage en
/// arrière-plan, file persistée (rejouée au lancement suivant et au retour du
/// réseau).
///
/// Deux règles propres au lecteur sans compte :
/// - les VUES et les IMPRESSIONS partent en deux requêtes. Un serveur antérieur
///   à #10483 refuse (403) tout lot anonyme qui contient une impression : la
///   vue, qu'il sait compter, ne doit pas tomber avec elle ;
/// - un refus définitif (403, 401, 4xx hors débit) retire le lot SANS rejeu —
///   le rejouer ne pourrait que se faire refuser encore. Une panne de réseau
///   ou un 5xx le garde.
@MainActor
final class VisitorReachReporter: VisitorReachReporting {
    // iOS 26.1 : deinit synthétisée ISOLÉE → double-free au démontage hors
    // d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = VisitorReachReporter()
    static let storageKey = "meeshy.reach.pending.visitor"

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "visitor-reach")

    private let postService: PostServiceProviding
    private let defaults: UserDefaults
    private let token: @MainActor () -> String
    private let flushDelay: TimeInterval

    private var pending: [PendingVisitorEvent]
    private var flushTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    init(
        postService: PostServiceProviding = PostService.shared,
        defaults: UserDefaults = .standard,
        token: @escaping @MainActor () -> String = VisitorReachReporter.liveToken,
        flushDelay: TimeInterval = 2,
        reconnects: AnyPublisher<Void, Never> = VisitorReachReporter.liveReconnects
    ) {
        self.postService = postService
        self.defaults = defaults
        self.token = token
        self.flushDelay = flushDelay
        self.pending = defaults.data(forKey: Self.storageKey)
            .flatMap { try? JSONDecoder().decode([PendingVisitorEvent].self, from: $0) } ?? []
        reconnects
            .sink { [weak self] _ in Task { @MainActor in await self?.flushNow() } }
            .store(in: &cancellables)
        subscribeToAppLifecycle()
        if !pending.isEmpty { scheduleFlush() }
    }

    /// Le jeton d'un invité de lien s'il en a un — même invité, même clé sur
    /// tous ses appareils —, sinon la clé visiteur de l'appareil.
    static func liveToken() -> String {
        APIClient.shared.anonymousSessionToken ?? VisitorReaderKey.shared.readerKey()
    }

    static var liveReconnects: AnyPublisher<Void, Never> {
        NetworkMonitor.shared.isOfflinePublisher
            .filter { !$0 }
            .map { _ in () }
            .eraseToAnyPublisher()
    }

    var pendingEvents: [PendingVisitorEvent] { pending }

    func record(_ events: [SocialEvent]) {
        guard !events.isEmpty else { return }
        let identity = token()
        pending.append(contentsOf: events.map { PendingVisitorEvent(event: $0, token: identity) })
        persist()
        scheduleFlush()
    }

    func flushNow() async {
        flushTask?.cancel()
        flushTask = nil
        let batch = pending
        guard !batch.isEmpty else { return }
        pending.removeAll()
        persist()
        var kept: [PendingVisitorEvent] = []
        for group in Self.requests(for: batch) {
            do {
                _ = try await postService.recordSocialEvents(group.map(\.event), credential: .visitor(group[0].token))
            } catch where Self.isPermanentRefusal(error) {
                Self.logger.debug("visitor reach refused, dropped without replay: \(error.localizedDescription, privacy: .public)")
            } catch {
                kept.append(contentsOf: group)
            }
        }
        guard !kept.isEmpty else { return }
        pending.insert(contentsOf: kept, at: 0)
        persist()
    }

    /// Une requête par identité et par nature, dans l'ordre d'arrivée.
    static func requests(for batch: [PendingVisitorEvent]) -> [[PendingVisitorEvent]] {
        let tokens = batch.map(\.token).reduce(into: [String]()) { order, token in
            if !order.contains(token) { order.append(token) }
        }
        return tokens.flatMap { token -> [[PendingVisitorEvent]] in
            let mine = batch.filter { $0.token == token }
            let views = mine.filter { if case .view = $0.event { return true } else { return false } }
            let impressions = mine.filter { if case .impression = $0.event { return true } else { return false } }
            return [views, impressions].filter { !$0.isEmpty }
        }
    }

    static func isPermanentRefusal(_ error: Error) -> Bool {
        guard let meeshyError = error as? MeeshyError else { return false }
        switch meeshyError {
        case .forbidden, .auth, .rejected:
            return true
        case .server(let statusCode, _):
            return (400..<500).contains(statusCode) && ![408, 429].contains(statusCode)
        default:
            return false
        }
    }

    private func scheduleFlush() {
        flushTask?.cancel()
        flushTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: UInt64(self.flushDelay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self.flushNow()
        }
    }

    private func persist() {
        if pending.isEmpty {
            defaults.removeObject(forKey: Self.storageKey)
            return
        }
        defaults.set(try? JSONEncoder().encode(pending), forKey: Self.storageKey)
    }

    private func subscribeToAppLifecycle() {
        #if canImport(UIKit)
        for name in [UIApplication.willResignActiveNotification,
                     UIApplication.didEnterBackgroundNotification] {
            NotificationCenter.default.publisher(for: name)
                .sink { [weak self] _ in
                    Task { @MainActor in await self?.flushNow() }
                }
                .store(in: &cancellables)
        }
        #endif
    }
}
