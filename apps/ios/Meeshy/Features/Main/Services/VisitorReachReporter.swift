import Foundation
import Combine
import CryptoKit
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
///
/// L'identité est une EMPREINTE du jeton, jamais le jeton : la file vit dans
/// `UserDefaults`, en clair sur le disque et dans les sauvegardes, alors que
/// le jeton d'un invité de lien est un credential. Le jeton se relit au moment
/// d'envoyer ; s'il n'est plus là, l'événement part avec lui.
///
/// L'événement est persisté AVEC son enveloppe (#10500) : une file écrite
/// avant elle se relit (identifiant neuf, heure inconnue) puis se réécrit
/// aussitôt, et chaque rejeu renvoie le même `eventId`.
nonisolated struct PendingVisitorEvent: Codable, Equatable {
    let stamped: StampedSocialEvent
    let identity: String

    var event: SocialEvent { stamped.event }

    init(stamped: StampedSocialEvent, identity: String) {
        self.stamped = stamped
        self.identity = identity
    }

    private enum CodingKeys: String, CodingKey {
        case stamped = "event", identity
    }

    static func identity(of token: String) -> String {
        SHA256.hash(data: Data(token.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

/// Sur le modèle d'`ImpressionBatcher` : groupement court, vidage au passage en
/// arrière-plan, file persistée (rejouée au lancement suivant et au retour du
/// réseau).
///
/// Deux règles propres au lecteur sans compte :
/// - les VUES, les IMPRESSIONS et les OUVERTURES partent en requêtes séparées. Un serveur antérieur
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

    private static let logger = MeeshyLog.logger(.visitorReach)

    private let postService: PostServiceProviding
    private let defaults: UserDefaults
    private let token: @MainActor () -> String
    private let knownTokens: @MainActor () -> [String]
    private let flushDelay: TimeInterval
    private let clock: @MainActor () -> Date

    private var pending: [PendingVisitorEvent]
    private var flushTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    init(
        postService: PostServiceProviding = PostService.shared,
        defaults: UserDefaults = .standard,
        token: @escaping @MainActor () -> String = VisitorReachReporter.liveToken,
        knownTokens: @escaping @MainActor () -> [String] = VisitorReachReporter.liveKnownTokens,
        flushDelay: TimeInterval = 2,
        reconnects: AnyPublisher<Void, Never> = VisitorReachReporter.liveReconnects,
        clock: @escaping @MainActor () -> Date = { Date() }
    ) {
        self.postService = postService
        self.defaults = defaults
        self.token = token
        self.knownTokens = knownTokens
        self.flushDelay = flushDelay
        self.clock = clock
        self.pending = Self.restore(from: defaults)
        // Un éditeur injecté peut livrer d'une file de fond, comme le vrai :
        // le `sink` de ce type `@MainActor` ne se reçoit que sur le main.
        reconnects
            .receive(on: DispatchQueue.main)
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

    /// Les jetons que l'appareil détient ENCORE, sans en tirer de neuf : une
    /// clé visiteur effacée par la connexion d'un compte ne renaît pas pour
    /// envoyer ce qu'elle avait vu.
    static func liveKnownTokens() -> [String] {
        [APIClient.shared.anonymousSessionToken, VisitorReaderKey.shared.storedReaderKey()].compactMap { $0 }
    }

    /// Une file illisible (format antérieur, qui gardait le jeton en clair)
    /// est effacée du disque, pas seulement ignorée.
    private static func restore(from defaults: UserDefaults) -> [PendingVisitorEvent] {
        guard let data = defaults.data(forKey: storageKey) else { return [] }
        guard let events = try? JSONDecoder().decode([PendingVisitorEvent].self, from: data) else {
            defaults.removeObject(forKey: storageKey)
            return []
        }
        if let rewritten = try? JSONEncoder().encode(events) { defaults.set(rewritten, forKey: storageKey) }
        return events
    }

    static var liveReconnects: AnyPublisher<Void, Never> {
        reconnects(from: NetworkMonitor.shared.isOfflinePublisher)
    }

    /// Les retours du réseau, LIVRÉS SUR LE MAIN.
    ///
    /// **Le saut sur le main précède le premier opérateur, et ce n'est pas
    /// décoratif.** `isOfflinePublisher` débounce sur
    /// `DispatchQueue.global(qos: .utility)` et livre sur cette file. Les
    /// fermetures de `filter` et `map`, écrites dans ce type `@MainActor`,
    /// sont isolées au MainActor : le runtime vérifie l'exécuteur à leur
    /// entrée et trappe (`SIGTRAP`, `_dispatch_assert_queue_fail`). C'est le
    /// plantage TestFlight des builds 1915/1916 — au lancement et à chaque
    /// retour du réseau, « l'app s'arrête à chaque fois ». Même forme que
    /// `NearbyDiscoveryViewModel.observeNetwork`.
    static func reconnects(from offline: AnyPublisher<Bool, Never>) -> AnyPublisher<Void, Never> {
        offline
            .receive(on: DispatchQueue.main)
            .filter { !$0 }
            .map { _ in () }
            .eraseToAnyPublisher()
    }

    var pendingEvents: [PendingVisitorEvent] { pending }

    /// Plafond de la file (même règle qu'`ImpressionBatcher.pendingCap`) : au-delà,
    /// les plus anciens événements sont abandonnés.
    static let pendingCap = 500

    func record(_ events: [SocialEvent]) {
        guard !events.isEmpty else { return }
        let identity = PendingVisitorEvent.identity(of: token())
        let now = clock()
        pending = Array((pending + events.map {
            PendingVisitorEvent(stamped: .stamping($0, at: now), identity: identity)
        }).suffix(Self.pendingCap))
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
        let tokensByIdentity = Dictionary(
            knownTokens().map { (PendingVisitorEvent.identity(of: $0), $0) },
            uniquingKeysWith: { first, _ in first }
        )
        var kept: [PendingVisitorEvent] = []
        for group in Self.requests(for: batch) {
            guard let groupToken = tokensByIdentity[group[0].identity] else {
                Self.logger.debug("visitor reach identity gone, \(group.count, privacy: .public) events dropped")
                continue
            }
            do {
                _ = try await postService.recordSocialEvents(group.map(\.stamped), credential: .visitor(groupToken))
            } catch where Self.isPermanentRefusal(error) {
                Self.logger.debug("visitor reach refused, dropped without replay: \(error.localizedDescription, privacy: .public)")
            } catch {
                kept.append(contentsOf: group)
            }
        }
        guard !kept.isEmpty else { return }
        pending = Array((kept + pending).suffix(Self.pendingCap))
        persist()
    }

    /// Une requête par identité et par nature, dans l'ordre d'arrivée. Les
    /// engagements d'ouverture (`open`) ont la leur : un serveur qui ne les
    /// connaît pas refuse leur requête, jamais celle des vues.
    static func requests(for batch: [PendingVisitorEvent]) -> [[PendingVisitorEvent]] {
        let identities = batch.map(\.identity).reduce(into: [String]()) { order, identity in
            if !order.contains(identity) { order.append(identity) }
        }
        return identities.flatMap { identity -> [[PendingVisitorEvent]] in
            let mine = batch.filter { $0.identity == identity }
            let views = mine.filter { if case .view = $0.event { return true } else { return false } }
            let impressions = mine.filter { if case .impression = $0.event { return true } else { return false } }
            let opens = mine.filter { $0.event.isOpen }
            return [views, impressions, opens].filter { !$0.isEmpty }
        }
    }

    static func isPermanentRefusal(_ error: Error) -> Bool {
        SocialEventsDispatch.isPermanentRefusal(error)
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
