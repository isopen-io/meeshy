import Foundation
import GRDB
import os

private let publicationCancelLog = MeeshyLog.logger(.publicationCancel, subsystem: .sdk)

/// **Ce que « Supprimer » a fait d'une publication encore dans la file** (#10321).
public enum PublicationCancellation: Sendable, Equatable {
    /// La ligne attendait (`pending`, `failed`, `exhausted`) : elle est retirée,
    /// rien ne partira au retour du réseau.
    case removed
    /// La ligne était EN VOL : elle porte désormais une marque d'annulation
    /// durable, l'envoi s'arrête au prochain point de contrôle. Si la requête
    /// était déjà partie, le serveur fait foi : la publication apparaîtra en
    /// ligne au rechargement.
    case cancelRequested
    /// Aucune ligne `.createPost` sous ce cmid : elle est déjà partie.
    case notFound
    /// La base a refusé l'écriture : rien n'a changé.
    case failed
}

/// L'erreur qu'un dispatcher lève quand il trouve la marque d'annulation. Le
/// flusher la traite « supprimer sans `.applied` ni `.exhausted` ».
public enum OutboxCancellationError: Error, Equatable, Sendable {
    case cancelledByAuthor
}

extension OfflineQueueing {
    /// Défaut : un double qui ne la surcharge pas ne connaît aucune ligne.
    public func cancelPendingPublication(clientMutationId: String) async -> PublicationCancellation {
        .notFound
    }
}

extension OfflineQueue {

    /// Retire une publication `.createPost` de la file, dans UNE transaction
    /// d'écriture : GRDB sérialise les écritures, donc la course avec
    /// `OutboxFlusher.claimPending` se réduit à deux écritures successives —
    /// soit la suppression gagne (le claim ne trouve plus rien), soit le claim
    /// gagne (la ligne est `.inflight` et reçoit la marque).
    ///
    /// Les fichiers d'une ligne EN VOL ne sont pas effacés ici : le
    /// téléverseur les lit peut-être en ce moment. Le flusher les nettoie quand
    /// l'envoi s'arrête.
    public func cancelPendingPublication(clientMutationId cmid: String) async -> PublicationCancellation {
        let outboxId = "ofqm_\(cmid)"
        guard let pool = outboxPool else { return .notFound }
        let now = Date()
        let verdict: (PublicationCancellation, Data?)
        do {
            verdict = try await pool.write { db -> (PublicationCancellation, Data?) in
                guard let record = try OutboxRecord.fetchOne(db, key: outboxId),
                      record.kind == .createPost else {
                    return (.notFound, nil)
                }
                guard record.status != .inflight else {
                    try db.execute(
                        sql: "UPDATE outbox SET cancelRequestedAt = ? WHERE id = ?",
                        arguments: [now, outboxId]
                    )
                    return (.cancelRequested, nil)
                }
                _ = try OutboxRecord.deleteOne(db, key: outboxId)
                return (.removed, record.payload)
            }
        } catch {
            publicationCancelLog.error("cancelPendingPublication \(outboxId, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
            return .failed
        }
        switch verdict.0 {
        case .removed:
            if let payload = verdict.1 {
                Self.removePublicationFiles(payload: payload, context: "cancelPendingPublication")
            }
            await refreshPendingCount()
        case .cancelRequested:
            OutboxInflightDispatches.shared.cancel(outboxId)
        case .notFound, .failed:
            break
        }
        return verdict.0
    }

    /// Vrai quand la ligne n'existe plus ou porte la marque d'annulation. Une
    /// panne de LECTURE rend `false` : elle ne doit pas retenir un envoi que
    /// personne n'a annulé.
    public func isPublicationCancelled(outboxId: String) async -> Bool {
        guard let pool = outboxPool else { return false }
        do {
            return try await pool.read { db in
                guard let record = try OutboxRecord.fetchOne(db, key: outboxId) else { return true }
                return record.cancelRequestedAt != nil
            }
        } catch {
            publicationCancelLog.error("isPublicationCancelled \(outboxId, privacy: .public) read failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// Le point de contrôle du dispatcher : avant chaque téléversement et juste
    /// avant le `POST`.
    public func throwIfPublicationCancelled(outboxId: String) async throws {
        if await isPublicationCancelled(outboxId: outboxId) {
            throw OutboxCancellationError.cancelledByAuthor
        }
    }

    static func removePublicationFiles(payload: Data, context: String) {
        guard let decoded = try? JSONDecoder().decode(CreatePostPayload.self, from: payload) else { return }
        for stored in decoded.localMediaPaths ?? [] {
            FileManager.default.removeItemLogging(atPath: absoluteMediaPath(forStored: stored), context: context)
        }
    }
}

/// Les envois en cours, par id de ligne, pour que l'annulation d'une ligne EN
/// VOL coupe aussi la requête (URLSession s'arrête quand sa `Task` est annulée).
final class OutboxInflightDispatches: Sendable {
    static let shared = OutboxInflightDispatches()

    private let tasks = Locked([String: Task<Void, Error>]())

    func register(_ task: Task<Void, Error>, for id: String) {
        tasks.mutate { $0[id] = task }
    }

    func unregister(_ task: Task<Void, Error>, for id: String) {
        tasks.mutate { table in
            guard table[id] == task else { return }
            table[id] = nil
        }
    }

    func cancel(_ id: String) {
        let task = tasks.read { $0[id] }
        task?.cancel()
    }
}
