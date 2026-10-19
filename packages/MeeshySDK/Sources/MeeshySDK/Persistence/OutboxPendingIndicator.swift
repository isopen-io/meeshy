import Foundation
import Combine
import GRDB
import os

/// Ce que l'UI lit de l'outbox : le nombre d'opérations en attente, l'alerte de
/// quasi-saturation et le haut de file pour la SyncPill. Possède les trois
/// sujets Combine ; `OfflineQueue` ne fait que lui demander de se rafraîchir.
///
/// `Sendable` : les sujets sont `SendableCurrentValueSubject`, donc lisibles de
/// n'importe quel contexte (vues SwiftUI) sans attendre l'acteur.
final class OutboxPendingIndicator: Sendable {
    private let countSubject = SendableCurrentValueSubject<Int>(0)
    private let nearCapacitySubject = SendableCurrentValueSubject<Bool>(false)
    private let uiItemsSubject = SendableCurrentValueSubject<[OutboxUIItem]>([])
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "offlinequeue")

    /// Cap on the number of `OutboxUIItem` snapshots surfaced through the
    /// publisher. The pill UI only renders the head of the queue; an unbounded
    /// fetch on a large backlog would burn memory and decode time for rows the
    /// user can never see.
    private static let pendingUIItemsLimit = 50

    /// Items-at-risk threshold: when the queue reaches this count the
    /// `nearCapacityPublisher` fires `true` so the UI can warn the user.
    /// Set at 80% of the max to give a meaningful heads-up before messages
    /// are silently evicted.
    private static let nearCapacityThreshold = OfflineQueue.maxQueueSize * 4 / 5

    var countPublisher: AnyPublisher<Int, Never> {
        countSubject.publisher
    }

    var nearCapacityPublisher: AnyPublisher<Bool, Never> {
        nearCapacitySubject.publisher.removeDuplicates().eraseToAnyPublisher()
    }

    var isNearCapacity: Bool { nearCapacitySubject.value }

    var uiItemsPublisher: AnyPublisher<[OutboxUIItem], Never> {
        uiItemsSubject.publisher
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    /// Raw `OutboxKind` values that MUST NOT keep the « Synchronisation… »
    /// indicator visible (`countsTowardSyncIndicator == false`). Shared by the
    /// count query AND the SyncPill UI-items query so the badge count and the
    /// rotating pill can never disagree about which rows are user-relevant — a
    /// `markAsRead` that lingers must be invisible in BOTH, not counted out of
    /// one while still rotating in the other.
    private static let syncIndicatorExcludedKinds: [String] = OutboxKind.allCases
        .filter { !$0.countsTowardSyncIndicator }
        .map(\.rawValue)

    /// Counts rows currently in `.pending` or `.inflight` state and updates
    /// `countSubject`. Called after every enqueue/dequeue/retryItem
    /// touchpoint. Falls back to the in-memory mirror if no pool is wired.
    /// Also refreshes the `uiItemsSubject` snapshot so the SyncPill UI
    /// re-renders on the same touchpoints.
    func refresh(pool: (any DatabaseWriter)?, inMemoryCount: Int) async {
        guard let pool else {
            countSubject.send(inMemoryCount)
            nearCapacitySubject.send(inMemoryCount >= Self.nearCapacityThreshold)
            uiItemsSubject.send([])
            return
        }
        // Seules les opérations qui justifient l'indicateur « Synchronisation… »
        // sont comptées — un accusé de lecture (`markAsRead`) coincé ne doit
        // pas maintenir le bandeau alors que la conversation est synchronisée.
        let excludedKinds = Self.syncIndicatorExcludedKinds
        // Échec de lecture GRDB → 0, PAS le miroir mémoire `items` : le
        // flusher draine la table SANS toucher le miroir (il devient périmé
        // après tout drain) et `refreshPendingUIItems` retombe déjà sur `[]`
        // — un fallback divergent affichait la bannière « Synchronisation »
        // générique (pendingCount > 0, pendingUIItems vide) en permanence.
        // Cohérence : pendingCount == 0 ⟺ pendingUIItems == [] en dégradé.
        let count: Int
        do {
            count = try await pool.read { db in
                try OutboxRecord
                    .filter([OutboxStatus.pending.rawValue, OutboxStatus.inflight.rawValue]
                        .contains(Column("status")))
                    .filter(!excludedKinds.contains(Column("kind")))
                    .fetchCount(db)
            }
        } catch {
            logger.error("refreshPendingCount read failed — reporting 0 to keep the degraded invariant: \(error.localizedDescription, privacy: .public)")
            count = 0
        }
        countSubject.send(count)
        nearCapacitySubject.send(count >= Self.nearCapacityThreshold)
        await refreshPendingUIItems(pool: pool)
    }

    /// Reads the head of the outbox table (rows in `.pending`, `.inflight`,
    /// `.failed` or `.exhausted` ordered by `createdAt` ascending, capped at
    /// `pendingUIItemsLimit`) and pushes the corresponding `OutboxUIItem`
    /// snapshots onto `uiItemsSubject`. Decoding cost is paid once on
    /// each outbox mutation, never on the SwiftUI render path.
    ///
    /// Applies the SAME `syncIndicatorExcludedKinds` filter as the count query
    /// (`refreshPendingCount`): a `markAsRead` row is a background read receipt,
    /// not a user-initiated operation. Without this filter the SyncPill rotated
    /// through "Synchronisation des lus" for every conversation merely opened —
    /// phantom operations the user never started — while the badge count (which
    /// already excludes them) read zero. The pill must surface only rows that
    /// represent real work the user is waiting on.
    private func refreshPendingUIItems(pool: any DatabaseWriter) async {
        let limit = Self.pendingUIItemsLimit
        let excludedKinds = Self.syncIndicatorExcludedKinds
        // Une ligne de commentaire ne se montre que sous preuve (#9743, M3) :
        // compte du jeton, auteur de la ligne, base prouvée dans CETTE lecture.
        let commentContext = CommentOwnership.userId(inToken: APIClient.shared.authToken).map {
            OfflineQueue.CommentContext(ownerId: $0, serverOrigin: MeeshyConfig.shared.persistedServerOrigin, pool: pool)
        }
        let records: [OutboxRecord]
        do {
            records = try await pool.read { db in
                let baseProven = try commentContext?.proves(db) ?? false
                return try OutboxRecord
                    .filter([
                        OutboxStatus.pending.rawValue,
                        OutboxStatus.inflight.rawValue,
                        OutboxStatus.failed.rawValue,
                        // T14b — surface permanently-failed (`.exhausted`) rows so the
                        // SyncPill can show a non-message mutation that gave up; the
                        // T14 GC bounds how long they linger.
                        OutboxStatus.exhausted.rawValue
                    ].contains(Column("status")))
                    .filter(!excludedKinds.contains(Column("kind")))
                    .order(Column("createdAt").asc)
                    .limit(limit)
                    .fetchAll(db)
                    .filter { record in
                        guard record.kind == .createComment else { return true }
                        guard baseProven, let owner = commentContext?.ownerId,
                              let payload = try? JSONDecoder().decode(CreateCommentPayload.self, from: record.payload) else {
                            return false
                        }
                        return CommentOwnership.mayHandle(payload, ownerId: owner, baseIsHis: true)
                    }
            }
        } catch {
            logger.error("refreshPendingUIItems read failed — reporting [] to keep the degraded invariant: \(error.localizedDescription, privacy: .public)")
            records = []
        }
        let items = records.map(OutboxUIItem.from(record:))
        uiItemsSubject.send(items)
    }
}
