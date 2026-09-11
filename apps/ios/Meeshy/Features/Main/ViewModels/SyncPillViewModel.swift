import Foundation
import Combine
import MeeshySDK

/// UI-facing state for the sync pill. Combines the outbox queue snapshot
/// (`OfflineQueuePillProviding.pendingUIItemsPublisher`) and the debounced
/// offline-state publisher (`NetworkMonitorProviding.isOfflinePublisher`)
/// into a single discriminated state.
///
/// Priority (highest first): `.failed` > `.offline` > `.syncing` > `.hidden`.
public enum PillState: Equatable, Sendable {
    case hidden
    case syncing(items: [OutboxUIItem])
    case offline(items: [OutboxUIItem])
    case failed(items: [OutboxUIItem])

    public var items: [OutboxUIItem] {
        switch self {
        case .hidden:
            return []
        case .syncing(let items),
             .offline(let items),
             .failed(let items):
            return items
        }
    }
}

@MainActor
final class SyncPillViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published private(set) var state: PillState = .hidden

    private var cancellables = Set<AnyCancellable>()
    /// Réveil UNIQUE armé sur la péremption de la plus proche entrée
    /// terminale. Un `Timer` permanent réveillerait le MainActor toute la
    /// session pour une file vide ; ici, rien ne tourne tant qu'aucune entrée
    /// n'a de date de péremption.
    private var expiryTask: Task<Void, Never>?
    /// Dernière charge reçue de la file, rejouée telle quelle au réveil de
    /// péremption : ce réveil ne change pas la FILE, seulement l'horloge à
    /// laquelle on la lit.
    private var lastItems: [OutboxUIItem] = []
    private var lastIsOffline = false

    /// Inflight rows older than this threshold are treated as "stuck" and
    /// surfaced via `.offline(...)` even when the network reports online —
    /// catches the case where a socket stalled silently.
    nonisolated static let staleInflightThreshold: TimeInterval = 4.0

    /// **Combien de temps une entrée TERMINALE reste un état de
    /// synchronisation** (#4660).
    ///
    /// La pastille dit ce qui se passe MAINTENANT ; passé cette fenêtre, une
    /// ligne qui a renoncé n'est plus un état, c'est un journal. Mesuré au
    /// simulateur le 2026-09-10 : sept lignes `.exhausted` de la veille
    /// (404 / 400 / 500 définitifs sur `gate.staging.meeshy.me`) occupaient la
    /// pastille depuis 25 h — la rétention de la TABLE est de sept jours, et
    /// la pastille les rendait toutes, en carrousel (« Blocage non effectué
    /// 6/7 »), sans qu'aucun geste ne les fasse partir.
    ///
    /// Ce que l'utilisateur a ÉCRIT ne disparaît pas pour autant : une bulle
    /// dont l'envoi a renoncé reste `.failed` dans le fil, avec sa bande de
    /// reprise (`reconcileFailedFromOutbox` / `reconcileOrphanedSendingRows`),
    /// et un brouillon de publication reste proposé par
    /// `recoverLastUnsentPost`. Seule l'ANNONCE d'état s'efface.
    nonisolated static let terminalDisplayWindow: TimeInterval = 60

    init(
        offlineQueue: OfflineQueuePillProviding = OfflineQueue.shared,
        networkMonitor: NetworkMonitorProviding = NetworkMonitor.shared
    ) {
        Publishers.CombineLatest(
            offlineQueue.pendingUIItemsPublisher,
            networkMonitor.isOfflinePublisher
        )
        .receive(on: DispatchQueue.main)
        .sink { [weak self] items, isOffline in
            self?.apply(items: items, isOffline: isOffline)
        }
        .store(in: &cancellables)
    }

    /// Recalcule l'état ET arme le réveil de la prochaine péremption.
    ///
    /// Sans ce réveil, la fenêtre ci-dessus serait INERTE : `derive` ne
    /// s'exécute que sur une émission de la file, et une file qui ne contient
    /// QUE des lignes terminales n'émet plus jamais — c'est exactement l'état
    /// mesuré, où la pastille restait figée sans qu'aucun événement ne vienne
    /// la relire.
    private func apply(items: [OutboxUIItem], isOffline: Bool) {
        lastItems = items
        lastIsOffline = isOffline
        let now = Date()
        let newState = Self.derive(items: items, isOffline: isOffline, now: now)
        if newState != state { state = newState }
        scheduleNextExpiry(items: items, now: now)
    }

    private func scheduleNextExpiry(items: [OutboxUIItem], now: Date) {
        expiryTask?.cancel()
        expiryTask = nil
        guard let next = Self.nextExpiry(items: items, now: now) else { return }
        let delay = max(0, next.timeIntervalSince(now))
        expiryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000) + 50_000_000)
            guard !Task.isCancelled, let self else { return }
            self.apply(items: self.lastItems, isOffline: self.lastIsOffline)
        }
    }

    /// Instant de la prochaine péremption d'entrée terminale, ou `nil` si
    /// aucune entrée n'a d'échéance — auquel cas rien n'est armé.
    nonisolated static func nextExpiry(items: [OutboxUIItem], now: Date) -> Date? {
        items
            .filter { isTerminal($0.status) }
            .map { $0.updatedAt.addingTimeInterval(terminalDisplayWindow) }
            .filter { $0 > now }
            .min()
    }

    /// Une ligne terminale est une ligne que plus rien ne fait avancer toute
    /// seule : le flusher ne reprend que les `.pending`. `.failed` et
    /// `.exhausted` sont donc au même rang ici — c'est déjà la lecture de
    /// `StuckPublicationRetry.retryableOutboxId(for:)`.
    nonisolated static func isTerminal(_ status: OutboxStatus) -> Bool {
        status == .failed || status == .exhausted
    }

    nonisolated static func derive(
        items: [OutboxUIItem],
        isOffline: Bool,
        now: Date
    ) -> PillState {
        // #4660 — la péremption est par ENTRÉE, jamais par pastille : une ligne
        // morte périmée sort du carrousel sans emporter le travail encore
        // vivant, et surtout sans continuer à faire virer la pastille au rouge
        // pendant qu'un envoi est en cours.
        let items = items.filter { item in
            guard isTerminal(item.status) else { return true }
            return now.timeIntervalSince(item.updatedAt) <= terminalDisplayWindow
        }
        // T14b — `.exhausted` (gave up after maxAttempts) is a permanent failure
        // needing user attention, surfaced the same as a transient `.failed`.
        if items.contains(where: { isTerminal($0.status) }) {
            return .failed(items: items)
        }
        let hasStaleInflight = items.contains { item in
            item.status == .inflight
                && now.timeIntervalSince(item.createdAt) > staleInflightThreshold
        }
        if isOffline || hasStaleInflight {
            return .offline(items: items)
        }
        if !items.isEmpty {
            return .syncing(items: items)
        }
        return .hidden
    }
}
