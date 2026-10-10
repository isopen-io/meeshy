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
    /// Son origine n'est pas authentifiée : elle n'est JAMAIS envoyée, et
    /// aucun code ne lui écrit un auteur après coup. Mais elle vit dans la
    /// base d'un compte, et la laisser inerte ferait perdre en silence, à la
    /// mise à jour, ce que son auteur a écrit : elle reste VISIBLE pour ce
    /// compte, et « Reprendre » rend son texte au composeur
    /// (`OfflineQueue.resumeInheritedComment`).
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
    ///
    /// **La preuve première est le REGISTRE** (`AccountStoreRegistry`) : le
    /// compte pour lequel l'app a OUVERT ce fichier, inscrit à l'ouverture. Le
    /// recalcul de l'empreinte depuis l'environnement courant n'en est que le
    /// repli — il refusait à tort un compte légitime dès que l'environnement
    /// avait changé depuis l'ouverture de la base (hôte personnalisé posé
    /// après la connexion, recette du 2026-10-09 : commentaire hors ligne
    /// refusé par la file).
    public static func baseBelongs(toOwner ownerId: String?, databasePath: String?, serverOrigin: String) -> Bool {
        guard let owner = identity(ownerId), let path = databasePath, !path.isEmpty else { return false }
        if let registered = AccountStoreRegistry.owner(ofDatabaseAt: path) { return registered == owner }
        guard let key = MessageStoreAccountKey(userId: owner, serverOrigin: serverOrigin) else { return false }
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

    /// La clé COMPLÈTE (utilisateur + environnement) de la base `path` : celle
    /// inscrite à son ouverture, sinon celle de l'environnement courant.
    public static func accountKey(ownerId: String, databasePath: String?, serverOrigin: String) -> MessageStoreAccountKey? {
        if let path = databasePath, let registered = AccountStoreRegistry.key(ofDatabaseAt: path),
           registered.userId == ownerId {
            return registered
        }
        return MessageStoreAccountKey(userId: ownerId, serverOrigin: serverOrigin)
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

// MARK: - Le registre des bases de compte

/// Le compte pour lequel chaque base locale a été OUVERTE — inscrit par l'app
/// au moment où elle ouvre le fichier d'un compte (`MessageStoreSession.open`).
/// Indexé par le chemin du fichier, il se lit depuis la connexion utilisée.
///
/// La clé inscrite est COMPLÈTE (utilisateur + environnement), mais la preuve
/// ne compare que l'utilisateur : une base ouverte pour un compte reste la
/// sienne si l'environnement change ensuite (hôte personnalisé posé après la
/// connexion). C'est un choix assumé : la base est celle du compte, le jeton
/// qui signe est vérifié à chaque envoi, et refuser ferait perdre le
/// commentaire.
public enum AccountStoreRegistry {
    private static let owners = OSAllocatedUnfairLock<[String: MessageStoreAccountKey]>(initialState: [:])

    /// Réservé à l'ouverture d'une base de compte par l'app.
    @_spi(AccountStore)
    public static func register(databasePath: String, key: MessageStoreAccountKey) {
        owners.withLock { $0[normalized(databasePath)] = key }
    }

    public static func owner(ofDatabaseAt path: String) -> String? {
        key(ofDatabaseAt: path)?.userId
    }

    public static func key(ofDatabaseAt path: String) -> MessageStoreAccountKey? {
        owners.withLock { $0[normalized(path)] }
    }

    /// Une base ne s'inscrit que si son fichier EST celui de la clé : une
    /// base de secours éphémère (`meeshy_messages_ephemeral_<UUID>`) ne
    /// prouve rien — un commentaire enfilé là serait perdu au lancement suivant.
    public static func admits(databasePath: String, for key: MessageStoreAccountKey) -> Bool {
        (databasePath as NSString).lastPathComponent == key.databaseFileName
    }

    private static func normalized(_ path: String) -> String {
        (path as NSString).standardizingPath
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

    /// Une ligne de texte héritée sans auteur : elle ne sera jamais envoyée.
    /// Son texte se REPREND dans le composeur, ou la ligne se supprime.
    public var isInherited: Bool { CommentOwnership.isUnattributedText(payload) }

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

    // MARK: Le triplet d'une opération

    /// **Ce sur quoi UNE opération agit, saisi UNE fois** : le compte (celui
    /// que le jeton de l'appelant désigne), l'environnement, et la base.
    ///
    /// Rien d'autre n'est relu ensuite — ni la base courante de la file, qui
    /// peut être rebranchée à tout instant par une bascule de compte, ni un
    /// jeton. Et la PREUVE que cette base est celle de ce compte se fait dans
    /// la transaction même qui lit ou écrit, sur le fichier de LA CONNEXION
    /// utilisée (`proves(_:)`) : aucun point de suspension ne la sépare de
    /// l'action.
    struct CommentContext: Sendable {
        let ownerId: String
        let serverOrigin: String
        let pool: any DatabaseWriter

        /// À appeler DANS une transaction de `pool` : le fichier ouvert par
        /// cette connexion est-il la base de `ownerId` ?
        func proves(_ db: Database) throws -> Bool {
            let file = try String.fetchOne(db, sql: "SELECT file FROM pragma_database_list WHERE name = 'main'")
            return CommentOwnership.baseBelongs(toOwner: ownerId, databasePath: file, serverOrigin: serverOrigin)
        }
    }

    /// Le triplet de `ownerId` sur la base que la file tient À CET INSTANT —
    /// `nil` sans compte utilisable ou sans base.
    func commentContext(ownerId: String?) -> CommentContext? {
        guard let owner = CommentOwnership.identity(ownerId), let pool = outboxPool else { return nil }
        return CommentContext(ownerId: owner, serverOrigin: MeeshyConfig.shared.persistedServerOrigin, pool: pool)
    }

    /// Combien de temps on laisse à la base du compte pour s'ouvrir.
    public static let baseRebindGrace: TimeInterval = 2

    /// Le triplet d'une ÉCRITURE, attendu un court instant.
    ///
    /// Après une bascule de compte, la file est rebranchée par une tâche non
    /// attendue : le compte B est connecté et la file tient encore la base de
    /// A. On n'écrit pas ailleurs — on attend que la base de B soit ouverte,
    /// et le commentaire s'enfile dès qu'elle l'est. Ce pré-contrôle ne
    /// PROUVE rien : la preuve est refaite dans la transaction d'écriture.
    func writableCommentContext(ownerId: String?,
                                grace: TimeInterval = OfflineQueue.baseRebindGrace) async -> CommentContext? {
        let deadline = Date().addingTimeInterval(grace)
        while true {
            guard let context = commentContext(ownerId: ownerId) else {
                guard CommentOwnership.identity(ownerId) != nil, Date() < deadline else { return nil }
                try? await Task.sleep(nanoseconds: 50_000_000)
                continue
            }
            if CommentOwnership.baseBelongs(toOwner: context.ownerId, databasePath: context.pool.path,
                                            serverOrigin: context.serverOrigin) {
                return context
            }
            guard Date() < deadline else { return nil }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
    }

    private static func commentDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    private static func commentEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    // MARK: Écrire

    /// **La SEULE entrée d'un commentaire de texte dans la file.** La ligne
    /// n'est écrite que si la connexion qui l'écrit est PROUVÉE être la base
    /// de son auteur, dans la même transaction.
    @discardableResult
    public func enqueueComment(_ comment: CreateCommentPayload, ownerId: String?) async throws -> String {
        guard CommentOwnership.owns(comment, currentUserId: ownerId),
              let context = await writableCommentContext(ownerId: ownerId) else {
            throw CommentOwnership.Refusal.notTheAuthor
        }
        await commentTransactionHook?()
        let outboxId = try await insertComment(comment, in: context)
        await refreshPendingCount()
        mutationEnqueued.send(())
        return outboxId
    }

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
        guard outboxPool != nil else { throw EnqueueMediaError.poolNotConfigured }
        guard let context = await writableCommentContext(ownerId: ownerId) else {
            throw CommentOwnership.Refusal.notTheAuthor
        }
        let cmid = comment.clientMutationId
        let outboxId = "ofqm_\(cmid)"
        // **Un même identifiant client ne s'enfile qu'une fois.** Une ligne
        // déjà là garde SES fichiers — et doit être celle du même auteur.
        let existing: Data? = try await context.pool.read { db -> Data? in
            guard try context.proves(db) else { throw CommentOwnership.Refusal.notTheAuthor }
            return try OutboxRecord.fetchOne(db, key: outboxId)?.payload
        }
        if let existing {
            let stored = try Self.commentDecoder().decode(CreateCommentPayload.self, from: existing)
            guard CommentOwnership.owns(stored, currentUserId: context.ownerId) else {
                throw CommentOwnership.Refusal.notTheAuthor
            }
            return EnqueueMediaResult(outboxId: outboxId, localMediaPaths: stored.localMediaPaths ?? [])
        }
        // **La file ne grossit pas sans borne** (audit, constat 7) : au-delà du
        // plafond par compte, la pose est refusée AVANT toute copie.
        let incoming = sourceMediaURLs.reduce(Int64(0)) { $0 + Self.fileSize(atPath: $1.path) }
        let stored = Self.directorySize(atPath: Self.absoluteMediaPath(
            forStored: "\(Self.pendingMediaDirectoryName)/\(folder)"))
        guard CommentMediaQuota.admits(incoming: incoming, alreadyStored: stored) else {
            throw CommentMediaQuota.Exceeded(limit: CommentMediaQuota.byteCeilingPerAccount)
        }
        // Scindé par clé COMPLÈTE : un même compte sur deux environnements a
        // deux files, donc deux dossiers.
        guard let key = CommentOwnership.accountKey(ownerId: context.ownerId, databasePath: context.pool.path,
                                                    serverOrigin: context.serverOrigin) else {
            throw CommentOwnership.Refusal.notTheAuthor
        }
        let relativePaths: [String] = try sourceMediaURLs.indices.map { index in
            try Self.pendingMediaRelativePath(
                for: "\(folder)/\(key.fingerprint)/\(cmid)",
                index: index, ext: sourceMediaURLs[index].pathExtension)
        }
        Self.excludeFromBackup(relativePath: "\(Self.pendingMediaDirectoryName)/\(folder)")
        do {
            try Self.copyPendingMediaFiles(sources: sourceMediaURLs, to: relativePaths)
        } catch {
            Self.removePendingCommentFiles(relativePaths)
            throw EnqueueMediaError.mediaCopyFailed(underlying: error)
        }
        let payload = comment.withMedia(localMediaPaths: relativePaths,
                                        localMediaMimeTypes: sourceMediaMimeTypes,
                                        uploadedMedia: acquired.isEmpty ? nil : acquired)
        await commentTransactionHook?()
        do {
            _ = try await insertComment(payload, in: context)
        } catch {
            Self.removePendingCommentFiles(relativePaths)
            Self.removeEmptyParentDirectories(of: relativePaths)
            throw error
        }
        await refreshPendingCount()
        mutationEnqueued.send(())
        return EnqueueMediaResult(outboxId: outboxId, localMediaPaths: relativePaths)
    }

    /// L'insertion, et sa preuve, dans UNE transaction de la base du triplet.
    private func insertComment(_ comment: CreateCommentPayload, in context: CommentContext) async throws -> String {
        let encoded = try Self.commentEncoder().encode(comment)
        let cmid = comment.clientMutationId
        let outboxId = "ofqm_\(cmid)"
        let anchor = comment.postId
        try await context.pool.write { db in
            guard try context.proves(db) else { throw CommentOwnership.Refusal.notTheAuthor }
            try OutboxRecord(id: outboxId, kind: .createComment, conversationId: anchor,
                             messageLocalId: nil, clientMessageId: cmid, payload: encoded,
                             status: .pending, createdAt: Date()).insert(db)
        }
        return outboxId
    }

    /// Grave sur la ligne qu'UNE pièce est acquise côté serveur. Idempotent
    /// par index. La ligne n'est touchée que dans la base de SON auteur. Un
    /// échec est journalisé et avalé : il coûte une re-montée, jamais la
    /// tentative en cours.
    public func recordUploadedCommentMedia(outboxId: String, _ media: UploadedCommentMedia) async {
        guard let pool = outboxPool else { return }
        let origin = MeeshyConfig.shared.persistedServerOrigin
        do {
            try await pool.write { db in
                guard let record = try OutboxRecord.fetchOne(db, key: outboxId), record.kind == .createComment else { return }
                let payload = try Self.commentDecoder().decode(CreateCommentPayload.self, from: record.payload)
                guard let author = CommentOwnership.identity(payload.authorId),
                      try CommentContext(ownerId: author, serverOrigin: origin, pool: pool).proves(db) else { return }
                var acquired = (payload.uploadedMedia ?? []).filter { $0.sourceIndex != media.sourceIndex }
                acquired.append(media)
                acquired.sort { $0.sourceIndex < $1.sourceIndex }
                let encoded = try Self.commentEncoder().encode(payload.withMedia(
                    localMediaPaths: payload.localMediaPaths,
                    localMediaMimeTypes: payload.localMediaMimeTypes,
                    uploadedMedia: acquired))
                try db.execute(sql: "UPDATE outbox SET payload = ?, updatedAt = ? WHERE id = ?",
                               arguments: [encoded, Date(), outboxId])
            }
        } catch {
            logger.error("recordUploadedCommentMedia(index \(media.sourceIndex, privacy: .public)) failed — pièce re-téléversée au prochain rejeu : \(error.localizedDescription, privacy: .private)")
        }
    }

    // MARK: Lire

    /// Les lignes de commentaire de la base du triplet — lues SOUS preuve.
    private func commentRecords(in context: CommentContext, id: String? = nil) async -> [OutboxRecord] {
        await commentTransactionHook?()
        let records: [OutboxRecord]? = try? await context.pool.read { db -> [OutboxRecord] in
            guard try context.proves(db) else { return [] }
            let request = OutboxRecord.filter(Column("kind") == OutboxKind.createComment.rawValue)
            if let id { return try request.filter(Column("id") == id).fetchAll(db) }
            return try request.order(Column("createdAt").asc).fetchAll(db)
        }
        return records ?? []
    }

    private static func unsent(_ record: OutboxRecord, ownerId: String) -> UnsentComment? {
        guard let payload = try? commentDecoder().decode(CreateCommentPayload.self, from: record.payload),
              CommentOwnership.mayHandle(payload, ownerId: ownerId, baseIsHis: true),
              let owned = CommentOwnership.ownedMediaPaths(payload) else { return nil }
        return UnsentComment(
            payload: payload,
            isFailed: record.status == .exhausted || CommentOwnership.isUnattributedText(payload),
            lastError: record.lastError, createdAt: record.createdAt,
            localMediaURLs: owned.map { URL(fileURLWithPath: absoluteMediaPath(forStored: $0)) })
    }

    /// Les commentaires d'une publication qui ne sont pas partis, du plus
    /// ancien au plus récent : ceux que `ownerId` a écrits, et les lignes de
    /// texte héritées de SA base. Rien sans la preuve que la base lue est la
    /// sienne.
    public func unsentComments(postId: String, ownerId: String?) async -> [UnsentComment] {
        guard let context = commentContext(ownerId: ownerId) else { return [] }
        return await commentRecords(in: context)
            .compactMap { Self.unsent($0, ownerId: context.ownerId) }
            .filter { $0.payload.postId == postId }
    }

    /// Le commentaire de cet identifiant client, s'il est encore dans la file.
    public func unsentComment(clientMutationId cmid: String, ownerId: String?) async -> UnsentComment? {
        guard let context = commentContext(ownerId: ownerId) else { return nil }
        return await commentRecords(in: context, id: "ofqm_\(cmid)")
            .compactMap { Self.unsent($0, ownerId: context.ownerId) }.first
    }

    // MARK: Agir sur une ligne

    /// Ce qu'une transaction a retiré de la file.
    private struct Removed: Sendable {
        let content: String
        let ownedPaths: [String]
    }

    /// Retire UNE ligne de la base du triplet, dans une transaction qui
    /// prouve, lit, juge et supprime — sans point de suspension entre eux.
    private func removeComment(clientMutationId cmid: String, in context: CommentContext,
                               onlyIf admits: @escaping @Sendable (CreateCommentPayload) -> Bool) async -> Removed? {
        let outboxId = "ofqm_\(cmid)"
        await commentTransactionHook?()
        let removed: Removed?? = try? await context.pool.write { db -> Removed? in
            guard try context.proves(db),
                  let record = try OutboxRecord.fetchOne(db, key: outboxId), record.kind == .createComment else { return nil }
            let payload = try Self.commentDecoder().decode(CreateCommentPayload.self, from: record.payload)
            guard CommentOwnership.mayHandle(payload, ownerId: context.ownerId, baseIsHis: true), admits(payload) else { return nil }
            _ = try OutboxRecord.deleteOne(db, key: outboxId)
            // Seuls les fichiers du dossier de l'auteur se suppriment.
            return Removed(content: payload.content, ownedPaths: CommentOwnership.ownedMediaPaths(payload) ?? [])
        }
        guard let removed = removed ?? nil else { return nil }
        Self.removePendingCommentFiles(removed.ownedPaths)
        Self.removeEmptyParentDirectories(of: removed.ownedPaths)
        await refreshPendingCount()
        return removed
    }

    /// Le compte renonce à un commentaire de SA base qui n'est pas parti : la
    /// ligne et ses fichiers. Sans effet pour tout autre compte, et sans la
    /// preuve de base. Rend `true` si elle est partie.
    @discardableResult
    public func cancelCreateComment(clientMutationId cmid: String, ownerId: String?) async -> Bool {
        guard let context = commentContext(ownerId: ownerId) else { return false }
        return await removeComment(clientMutationId: cmid, in: context, onlyIf: { _ in true }) != nil
    }

    /// **« Reprendre » une ligne de texte héritée** — gravée avant le champ
    /// « auteur », donc d'origine non authentifiée.
    ///
    /// Une telle ligne n'est JAMAIS envoyée, et aucun code ne lui écrit un
    /// auteur après coup. Ce geste rend son TEXTE à l'appelant, qui le remet
    /// dans le composeur comme un brouillon, et supprime la ligne : le
    /// commentaire repart alors par le chemin normal, avec l'auteur du
    /// compte qui l'envoie. `nil` si la ligne n'est pas une ligne de texte
    /// héritée de la base PROUVÉE de `ownerId`.
    public func resumeInheritedComment(clientMutationId cmid: String, ownerId: String?) async -> String? {
        guard let context = commentContext(ownerId: ownerId) else { return nil }
        return await removeComment(clientMutationId: cmid, in: context,
                                   onlyIf: { CommentOwnership.isUnattributedText($0) })?.content
    }

    /// L'AUTEUR relance un commentaire que la file a abandonné. Refusé pour
    /// tout autre compte, sans la preuve de base, et pour toute ligne sans
    /// auteur : la preuve, le jugement et le réarmement tiennent dans UNE
    /// transaction de la base du triplet.
    public func retryCreateComment(clientMutationId cmid: String, ownerId: String?) async throws {
        guard let context = commentContext(ownerId: ownerId) else {
            throw CommentOwnership.Refusal.notTheAuthor
        }
        let outboxId = "ofqm_\(cmid)"
        await commentTransactionHook?()
        let rearmed = try await context.pool.write { db -> Bool in
            guard try context.proves(db),
                  let record = try OutboxRecord.fetchOne(db, key: outboxId), record.kind == .createComment else { return false }
            let payload = try Self.commentDecoder().decode(CreateCommentPayload.self, from: record.payload)
            guard CommentOwnership.owns(payload, currentUserId: context.ownerId),
                  CommentOwnership.ownedMediaPaths(payload) != nil else { return false }
            let now = Date()
            try db.execute(sql: """
                UPDATE outbox SET status = ?, attempts = 0, lastError = NULL, updatedAt = ?, nextAttemptAt = ?
                WHERE id = ?
                """, arguments: [OutboxStatus.pending.rawValue, now, now, outboxId])
            return true
        }
        guard rearmed else { throw CommentOwnership.Refusal.notTheAuthor }
        forgetOutcome(for: cmid)
        await refreshPendingCount()
        mutationEnqueued.send(())
    }

    // MARK: Le disque

    /// **Un dossier de pièces sans ligne dans la file est supprimé** (audit,
    /// constat 4). Une ligne purgée à 7 jours, un envoi abouti dont le
    /// nettoyage a échoué, une copie interrompue : rien ne reste sur le disque
    /// sans une ligne qui le rejouera. On ne juge le dossier d'un compte que
    /// contre SA base — prouvée dans la lecture même.
    public nonisolated static func sweepOrphanCommentMedia(ownerId: String?, reader: any DatabaseWriter) async {
        guard let owner = CommentOwnership.identity(ownerId),
              let folder = CommentOwnership.mediaDirectoryName(ownerId: owner) else { return }
        let origin = MeeshyConfig.shared.persistedServerOrigin
        let context = CommentContext(ownerId: owner, serverOrigin: origin, pool: reader)
        guard let key = CommentOwnership.accountKey(ownerId: owner, databasePath: reader.path, serverOrigin: origin) else { return }
        // Le dossier de CETTE base seulement : celui d'un autre environnement
        // est jugé contre la sienne.
        let root = absoluteMediaPath(forStored: "\(pendingMediaDirectoryName)/\(folder)/\(key.fingerprint)")
        guard let entries = try? FileManager.default.contentsOfDirectory(atPath: root), !entries.isEmpty else { return }
        // Si la base ne se lit pas ou n'est pas la sienne, on ne supprime RIEN.
        let living: [String]?? = try? await reader.read { db -> [String]? in
            guard try context.proves(db) else { return nil }
            return try String.fetchAll(db, sql: "SELECT id FROM outbox WHERE kind = ?",
                                       arguments: [OutboxKind.createComment.rawValue])
        }
        guard let living = living ?? nil else { return }
        let alive = Set(living)
        for entry in entries where !alive.contains("ofqm_\(entry)") {
            FileManager.default.removeItemLogging(atPath: (root as NSString).appendingPathComponent(entry),
                                                  context: "pièces de commentaire orphelines")
        }
    }

    /// Retire du disque toutes les pièces en attente d'UN compte — à sa
    /// déconnexion, quand sa file est purgée : rien ne reste pour le suivant.
    public nonisolated static func purgePendingCommentMedia(ownerId: String?) {
        guard let folder = CommentOwnership.mediaDirectoryName(ownerId: ownerId) else { return }
        let relative = "\(pendingMediaDirectoryName)/\(folder)"
        FileManager.default.removeItemLogging(atPath: absoluteMediaPath(forStored: relative),
                                              context: "pending comment media (déconnexion)")
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

    nonisolated static func removePendingCommentFiles(_ relativePaths: [String]) {
        for relativePath in relativePaths {
            FileManager.default.removeItemLogging(atPath: absoluteMediaPath(forStored: relativePath),
                                                  context: "pending comment media")
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
