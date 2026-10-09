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

// MARK: - À qui appartient un commentaire en attente

/// Un commentaire en attente appartient au compte qui l'a écrit, et à lui
/// seul : il ne s'enfile, ne se rejoue, ne se montre et ne se relance que
/// sous ce compte.
///
/// **UNE règle, fermée par défaut.** Tout ce qui ne permet pas de DÉCIDER —
/// auteur absent (ligne gravée avant le champ), auteur vide, compte courant
/// absent ou vide, jeton illisible — vaut NON. Deux chaînes vides ne sont
/// jamais « le même compte ».
public enum CommentOwnership {

    public enum Refusal: Error, Sendable, Equatable {
        /// Personne n'est connecté, l'auteur n'est pas lisible, ou le compte
        /// courant n'est pas l'auteur.
        case notTheAuthor
    }

    /// Un identifiant de compte utilisable — `nil` quand il est absent ou vide.
    public static func identity(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// `true` SEULEMENT quand `currentUserId` est l'auteur déclaré de la charge.
    public static func owns(_ payload: CreateCommentPayload, currentUserId: String?) -> Bool {
        guard let author = identity(payload.authorId), let current = identity(currentUserId) else { return false }
        return author == current
    }

    /// Une ligne de TEXTE gravée avant le champ « auteur » : sans auteur, et
    /// sans aucune pièce (aucune ligne ancienne ne pouvait en emporter).
    ///
    /// Elle ne se rejoue JAMAIS d'elle-même. Mais elle vit dans la base d'un
    /// compte, et la laisser inerte ferait perdre en silence, à la mise à
    /// jour, ce que son auteur a écrit : elle reste donc VISIBLE pour ce
    /// compte, « non envoyée », et c'est sa relance MANUELLE — un acte
    /// explicite du compte connecté, dans sa propre base — qui lui donne un
    /// auteur (`adopting`).
    public static func isUnattributedText(_ payload: CreateCommentPayload) -> Bool {
        identity(payload.authorId) == nil
            && (payload.localMediaPaths ?? []).isEmpty
            && (payload.uploadedMedia ?? []).isEmpty
    }

    /// **La PREUVE que la base ouverte est celle de `ownerId`.**
    ///
    /// « Un compte est connecté » ne prouve rien sur la base lue : la file est
    /// rebranchée après une bascule de compte par une tâche non attendue, et
    /// pendant cette fenêtre le compte B lit encore la base de A. Le nom d'une
    /// base de compte EST l'empreinte de son compte
    /// (`MessageStoreAccountKey.databaseFileName`) : on recalcule celle de
    /// `ownerId` et on la compare au fichier réellement ouvert. Chemin absent,
    /// base en mémoire, base héritée non cloisonnée, autre compte : NON.
    public static func baseBelongs(toOwner ownerId: String?, databasePath: String?, serverOrigin: String) -> Bool {
        guard let owner = identity(ownerId), let path = databasePath, !path.isEmpty,
              let key = MessageStoreAccountKey(userId: owner, serverOrigin: serverOrigin) else { return false }
        return (path as NSString).lastPathComponent == key.databaseFileName
    }

    /// Ce que `ownerId` a le droit de VOIR et de relancer : ses propres
    /// lignes, et — SI `baseIsHis` est prouvé — les lignes de texte héritées
    /// sans auteur de SA base. Jamais la ligne d'un autre compte, jamais rien
    /// sans compte, jamais une ligne héritée lue dans la base d'un autre.
    public static func mayHandle(_ payload: CreateCommentPayload, ownerId: String?, baseIsHis: Bool) -> Bool {
        guard baseIsHis, identity(ownerId) != nil else { return false }
        return owns(payload, currentUserId: ownerId) || isUnattributedText(payload)
    }

    /// Le compte qu'un jeton de session DÉSIGNE (revendication `userId` du
    /// JWT) — `nil` pour tout jeton mal formé. Lue dans le jeton lui-même :
    /// c'est ce qui lie l'identité vérifiée à l'identifiant qui signe la
    /// requête, sans aucune seconde source qui pourrait avoir changé.
    public static func userId(inToken token: String?) -> String? {
        guard let token else { return nil }
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { return nil }
        var base64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        guard let data = Data(base64Encoded: base64),
              let claims = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        return identity(claims["userId"] as? String)
    }

    /// Le jeton sous lequel ce commentaire a le droit de partir : celui qui
    /// est remis, SI il désigne l'auteur déclaré. Le jeton rendu est celui que
    /// l'appelant doit poser sur la requête — vérification et envoi lisent la
    /// même valeur.
    public static func tokenBound(to payload: CreateCommentPayload, token: String?) throws -> String {
        guard let token, !token.isEmpty,
              let author = identity(payload.authorId),
              let designated = userId(inToken: token),
              author == designated else {
            throw Refusal.notTheAuthor
        }
        return token
    }

    /// Les pièces de la charge, SI toutes vivent dans le dossier de son
    /// auteur — `nil` sinon. Un chemin absolu, un `..`, ou le dossier d'un
    /// autre compte : la ligne ne lit pas les fichiers d'un autre.
    public static func ownedMediaPaths(_ payload: CreateCommentPayload) -> [String]? {
        let paths = payload.localMediaPaths ?? []
        guard !paths.isEmpty else { return [] }
        guard let folder = mediaDirectoryName(ownerId: payload.authorId) else { return nil }
        let prefix = "\(OfflineQueue.pendingMediaDirectoryName)/\(folder)/"
        let owned = paths.allSatisfy { path in
            path.hasPrefix(prefix) && !path.split(separator: "/").contains("..")
        }
        return owned ? paths : nil
    }

    /// Le dossier des pièces en attente d'UN compte, sous `pending-media/` :
    /// cloisonné, et purgé d'un bloc à sa déconnexion. `nil` sans identifiant
    /// utilisable — on ne range rien dans un dossier sans propriétaire.
    public static func mediaDirectoryName(ownerId: String?) -> String? {
        guard let owner = identity(ownerId) else { return nil }
        let safe = owner.filter { $0.isLetter || $0.isNumber }
        return safe.isEmpty ? nil : "comments-" + safe
    }
}

// MARK: - Le plafond du disque

/// Ce qu'UN compte peut tenir en attente sur le disque.
public enum CommentMediaQuota {
    /// 512 Mo : dix vidéos de commentaire en attente tiennent, une file qui
    /// ne se vide jamais ne remplit pas l'appareil.
    public static let byteCeilingPerAccount: Int64 = 512 * 1024 * 1024

    public struct Exceeded: Error, Sendable, Equatable {
        public let limit: Int64
    }

    public static func admits(incoming: Int64, alreadyStored: Int64,
                              ceiling: Int64 = byteCeilingPerAccount) -> Bool {
        incoming >= 0 && alreadyStored >= 0 && incoming <= ceiling - min(alreadyStored, ceiling)
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

    /// Une ligne héritée sans auteur : elle n'ira nulle part sans une relance
    /// manuelle, qui l'attribuera au compte connecté.
    public var needsAdoption: Bool { CommentOwnership.isUnattributedText(payload) }

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

    /// Confie à la file un commentaire AVEC ses pièces — pour le compte
    /// `ownerId`, qui doit en être l'auteur déclaré (`CommentOwnership`).
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
        acquired: [UploadedCommentMedia] = [],
        ownerId: String?
    ) async throws -> EnqueueMediaResult {
        guard CommentOwnership.owns(comment, currentUserId: ownerId),
              let folder = CommentOwnership.mediaDirectoryName(ownerId: ownerId) else {
            throw CommentOwnership.Refusal.notTheAuthor
        }
        guard let pool = outboxPool else { throw EnqueueMediaError.poolNotConfigured }
        // La ligne et ses pièces ne s'écrivent que dans la base de leur auteur.
        guard Self.proves(pool, belongsTo: ownerId) else { throw CommentOwnership.Refusal.notTheAuthor }
        let cmid = comment.clientMutationId
        // **Un même identifiant client ne s'enfile qu'une fois.** Une ligne
        // déjà là garde SES fichiers : les recopier puis échouer à l'insertion
        // les aurait supprimés sous elle.
        let existingId = "ofqm_\(cmid)"
        if let existing = try await pool.read({ db in try OutboxRecord.fetchOne(db, key: existingId) }) {
            // La ligne déjà là doit être LA MÊME, du même auteur : sinon on
            // refuse, plutôt que de rendre les pièces d'un autre.
            let stored = try decoder.decode(CreateCommentPayload.self, from: existing.payload)
            guard CommentOwnership.owns(stored, currentUserId: ownerId) else {
                throw CommentOwnership.Refusal.notTheAuthor
            }
            return EnqueueMediaResult(outboxId: existingId, localMediaPaths: stored.localMediaPaths ?? [])
        }
        // **La file ne grossit pas sans borne** (audit, constat 7) : au-delà du
        // plafond par compte, la pose est refusée AVANT toute copie.
        let incoming = sourceMediaURLs.reduce(Int64(0)) { $0 + Self.fileSize(atPath: $1.path) }
        let stored = Self.directorySize(atPath: Self.absoluteMediaPath(
            forStored: "\(Self.pendingMediaDirectoryName)/\(folder)"))
        guard CommentMediaQuota.admits(incoming: incoming, alreadyStored: stored) else {
            throw CommentMediaQuota.Exceeded(limit: CommentMediaQuota.byteCeilingPerAccount)
        }
        let relativePaths: [String] = try sourceMediaURLs.indices.map { index in
            try Self.pendingMediaRelativePath(
                for: "\(folder)/\(cmid)",
                index: index, ext: sourceMediaURLs[index].pathExtension)
        }
        Self.excludeFromBackup(relativePath: "\(Self.pendingMediaDirectoryName)/\(folder)")
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
            logger.error("recordUploadedCommentMedia(\(outboxId, privacy: .private), index \(media.sourceIndex, privacy: .public)) failed — pièce re-téléversée au prochain rejeu : \(error.localizedDescription, privacy: .private)")
        }
    }

    /// Les commentaires d'une publication que `ownerId` a écrits et qui ne
    /// sont pas partis, du plus ancien au plus récent. Ceux d'un autre compte
    /// ne se montrent jamais.
    public func unsentComments(postId: String, ownerId: String?) async -> [UnsentComment] {
        guard let pool = outboxPool else { return [] }
        let baseIsHis = Self.proves(pool, belongsTo: ownerId)
        guard baseIsHis else { return [] }
        let records: [OutboxRecord]
        do {
            records = try await pool.read { db in
                try OutboxRecord
                    .filter(Column("kind") == OutboxKind.createComment.rawValue)
                    .order(Column("createdAt").asc)
                    .fetchAll(db)
            }
        } catch {
            logger.error("unsentComments read failed: \(error.localizedDescription, privacy: .private)")
            return []
        }
        return records.compactMap { record in
            // La publication se lit dans la CHARGE : tous les sites d'envoi
            // ne posent pas la même ancre sur la ligne.
            guard let payload = try? decoder.decode(CreateCommentPayload.self, from: record.payload),
                  payload.postId == postId,
                  CommentOwnership.mayHandle(payload, ownerId: ownerId, baseIsHis: baseIsHis) else { return nil }
            guard let owned = CommentOwnership.ownedMediaPaths(payload) else { return nil }
            let urls = owned.map { URL(fileURLWithPath: Self.absoluteMediaPath(forStored: $0)) }
            return UnsentComment(payload: payload,
                                 isFailed: record.status == .exhausted || CommentOwnership.isUnattributedText(payload),
                                 lastError: record.lastError, createdAt: record.createdAt,
                                 localMediaURLs: urls)
        }
    }

    /// Le commentaire de cet identifiant client, s'il est encore dans la file.
    public func unsentComment(clientMutationId cmid: String, ownerId: String?) async -> UnsentComment? {
        guard let pool = outboxPool else { return nil }
        return await unsentComment(clientMutationId: cmid, ownerId: ownerId, in: pool)
    }

    /// La même lecture, dans UNE base désignée : celle dont l'appelant tient
    /// déjà la référence, pour que la preuve et la lecture portent sur la même.
    private func unsentComment(clientMutationId cmid: String, ownerId: String?,
                               in pool: any DatabaseWriter) async -> UnsentComment? {
        let outboxId = "ofqm_\(cmid)"
        guard let record = try? await pool.read({ db in try OutboxRecord.fetchOne(db, key: outboxId) }),
              record.kind == .createComment,
              let payload = try? decoder.decode(CreateCommentPayload.self, from: record.payload),
              CommentOwnership.mayHandle(payload, ownerId: ownerId, baseIsHis: Self.proves(pool, belongsTo: ownerId)),
              let owned = CommentOwnership.ownedMediaPaths(payload) else { return nil }
        return UnsentComment(
            payload: payload,
            isFailed: record.status == .exhausted || CommentOwnership.isUnattributedText(payload),
            lastError: record.lastError,
            createdAt: record.createdAt,
            localMediaURLs: owned.map { URL(fileURLWithPath: Self.absoluteMediaPath(forStored: $0)) })
    }

    /// L'AUTEUR renonce à un commentaire qui n'est pas parti : la ligne et
    /// ses fichiers. Sans effet pour tout autre compte — une ligne ne se
    /// supprime que sous celui qui l'a écrite. Rend `true` si elle est partie.
    @discardableResult
    public func cancelCreateComment(clientMutationId cmid: String, ownerId: String?) async -> Bool {
        let outboxId = "ofqm_\(cmid)"
        guard let pool = outboxPool else { return false }
        do {
            guard let record = try await pool.read({ db in try OutboxRecord.fetchOne(db, key: outboxId) }),
                  record.kind == .createComment else { return false }
            let payload = try decoder.decode(CreateCommentPayload.self, from: record.payload)
            guard CommentOwnership.mayHandle(payload, ownerId: ownerId,
                                             baseIsHis: Self.proves(pool, belongsTo: ownerId)) else { return false }
            // Seuls les fichiers du dossier de l'auteur se suppriment.
            let owned = CommentOwnership.ownedMediaPaths(payload) ?? []
            removePendingCommentFiles(owned)
            Self.removeEmptyParentDirectories(of: owned)
            try await pool.write { db in _ = try OutboxRecord.deleteOne(db, key: outboxId) }
        } catch {
            logger.error("cancelCreateComment failed: \(error.localizedDescription, privacy: .private)")
            return false
        }
        await refreshPendingCount()
        return true
    }

    /// L'AUTEUR relance un commentaire que la file a abandonné. Refusé pour
    /// tout autre compte.
    ///
    /// **Une ligne de texte héritée sans auteur est ADOPTÉE par ce geste** :
    /// le compte connecté, dans sa propre base, déclare vouloir l'envoyer —
    /// elle prend `ownerId` pour auteur, puis rejoue comme toute autre, sous
    /// le jeton de ce compte.
    ///
    /// L'adoption exige la PREUVE que la base lue est celle de `ownerId`, et
    /// elle est atomique : l'auteur n'est écrit que si la ligne est encore
    /// celle qu'on a lue (comparaison des octets dans la transaction), puis
    /// la ligne est RELUE et doit appartenir à `ownerId` avant d'être réarmée.
    /// `CommentPublisher` revérifie ensuite, comme pour toute ligne.
    public func retryCreateComment(clientMutationId cmid: String, ownerId: String?) async throws {
        // La base est saisie UNE fois : preuve, lecture, écriture et relecture
        // portent sur la même, même si la file est rebranchée entre-temps.
        guard let pool = outboxPool,
              let owner = CommentOwnership.identity(ownerId),
              Self.proves(pool, belongsTo: owner) else {
            throw CommentOwnership.Refusal.notTheAuthor
        }
        let outboxId = "ofqm_\(cmid)"
        guard let record = try await pool.read({ db in try OutboxRecord.fetchOne(db, key: outboxId) }),
              record.kind == .createComment else {
            throw CommentOwnership.Refusal.notTheAuthor
        }
        // Les octets LUS sont ceux qu'on exigera de retrouver à l'écriture.
        let raw = record.payload
        let payload = try decoder.decode(CreateCommentPayload.self, from: raw)
        guard CommentOwnership.mayHandle(payload, ownerId: owner, baseIsHis: true),
              CommentOwnership.ownedMediaPaths(payload) != nil else {
            throw CommentOwnership.Refusal.notTheAuthor
        }
        if CommentOwnership.isUnattributedText(payload) {
            let adopted = try encoder.encode(payload.adopting(authorId: owner))
            let written = try await pool.write { db -> Bool in
                guard let current = try OutboxRecord.fetchOne(db, key: outboxId),
                      current.kind == .createComment, current.payload == raw else { return false }
                try db.execute(sql: "UPDATE outbox SET payload = ?, updatedAt = ? WHERE id = ?",
                               arguments: [adopted, Date(), outboxId])
                return true
            }
            guard written,
                  let reread = await unsentComment(clientMutationId: cmid, ownerId: owner, in: pool),
                  CommentOwnership.owns(reread.payload, currentUserId: owner) else {
                throw CommentOwnership.Refusal.notTheAuthor
            }
        }
        // Réarmée dans la base PROUVÉE — pas dans celle que la file tiendrait
        // maintenant si elle venait d'être rebranchée.
        guard outboxPool.map({ Self.databasePath(of: $0) }) == Self.databasePath(of: pool) else {
            throw CommentOwnership.Refusal.notTheAuthor
        }
        try await retryItem(outboxId)
    }

    /// Confie à la file un commentaire de TEXTE — dans la base de son auteur,
    /// et dans aucune autre : même garde que pour un commentaire avec pièces.
    @discardableResult
    public func enqueueComment(_ comment: CreateCommentPayload, ownerId: String?) async throws -> String {
        guard CommentOwnership.owns(comment, currentUserId: ownerId),
              let pool = outboxPool, Self.proves(pool, belongsTo: ownerId) else {
            throw CommentOwnership.Refusal.notTheAuthor
        }
        return try await enqueue(.createComment, payload: comment, conversationId: comment.postId)
    }

    /// Le fichier d'une base — `nil` pour une base sans fichier.
    nonisolated static func databasePath(of reader: any DatabaseReader) -> String? {
        let path = (reader as? DatabasePool)?.path ?? (reader as? DatabaseQueue)?.path
        guard let path, !path.isEmpty, path != ":memory:" else { return nil }
        return path
    }

    /// La base `reader` est-elle PROUVÉE être celle de `ownerId` ?
    nonisolated static func proves(_ reader: any DatabaseReader, belongsTo ownerId: String?) -> Bool {
        CommentOwnership.baseBelongs(toOwner: ownerId, databasePath: databasePath(of: reader),
                                     serverOrigin: MeeshyConfig.shared.persistedServerOrigin)
    }

    /// **Un dossier de pièces sans ligne dans la file est supprimé** (audit,
    /// constat 4). Une ligne purgée à 7 jours, un envoi abouti dont le
    /// nettoyage a échoué, une copie interrompue : rien ne reste sur le disque
    /// sans une ligne qui le rejouera. `reader` est la base du compte `ownerId`.
    public nonisolated static func sweepOrphanCommentMedia(ownerId: String?, reader: any DatabaseReader) async {
        // On ne balaie le dossier d'un compte que contre SA base : contre une
        // autre, toutes ses pièces vivantes paraîtraient orphelines.
        guard proves(reader, belongsTo: ownerId),
              let folder = CommentOwnership.mediaDirectoryName(ownerId: ownerId) else { return }
        let root = absoluteMediaPath(forStored: "\(pendingMediaDirectoryName)/\(folder)")
        guard let entries = try? FileManager.default.contentsOfDirectory(atPath: root), !entries.isEmpty else { return }
        // Fail-closed à l'envers : si la base ne se lit pas, on ne supprime RIEN.
        guard let living = try? await reader.read({ db in
            try String.fetchAll(db, sql: "SELECT id FROM outbox WHERE kind = ?",
                                arguments: [OutboxKind.createComment.rawValue])
        }) else { return }
        let alive = Set(living)
        for entry in entries where !alive.contains("ofqm_\(entry)") {
            FileManager.default.removeItemLogging(atPath: (root as NSString).appendingPathComponent(entry),
                                                  context: "pièces de commentaire orphelines")
        }
    }

    /// Retire du disque les pièces en attente de tout compte ABSENT de
    /// `retainedOwnerIds` — les comptes que l'appareil ne garde plus.
    public nonisolated static func purgePendingCommentMedia(keepingOwners retainedOwnerIds: Set<String>) {
        let root = absoluteMediaPath(forStored: pendingMediaDirectoryName)
        let kept = Set(retainedOwnerIds.compactMap { CommentOwnership.mediaDirectoryName(ownerId: $0) })
        guard let entries = try? FileManager.default.contentsOfDirectory(atPath: root) else { return }
        for entry in entries where entry.hasPrefix("comments-") && !kept.contains(entry) {
            FileManager.default.removeItemLogging(atPath: (root as NSString).appendingPathComponent(entry),
                                                  context: "pièces de commentaire d'un compte retiré")
        }
    }

    /// Le dossier d'un commentaire parti, une fois vidé.
    public nonisolated static func removeEmptyParentDirectories(of relativePaths: [String]) {
        let parents = Set(relativePaths.map { (absoluteMediaPath(forStored: $0) as NSString).deletingLastPathComponent })
        for parent in parents {
            guard let contents = try? FileManager.default.contentsOfDirectory(atPath: parent), contents.isEmpty else { continue }
            FileManager.default.removeItemLogging(atPath: parent, context: "dossier de commentaire vidé")
        }
    }

    nonisolated static func fileSize(atPath path: String) -> Int64 {
        ((try? FileManager.default.attributesOfItem(atPath: path))?[.size] as? NSNumber)?.int64Value ?? 0
    }

    nonisolated static func directorySize(atPath path: String) -> Int64 {
        guard let files = FileManager.default.enumerator(atPath: path) else { return 0 }
        return files.reduce(Int64(0)) { total, entry in
            guard let name = entry as? String else { return total }
            return total + fileSize(atPath: (path as NSString).appendingPathComponent(name))
        }
    }

    /// Les pièces en attente ne partent pas dans une sauvegarde de l'appareil.
    nonisolated static func excludeFromBackup(relativePath: String) {
        var url = URL(fileURLWithPath: absoluteMediaPath(forStored: relativePath), isDirectory: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }

    /// Retire du disque toutes les pièces en attente d'UN compte — à sa
    /// déconnexion, quand sa file est purgée : rien ne reste pour le suivant.
    public nonisolated static func purgePendingCommentMedia(ownerId: String?) {
        guard let folder = CommentOwnership.mediaDirectoryName(ownerId: ownerId) else { return }
        let relative = "\(pendingMediaDirectoryName)/\(folder)"
        FileManager.default.removeItemLogging(atPath: absoluteMediaPath(forStored: relative),
                                              context: "pending comment media (déconnexion)")
    }

    private func removePendingCommentFiles(_ relativePaths: [String]) {
        for relativePath in relativePaths {
            FileManager.default.removeItemLogging(atPath: Self.absoluteMediaPath(forStored: relativePath),
                                                  context: "pending comment media")
        }
    }
}

extension CreateCommentPayload {
    /// La même charge, attribuée à `authorId` — pour l'adoption manuelle
    /// d'une ligne de texte héritée (`OfflineQueue.retryCreateComment`).
    func adopting(authorId: String) -> CreateCommentPayload {
        CreateCommentPayload(
            clientMutationId: clientMutationId, postId: postId, parentCommentId: parentCommentId,
            content: content, originalLanguage: originalLanguage, authorId: authorId,
            location: location, effectFlags: effectFlags, quotedPostMediaId: quotedPostMediaId,
            localMediaPaths: localMediaPaths, localMediaMimeTypes: localMediaMimeTypes,
            uploadedMedia: uploadedMedia, mobileTranscription: mobileTranscription
        )
    }

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
            authorId: authorId,
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
