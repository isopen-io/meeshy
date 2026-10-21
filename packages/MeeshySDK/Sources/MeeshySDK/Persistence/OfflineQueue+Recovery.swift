import Foundation
import Combine
import GRDB
import os

extension OfflineQueue {
    // MARK: - Offline Draft Recovery (createPost / status / reel)

    public func recoverLastUnsentPost(
        matchingTypes types: Set<String>,
        olderThan threshold: TimeInterval
    ) async -> RecoveredOfflinePost? {
        guard let pool = outboxPool else { return nil }
        let normalizedTypes = Set(types.map { $0.uppercased() })
        let cutoff = Date().addingTimeInterval(-threshold)
        let records: [OutboxRecord]
        do {
            records = try await pool.read { db in
                try OutboxRecord
                    .filter(Column("kind") == OutboxKind.createPost.rawValue)
                    .filter([
                        OutboxStatus.pending.rawValue,
                        OutboxStatus.inflight.rawValue,
                        OutboxStatus.failed.rawValue,
                        OutboxStatus.exhausted.rawValue
                    ].contains(Column("status")))
                    .order(Column("createdAt").desc)
                    .fetchAll(db)
            }
        } catch {
            // L'utilisateur perd la proposition de restauration de son
            // brouillon : la panne doit être traçable.
            logger.error("recoverLastUnsentPost read failed — no draft offered for recovery: \(error.localizedDescription, privacy: .public)")
            records = []
        }

        let decoder = JSONDecoder()
        for record in records {
            // "Not sent within the minute → offline": only rows stuck longer than
            // the threshold qualify; a just-enqueued row is still actively sending.
            guard record.createdAt <= cutoff else { continue }
            let payload: CreatePostPayload
            do {
                payload = try decoder.decode(CreatePostPayload.self, from: record.payload)
            } catch {
                logger.error("recoverLastUnsentPost: skipping undecodable draft \(record.id, privacy: .public): \(error.localizedDescription, privacy: .public)")
                continue
            }
            let resolvedType = (payload.type ?? "POST").uppercased()
            guard normalizedTypes.contains(resolvedType) else { continue }

            let urls: [URL] = (payload.localMediaPaths ?? []).compactMap { stored in
                let path = Self.absoluteMediaPath(forStored: stored)
                return FileManager.default.fileExists(atPath: path) ? URL(fileURLWithPath: path) : nil
            }
            return RecoveredOfflinePost(
                clientMutationId: payload.clientMutationId,
                content: payload.content,
                visibility: payload.visibility,
                originalLanguage: payload.originalLanguage,
                type: resolvedType,
                moodEmoji: payload.moodEmoji,
                audioUrl: payload.audioUrl,
                audioDuration: payload.audioDuration,
                visibilityUserIds: payload.visibilityUserIds,
                localMediaURLs: urls,
                createdAt: record.createdAt
            )
        }
        return nil
    }

    /// Délègue à `cancelPendingPublication` (#10321) : une ligne EN VOL n'est
    /// plus supprimée sous les pieds du téléverseur, elle est marquée.
    public func cancelCreatePost(clientMutationId cmid: String) async {
        _ = await cancelPendingPublication(clientMutationId: cmid)
    }

    // MARK: - Boot Recovery

    /// Boot-time crash recovery: any record left in `.inflight` from a previous
    /// process — the app crashed mid-dispatch — is reset to `.pending` so the
    /// flusher will pick it back up. Idempotent dedup on the gateway
    /// (`MessagingService.handleMessage` catch-P2002, see Phase 4 §6.2)
    /// guarantees that a message which actually reached the server before the
    /// crash will not produce a duplicate at replay time.
    ///
    /// Audio sweep: any `.pending` record whose `OfflineQueueItem.localAudioPath`
    /// no longer exists on disk (e.g. crash between Phase A INSERT and Phase B
    /// file copy) is marked `.failed` since the underlying audio bytes are
    /// gone and the record can never succeed.
    @discardableResult
    public func bootRecovery() async throws -> BootRecoveryReport {
        guard let pool = outboxPool else { throw OfflineQueueError.poolNotConfigured }
        let dec = decoder
        let log = logger
        var report = BootRecoveryReport()
        let warm = hasRecoveredThisProcess
        hasRecoveredThisProcess = true
        let staleCutoff = Date().addingTimeInterval(-OutboxFlusher.staleInflightReclaimSeconds)
        do {
            report = try await pool.write { db in
                var local = BootRecoveryReport()
                var inflightQuery = OutboxRecord
                    .filter(Column("status") == OutboxStatus.inflight.rawValue)
                if warm {
                    inflightQuery = inflightQuery.filter(Column("updatedAt") < staleCutoff)
                } else {
                    // Premier passage, en tâche détachée de basse priorité : un
                    // flush a pu réclamer sa ligne AVANT lui. Seules les lignes
                    // réclamées avant le lancement du processus sont orphelines.
                    inflightQuery = inflightQuery.filter(Column("updatedAt") < Self.processLaunchDate)
                }
                let inflight = try inflightQuery.fetchAll(db)
                for record in inflight {
                    try db.execute(sql: """
                        UPDATE outbox
                        SET status = ?, lastError = ?, updatedAt = ?
                        WHERE id = ?
                        """, arguments: [
                            OutboxStatus.pending.rawValue,
                            "Reset on boot after presumed crash",
                            Date(),
                            record.id
                        ])
                    local.inflightReset += 1
                }

                // Missing-file sweep — audio AND visual media (R-OB4). Any
                // referenced pending file gone on disk means the pre-crash copy
                // never landed → the bytes are gone, the row can never succeed.
                let pendingSends = try OutboxRecord
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
                    .fetchAll(db)
                let fm = FileManager.default
                for record in pendingSends {
                    let item: OfflineQueueItem
                    do {
                        item = try dec.decode(OfflineQueueItem.self, from: record.payload)
                    } catch {
                        // Une ligne jamais décodable ne sera jamais marquée
                        // `.exhausted` : elle reste `.pending` indéfiniment et
                        // encombre l'outbox. La tracer permet de la cibler.
                        log.error("bootRecovery: undecodable pending send \(record.id, privacy: .public) left stuck in the outbox: \(error.localizedDescription, privacy: .public)")
                        continue
                    }
                    // Legacy single-track + multi-track audio AND visual media
                    // paths are all checked. S6 — a row with any missing file is
                    // marked `.exhausted` (terminal + GC-eligible via
                    // purgeExhaustedOlderThan), NOT `.failed`, which the flusher
                    // never picks up and the GC never reclaims, so it would leak
                    // in the outbox + SyncPill across every session. Without the
                    // media branch a pending photo/video send with vanished files
                    // stayed `.pending` and burned 5 dispatcher upload attempts
                    // (or sent a PARTIAL message if only some files survived).
                    let audioPaths = ([item.localAudioPath].compactMap { $0 } + (item.localAudioPaths ?? []))
                        .filter { !$0.isEmpty }
                    let mediaPaths = (item.localMediaPaths ?? []).filter { !$0.isEmpty }
                    guard !audioPaths.isEmpty || !mediaPaths.isEmpty else { continue }
                    let audioMissing = audioPaths.contains { !fm.fileExists(atPath: Self.absoluteAudioPath(forStored: $0)) }
                    let mediaMissing = mediaPaths.contains { !fm.fileExists(atPath: Self.absoluteMediaPath(forStored: $0)) }
                    if audioMissing || mediaMissing {
                        try db.execute(sql: """
                            UPDATE outbox
                            SET status = ?, lastError = ?, updatedAt = ?
                            WHERE id = ?
                            """, arguments: [
                                OutboxStatus.exhausted.rawValue,
                                audioMissing ? "Audio file missing after crash" : "Media file missing after crash",
                                Date(),
                                record.id
                            ])
                        log.warning("Pending file missing for OutboxRecord \(record.id, privacy: .public), marked .exhausted")
                        if audioMissing { local.audioOrphanFailed += 1 }
                        if mediaMissing { local.mediaOrphanFailed += 1 }
                    }
                }
                return local
            }
        } catch {
            throw OfflineQueueError.writeFailed(underlying: error)
        }
        if report.inflightReset > 0 || report.audioOrphanFailed > 0 {
            logger.info("Boot recovery: reset \(report.inflightReset) inflight, marked \(report.audioOrphanFailed) audio orphans failed")
        }
        // #5965 — la file se BORNE ici, et pas seulement au démarrage : ce point
        // est le seul que le boot ET le retour en avant-plan traversent tous
        // les deux. Une ligne définitivement morte y sort de la file (voir
        // `purgeDiscardableTerminalRows`, qui ne jette que ce qu'aucune surface
        // ne relit plus).
        await purgeDiscardableTerminalRows()
        return report
    }

    public struct BootRecoveryReport: Sendable, Equatable {
        public var inflightReset: Int = 0
        public var audioOrphanFailed: Int = 0
        public var mediaOrphanFailed: Int = 0
        public init() {}
    }
}
