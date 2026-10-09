import Foundation
import GRDB
import os

// **UN COMMENTAIRE HORS LIGNE GARDE SES PIÈCES** (#9743).
//
// `CreateCommentPayload` ne portait ni fichier ni identifiant de média : un
// commentaire avec pièce dont l'envoi échouait rejoignait la file en TEXTE
// SEUL, et son média était perdu au rejeu, sans erreur. Le remède reprend, à
// l'identique, celui des publications (`enqueuePostMedia`,
// `recordUploadedPostMedia`, #5830) : les fichiers sont copiés sous
// `Documents/pending-media/<cmid>/`, la ligne les référence, et chaque
// téléversement acquis est gravé sur elle.

// MARK: - Ce qu'une tentative a déjà monté

/// Une pièce de commentaire DÉJÀ téléversée, rangée sous son index d'origine
/// dans `CreateCommentPayload.localMediaPaths`.
///
/// L'instant du téléversement voyage avec l'id : le serveur balaie au bout de
/// 24 h un média pré-téléversé qu'aucun commentaire n'a réclamé. Un rejeu
/// tardif ne doit donc pas présenter un id que le serveur n'a plus — il
/// re-téléverse le fichier, qui est toujours sur le disque.
public struct UploadedCommentMedia: Codable, Sendable, Equatable {
    public let sourceIndex: Int
    public let id: String
    /// Secondes depuis 1970 — un nombre, pour ne dépendre d'aucune stratégie
    /// de date des encodeurs qui relisent la ligne.
    public let uploadedAt: TimeInterval

    /// La durée pendant laquelle un id téléversé reste présentable. Sous les
    /// 24 h du balayage serveur, avec la marge d'un rejeu lent.
    public static let claimWindow: TimeInterval = 20 * 60 * 60

    public init(sourceIndex: Int, id: String, uploadedAt: TimeInterval) {
        self.sourceIndex = sourceIndex
        self.id = id
        self.uploadedAt = uploadedAt
    }

    public func isClaimable(at now: Date) -> Bool {
        let age = now.timeIntervalSince1970 - uploadedAt
        return age >= 0 && age < Self.claimWindow
    }
}

// MARK: - Le plan d'un rejeu

/// Ce qu'un rejeu doit faire de chaque pièce d'un commentaire — sans état.
public enum CommentMediaReplay {

    public struct Plan: Equatable, Sendable {
        /// Les pièces déjà montées et encore présentables, par index.
        public let acquired: [UploadedCommentMedia]
        /// Les index à téléverser (jamais montés, ou montés depuis trop longtemps).
        public let toUpload: [Int]
        /// Les index dont le fichier a disparu ET qu'aucun id présentable ne couvre.
        public let missing: [Int]
    }

    public static func plan(
        for payload: CreateCommentPayload,
        now: Date,
        fileExists: (Int) -> Bool
    ) -> Plan {
        let count = payload.localMediaPaths?.count ?? 0
        let known = Dictionary((payload.uploadedMedia ?? []).map { ($0.sourceIndex, $0) },
                               uniquingKeysWith: { _, last in last })
        var acquired: [UploadedCommentMedia] = []
        var toUpload: [Int] = []
        var missing: [Int] = []
        for index in 0..<count {
            if let done = known[index], done.isClaimable(at: now) {
                acquired.append(done)
            } else if fileExists(index) {
                toUpload.append(index)
            } else {
                missing.append(index)
            }
        }
        return Plan(acquired: acquired, toUpload: toUpload, missing: missing)
    }

    /// Les ids à lier au commentaire, dans l'ordre où l'auteur a posé ses pièces.
    public static func attachmentIds(_ uploaded: [UploadedCommentMedia]) -> [String] {
        uploaded.sorted { $0.sourceIndex < $1.sourceIndex }.map(\.id)
    }
}

// MARK: - Un commentaire qui n'est pas parti

/// Un commentaire encore dans la file — en route, ou abandonné par le
/// flusher et relançable. Lu depuis la LIGNE : il survit à la fermeture de la
/// feuille et au redémarrage de l'app.
public struct UnsentComment: Sendable, Equatable {
    public let payload: CreateCommentPayload
    /// `true` quand le flusher a renoncé : rien ne repartira sans une relance.
    public let isFailed: Bool
    public let lastError: String?
    public let createdAt: Date
    /// Les fichiers encore sur le disque, par index d'origine.
    public let localMediaURLs: [URL]

    public var clientMutationId: String { payload.clientMutationId }

    public init(payload: CreateCommentPayload, isFailed: Bool, lastError: String?,
                createdAt: Date, localMediaURLs: [URL]) {
        self.payload = payload
        self.isFailed = isFailed
        self.lastError = lastError
        self.createdAt = createdAt
        self.localMediaURLs = localMediaURLs
    }
}

// MARK: - La file

extension OfflineQueue {

    /// Confie à la file un commentaire AVEC ses pièces.
    ///
    /// Les fichiers sont copiés AVANT l'écriture de la ligne : le flusher ne
    /// peut donc jamais rejouer une ligne dont les octets ne sont pas encore
    /// là. `acquired` porte ce que la tentative directe a déjà monté — ces
    /// pièces ne se re-téléversent pas.
    @discardableResult
    public func enqueueCommentMedia(
        _ comment: CreateCommentPayload,
        sourceMediaURLs: [URL],
        sourceMediaMimeTypes: [String]?,
        acquired: [UploadedCommentMedia] = []
    ) async throws -> EnqueueMediaResult {
        guard let pool = outboxPool else { throw EnqueueMediaError.poolNotConfigured }
        let cmid = comment.clientMutationId
        // **Un même identifiant client ne s'enfile qu'une fois.** Une ligne
        // déjà là garde SES fichiers : les recopier puis échouer à l'insertion
        // les aurait supprimés sous elle.
        let existingId = "ofqm_\(cmid)"
        if let existing = try? await pool.read({ db in try OutboxRecord.fetchOne(db, key: existingId) }),
           let stored = try? decoder.decode(CreateCommentPayload.self, from: existing.payload) {
            return EnqueueMediaResult(outboxId: existingId, localMediaPaths: stored.localMediaPaths ?? [])
        }
        let relativePaths: [String] = try sourceMediaURLs.indices.map { index in
            try Self.pendingMediaRelativePath(for: cmid, index: index, ext: sourceMediaURLs[index].pathExtension)
        }
        do {
            try Self.copyPendingMediaFiles(sources: sourceMediaURLs, to: relativePaths)
        } catch {
            removePendingCommentFiles(relativePaths)
            throw EnqueueMediaError.mediaCopyFailed(underlying: error)
        }
        let payload = comment.withMedia(localMediaPaths: relativePaths,
                                        localMediaMimeTypes: sourceMediaMimeTypes,
                                        uploadedMedia: acquired.isEmpty ? nil : acquired)
        do {
            let outboxId = try await enqueue(.createComment, payload: payload, conversationId: comment.postId)
            return EnqueueMediaResult(outboxId: outboxId, localMediaPaths: relativePaths)
        } catch {
            removePendingCommentFiles(relativePaths)
            throw EnqueueMediaError.outboxWriteFailed(underlying: error)
        }
    }

    /// Grave sur la ligne qu'UNE pièce est acquise côté serveur. Idempotent
    /// par index. Un échec d'écriture est journalisé et avalé : il coûte une
    /// re-montée, jamais la tentative en cours.
    public func recordUploadedCommentMedia(outboxId: String, _ media: UploadedCommentMedia) async {
        guard let pool = outboxPool else { return }
        do {
            guard let record = try await pool.read({ db in
                try OutboxRecord.fetchOne(db, key: outboxId)
            }) else { return }
            let payload = try decoder.decode(CreateCommentPayload.self, from: record.payload)
            var acquired = (payload.uploadedMedia ?? []).filter { $0.sourceIndex != media.sourceIndex }
            acquired.append(media)
            acquired.sort { $0.sourceIndex < $1.sourceIndex }
            let encoded = try encoder.encode(payload.withMedia(
                localMediaPaths: payload.localMediaPaths,
                localMediaMimeTypes: payload.localMediaMimeTypes,
                uploadedMedia: acquired))
            try await pool.write { db in
                try db.execute(sql: "UPDATE outbox SET payload = ?, updatedAt = ? WHERE id = ?",
                               arguments: [encoded, Date(), outboxId])
            }
        } catch {
            logger.error("recordUploadedCommentMedia(\(outboxId, privacy: .public), index \(media.sourceIndex, privacy: .public)) failed — pièce re-téléversée au prochain rejeu : \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Les commentaires d'une publication qui ne sont pas partis, du plus
    /// ancien au plus récent.
    public func unsentComments(postId: String) async -> [UnsentComment] {
        guard let pool = outboxPool else { return [] }
        let records: [OutboxRecord]
        do {
            records = try await pool.read { db in
                try OutboxRecord
                    .filter(Column("kind") == OutboxKind.createComment.rawValue)
                    .order(Column("createdAt").asc)
                    .fetchAll(db)
            }
        } catch {
            logger.error("unsentComments read failed: \(error.localizedDescription, privacy: .public)")
            return []
        }
        return records.compactMap { record in
            // La publication se lit dans la CHARGE : tous les sites d'envoi
            // ne posent pas la même ancre sur la ligne.
            guard let payload = try? decoder.decode(CreateCommentPayload.self, from: record.payload),
                  payload.postId == postId else { return nil }
            let urls = (payload.localMediaPaths ?? []).map {
                URL(fileURLWithPath: Self.absoluteMediaPath(forStored: $0))
            }
            return UnsentComment(payload: payload, isFailed: record.status == .exhausted,
                                 lastError: record.lastError, createdAt: record.createdAt,
                                 localMediaURLs: urls)
        }
    }

    /// Le commentaire de cet identifiant client, s'il est encore dans la file.
    public func unsentComment(clientMutationId cmid: String) async -> UnsentComment? {
        guard let pool = outboxPool else { return nil }
        let outboxId = "ofqm_\(cmid)"
        guard let record = try? await pool.read({ db in try OutboxRecord.fetchOne(db, key: outboxId) }),
              record.kind == .createComment,
              let payload = try? decoder.decode(CreateCommentPayload.self, from: record.payload) else { return nil }
        return UnsentComment(
            payload: payload, isFailed: record.status == .exhausted, lastError: record.lastError,
            createdAt: record.createdAt,
            localMediaURLs: (payload.localMediaPaths ?? []).map {
                URL(fileURLWithPath: Self.absoluteMediaPath(forStored: $0))
            })
    }

    /// Renonce à un commentaire qui n'est pas parti : la ligne et ses fichiers.
    public func cancelCreateComment(clientMutationId cmid: String) async {
        let outboxId = "ofqm_\(cmid)"
        guard let pool = outboxPool else { return }
        do {
            if let record = try await pool.read({ db in try OutboxRecord.fetchOne(db, key: outboxId) }),
               let payload = try? decoder.decode(CreateCommentPayload.self, from: record.payload) {
                removePendingCommentFiles(payload.localMediaPaths ?? [])
            }
            try await pool.write { db in _ = try OutboxRecord.deleteOne(db, key: outboxId) }
        } catch {
            logger.error("cancelCreateComment failed: \(error.localizedDescription, privacy: .public)")
        }
        await refreshPendingCount()
    }

    private func removePendingCommentFiles(_ relativePaths: [String]) {
        for relativePath in relativePaths {
            FileManager.default.removeItemLogging(atPath: Self.absoluteMediaPath(forStored: relativePath),
                                                  context: "pending comment media")
        }
    }
}

extension CreateCommentPayload {
    /// Une copie portant d'AUTRES pièces. Écrite par l'`init` complet : un
    /// champ ajouté en amont sans passer ici ferait rougir le compilateur
    /// plutôt que de se perdre à la première écriture de progression.
    public func withMedia(
        localMediaPaths: [String]?,
        localMediaMimeTypes: [String]?,
        uploadedMedia: [UploadedCommentMedia]?
    ) -> CreateCommentPayload {
        CreateCommentPayload(
            clientMutationId: clientMutationId,
            postId: postId,
            parentCommentId: parentCommentId,
            content: content,
            originalLanguage: originalLanguage,
            location: location,
            effectFlags: effectFlags,
            quotedPostMediaId: quotedPostMediaId,
            localMediaPaths: localMediaPaths,
            localMediaMimeTypes: localMediaMimeTypes,
            uploadedMedia: uploadedMedia,
            mobileTranscription: mobileTranscription
        )
    }
}
