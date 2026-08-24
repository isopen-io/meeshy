import Foundation
import os
import GRDB
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Story Draft Summary

/// Ce qu'il faut pour dresser la liste des brouillons sans en charger aucun :
/// la vue « Mes stories » n'a besoin ni des effets ni des médias pour rendre
/// une ligne.
public struct StoryDraftSummary: Identifiable, Sendable, Equatable {
    public let id: String
    public let updatedAt: Date
    public let slideCount: Int
    /// Premier texte non vide de la story, s'il y en a un — sinon la vue
    /// retombe sur un libellé dérivé du nombre de diapositives.
    public let title: String?
    /// Première image du brouillon encore présente sur disque, pour la vignette.
    /// Chemin LOCAL : à lire directement, pas à résoudre comme une URL distante.
    public let coverFileURL: URL?
    /// Fond de la première slide (hex ou `gradient:…`). Toujours présent, là où
    /// un brouillon n'a ni image ni `thumbHash` — celui-ci n'est composé qu'à
    /// la publication. C'est donc la seule chose que TOUT brouillon peut montrer.
    public let backgroundHex: String?
    /// Composite de toutes les couches, pose des le PREMIER enregistrement du
    /// brouillon par le composer — meme producteur qu'a la publication.
    public let thumbHash: String?
    /// Non-nil : une publication est EN COURS pour ce brouillon (gelé —
    /// exclu des reprises tant que la file/l'upload travaille). Levé au
    /// succès (le brouillon disparaît), à l'échec permanent (il redevient
    /// éditable, avec `lastPublishError`) ou à l'annulation.
    public let pendingPublishAt: Date?
    /// Dernier échec PERMANENT de publication : la story est revenue en
    /// brouillon pour amélioration, l'erreur reste affichable jusqu'à la
    /// prochaine tentative (`markPendingPublish` la supplante).
    public let lastPublishError: String?
    /// Non-nil : ce brouillon ÉDITE une story déjà publiée — la réouverture
    /// doit rouvrir le mode édition (`PUT /posts/:id`), jamais la création.
    public let editingPostId: String?

    public init(id: String, updatedAt: Date, slideCount: Int,
                title: String?, coverFileURL: URL?, backgroundHex: String?,
                thumbHash: String?,
                pendingPublishAt: Date? = nil,
                lastPublishError: String? = nil,
                editingPostId: String? = nil) {
        self.id = id
        self.updatedAt = updatedAt
        self.slideCount = slideCount
        self.title = title
        self.coverFileURL = coverFileURL
        self.backgroundHex = backgroundHex
        self.thumbHash = thumbHash
        self.pendingPublishAt = pendingPublishAt
        self.lastPublishError = lastPublishError
        self.editingPostId = editingPostId
    }
}

// MARK: - Story Draft Accessibility

/// Ce qu'un brouillon retient de la collecte d'accessibilité du composer : le
/// texte alternatif PAR MÉDIA et l'opt-in d'extraction de son.
///
/// Le transport portait déjà les deux jusqu'au gateway
/// (`CreatePostSchema.mediaAlt` / `.allowSoundExtraction`) ; le brouillon, lui,
/// ne les portait pas — refermer le composer perdait chaque texte saisi (F2).
///
/// Les deux champs se décodent par `decodeIfPresent` : un brouillon écrit avant
/// ce lot n'a pas la clé du tout, et doit continuer de se relire — un brouillon
/// perdu, c'est le travail de l'utilisateur perdu.
public struct StoryDraftAccessibility: Codable, Equatable, Sendable {

    /// Keyé par ID D'ÉLÉMENT DU COMPOSER, comme la collecte : la traduction
    /// vers les ids de `PostMedia` n'a lieu qu'après l'upload, à la publication
    /// (`StoryMediaAltMapping.serverKeyed`).
    public let mediaAlt: [String: String]

    /// `nil` tant que l'auteur n'a pas touché l'interrupteur — distinct d'un
    /// `false`, que le transport lit comme un refus posé.
    public let allowSoundExtraction: Bool?

    public static let empty = StoryDraftAccessibility()

    public var isEmpty: Bool { mediaAlt.isEmpty && allowSoundExtraction == nil }

    public init(mediaAlt: [String: String] = [:], allowSoundExtraction: Bool? = nil) {
        self.mediaAlt = mediaAlt
        self.allowSoundExtraction = allowSoundExtraction
    }

    private enum CodingKeys: String, CodingKey {
        case mediaAlt
        case allowSoundExtraction
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        mediaAlt = try container.decodeIfPresent([String: String].self, forKey: .mediaAlt) ?? [:]
        allowSoundExtraction = try container.decodeIfPresent(Bool.self, forKey: .allowSoundExtraction)
    }
}

// MARK: - Story Draft Store (GRDB / SQLite)

/// Persistance locale des brouillons Story via SQLite (GRDB).
/// Remplace UserDefaults pour permettre le stockage de slides volumineux
/// et garantir l'intégrité transactionnelle.
public final class StoryDraftStore: @unchecked Sendable {
    public static let shared = StoryDraftStore()

    /// Dernier échec de persistance rencontré par le store. Les écritures ne
    /// jettent pas (aucun appelant n'est en position de traiter une erreur
    /// SQLite au milieu d'un autosave) : sans ce témoin, un brouillon jamais
    /// écrit était indiscernable d'un brouillon écrit.
    public struct PersistFailure: Sendable, Equatable {
        /// Nom de l'opération : `save`, `saveMedia`, `delete`, `clear`,
        /// `open-database`, `create-schema`.
        public let operation: String
        public let message: String
        public let occurredAt: Date

        public init(operation: String, message: String, occurredAt: Date) {
            self.operation = operation
            self.message = message
            self.occurredAt = occurredAt
        }
    }

    private let db: DatabaseQueue
    /// RACINE des médias. Chaque brouillon a son sous-répertoire : deux
    /// brouillons peuvent porter le même `element_id` (duplication, reprise
    /// d'un échec de publication) et écraseraient sinon leurs fichiers.
    private let mediaRoot: URL

    private let failureLock = NSLock()
    private var storedFailure: PersistFailure?

    public var lastPersistFailure: PersistFailure? {
        failureLock.lock()
        defer { failureLock.unlock() }
        return storedFailure
    }

    /// À appeler une fois l'échec remonté à l'utilisateur.
    public func clearPersistFailure() {
        failureLock.lock()
        defer { failureLock.unlock() }
        storedFailure = nil
    }

    private func recordFailure(_ operation: String, message: String) {
        failureLock.lock()
        defer { failureLock.unlock() }
        storedFailure = PersistFailure(operation: operation, message: message, occurredAt: Date())
    }

    private init() {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let path = dir.appendingPathComponent("meeshy_story_draft.db").path
        mediaRoot = dir.appendingPathComponent("meeshy_draft_media")
        let opened = Self.makeQueue(path: path)
        db = opened.queue
        storedFailure = opened.failure
        createSchemaOrLog()
    }

    public init(dbPath: String, mediaDirectory: URL) {
        mediaRoot = mediaDirectory
        let opened = Self.makeQueue(path: dbPath)
        db = opened.queue
        storedFailure = opened.failure
        createSchemaOrLog()
    }

    /// Schema creation is best-effort at init (no throwing initializer), but a
    /// failure disables every draft read/write that follows — it must be visible.
    private func createSchemaOrLog() {
        do {
            try createSchema()
        } catch {
            Logger.cache.fault("[StoryDraftStore] Schema creation failed — drafts cannot be saved or restored: \(error.localizedDescription, privacy: .public)")
            recordFailure("create-schema", message: error.localizedDescription)
        }
    }

    /// Never-throwing queue builder. Falls back to an in-memory queue if the
    /// requested file cannot be opened — drafts are ephemeral in that case,
    /// but the app is not crashed. An OOM on in-memory creation would be
    /// handled by the OS anyway. Le repli est RENDU au constructeur : muet, il
    /// laissait croire à une persistance qui n'existait pas.
    private static func makeQueue(path: String) -> (queue: DatabaseQueue, failure: PersistFailure?) {
        do {
            return (try DatabaseQueue(path: path), nil)
        } catch {
            Logger.cache.warning("[StoryDraftStore] Disk queue unavailable at \(path), falling back to in-memory: \(error.localizedDescription, privacy: .public)")
            do {
                let failure = PersistFailure(operation: "open-database",
                                             message: error.localizedDescription,
                                             occurredAt: Date())
                return (try DatabaseQueue(), failure)
            } catch {
                fatalError("[StoryDraftStore] Cannot create in-memory GRDB queue — out of memory: \(error)")
            }
        }
    }

    private func createSchema() throws {
        try migrateLegacySingleDraftIfNeeded()
        try db.write { db in
            try db.create(table: "story_draft", ifNotExists: true) { t in
                t.column("id", .text).primaryKey()
                t.column("visibility", .text).notNull()
                t.column("created_at", .double).notNull()
                t.column("updated_at", .double).notNull()
            }
            try db.create(table: "story_draft_slide", ifNotExists: true) { t in
                t.column("draft_id", .text).notNull()
                t.column("id", .text).notNull()
                t.column("order_index", .integer).notNull()
                t.column("content", .text)
                t.column("effects_json", .text).notNull()
                t.column("media_url", .text)
                t.column("duration", .double).notNull()
                t.column("updated_at", .double).notNull()
                t.primaryKey(["draft_id", "id"])
            }
            try db.create(table: "story_draft_meta", ifNotExists: true) { t in
                t.column("draft_id", .text).notNull()
                t.column("key", .text).notNull()
                t.column("value", .text).notNull()
                t.primaryKey(["draft_id", "key"])
            }
            try db.create(table: "story_draft_media", ifNotExists: true) { t in
                t.column("draft_id", .text).notNull()
                t.column("element_id", .text).notNull()
                t.column("media_type", .text).notNull()
                t.column("file_name", .text).notNull()
                t.primaryKey(["draft_id", "element_id"])
            }
        }
    }

    /// Fait passer une base au schéma MONO vers le schéma partitionné, en
    /// préservant le brouillon en cours : le perdre à la mise à jour serait
    /// exactement le grief que le multi-brouillon vient traiter.
    ///
    /// SQLite ne sait pas changer une clé primaire par `ALTER TABLE` — et il
    /// FAUT la changer : deux brouillons peuvent légitimement partager un
    /// `id` de slide ou un `element_id`. D'où la reconstruction des trois
    /// tables. Idempotent : la présence de la colonne `draft_id` suffit à
    /// reconnaître une base déjà migrée.
    private func migrateLegacySingleDraftIfNeeded() throws {
        let legacyId = UUID().uuidString
        var migrated = false

        try db.write { db in
            guard try db.tableExists("story_draft_slide") else { return }
            let columns = try db.columns(in: "story_draft_slide")
            guard !columns.contains(where: { $0.name == "draft_id" }) else { return }
            migrated = true

            let visibility = try String.fetchOne(
                db, sql: "SELECT value FROM story_draft_meta WHERE key = 'visibility'") ?? "PUBLIC"
            let updatedAt = try Double.fetchOne(
                db, sql: "SELECT MAX(updated_at) FROM story_draft_slide")
                ?? Date().timeIntervalSince1970

            try db.execute(sql: """
                CREATE TABLE story_draft_slide_v2 (
                  draft_id TEXT NOT NULL, id TEXT NOT NULL, order_index INTEGER NOT NULL,
                  content TEXT, effects_json TEXT NOT NULL, media_url TEXT,
                  duration DOUBLE NOT NULL, updated_at DOUBLE NOT NULL,
                  PRIMARY KEY (draft_id, id))
                """)
            try db.execute(sql: """
                INSERT INTO story_draft_slide_v2
                SELECT ?, id, order_index, content, effects_json, media_url, duration, updated_at
                FROM story_draft_slide
                """, arguments: [legacyId])
            try db.execute(sql: "DROP TABLE story_draft_slide")
            try db.execute(sql: "ALTER TABLE story_draft_slide_v2 RENAME TO story_draft_slide")

            try db.execute(sql: """
                CREATE TABLE story_draft_meta_v2 (
                  draft_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
                  PRIMARY KEY (draft_id, key))
                """)
            try db.execute(sql: "INSERT INTO story_draft_meta_v2 SELECT ?, key, value FROM story_draft_meta",
                           arguments: [legacyId])
            try db.execute(sql: "DROP TABLE story_draft_meta")
            try db.execute(sql: "ALTER TABLE story_draft_meta_v2 RENAME TO story_draft_meta")

            try db.execute(sql: """
                CREATE TABLE story_draft_media_v2 (
                  draft_id TEXT NOT NULL, element_id TEXT NOT NULL,
                  media_type TEXT NOT NULL, file_name TEXT NOT NULL,
                  PRIMARY KEY (draft_id, element_id))
                """)
            try db.execute(sql: "INSERT INTO story_draft_media_v2 SELECT ?, element_id, media_type, file_name FROM story_draft_media",
                           arguments: [legacyId])
            try db.execute(sql: "DROP TABLE story_draft_media")
            try db.execute(sql: "ALTER TABLE story_draft_media_v2 RENAME TO story_draft_media")

            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS story_draft (
                  id TEXT PRIMARY KEY, visibility TEXT NOT NULL,
                  created_at DOUBLE NOT NULL, updated_at DOUBLE NOT NULL)
                """)
            let slideCount = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM story_draft_slide") ?? 0
            if slideCount > 0 {
                try db.execute(
                    sql: "INSERT OR REPLACE INTO story_draft (id, visibility, created_at, updated_at) VALUES (?, ?, ?, ?)",
                    arguments: [legacyId, visibility, updatedAt, updatedAt])
            }
        }

        guard migrated else { return }
        relocateLegacyMediaFiles(into: legacyId)
    }

    /// Déplace les fichiers posés à plat sous la racine vers le
    /// sous-répertoire du brouillon migré. Sans ce déplacement, la base
    /// pointerait des noms de fichiers introuvables et le brouillon repris
    /// serait amputé de ses images.
    private func relocateLegacyMediaFiles(into draftId: String) {
        let fm = FileManager.default
        guard let entries = try? fm.contentsOfDirectory(
            at: mediaRoot, includingPropertiesForKeys: [.isDirectoryKey]) else { return }
        let destination = mediaRoot.appendingPathComponent(draftId)
        do {
            try fm.createDirectory(at: destination, withIntermediateDirectories: true)
        } catch {
            Logger.cache.error("[StoryDraftStore] Migration media dir unavailable, legacy draft loses its media: \(error.localizedDescription, privacy: .public)")
            return
        }
        for entry in entries {
            let isDirectory = (try? entry.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false
            guard !isDirectory else { continue }
            do {
                try fm.moveItem(at: entry, to: destination.appendingPathComponent(entry.lastPathComponent))
            } catch {
                Logger.cache.error("[StoryDraftStore] Legacy media not relocated (\(entry.lastPathComponent, privacy: .public)): \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    // MARK: - Media Directory

    /// Répertoire des médias d'UN brouillon.
    private func mediaDir(for draftId: String) -> URL {
        mediaRoot.appendingPathComponent(draftId)
    }

    private func ensureMediaDir(for draftId: String) {
        do {
            try FileManager.default.createDirectory(at: mediaDir(for: draftId),
                                                    withIntermediateDirectories: true)
        } catch {
            // Les copies de médias qui suivent échoueront : le brouillon
            // perdra ses images.
            Logger.cache.error("[StoryDraftStore] Media directory unavailable, draft media will be lost: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func removeMediaDir(_ url: URL) {
        do {
            try FileManager.default.removeItem(at: url)
        } catch CocoaError.fileNoSuchFile {
            // Rien à nettoyer.
        } catch {
            Logger.cache.error("[StoryDraftStore] Media directory not cleared, files retained on disk: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Upsert

    @discardableResult
    public func save(draftId: String,
                     slides: [StorySlide],
                     visibility: String,
                     visibilityUserIds: [String] = [],
                     originalLanguage: String? = nil,
                     editingPostId: String? = nil) -> Bool {
        let now = Date().timeIntervalSince1970
        do {
            try db.write { db in
                try db.execute(sql: "DELETE FROM story_draft_slide WHERE draft_id = ?",
                               arguments: [draftId])
                for (index, slide) in slides.enumerated() {
                    guard let effectsData = JSONEncoder().encodeOrLog(slide.effects,
                                                                       field: "story slide effects",
                                                                       id: slide.id,
                                                                       logger: Logger.cache),
                          let effectsJSON = String(data: effectsData, encoding: .utf8) else { continue }
                    try db.execute(
                        sql: """
                        INSERT INTO story_draft_slide (draft_id, id, order_index, content, effects_json, media_url, duration, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        arguments: [
                            draftId,
                            slide.id,
                            index,
                            slide.content,
                            effectsJSON,
                            slide.mediaURL,
                            slide.duration,
                            now
                        ]
                    )
                }
                try db.execute(
                    sql: "INSERT OR REPLACE INTO story_draft_meta (draft_id, key, value) VALUES (?, 'visibility', ?)",
                    arguments: [draftId, visibility]
                )
                // Fidélité d'audience et de langue : une valeur absente EFFACE
                // la clé — un autosave qui revient à « tout le monde » ne doit
                // pas laisser traîner l'ancienne liste « Seulement… ».
                if visibilityUserIds.isEmpty {
                    try db.execute(
                        sql: "DELETE FROM story_draft_meta WHERE draft_id = ? AND key = 'visibilityUserIds'",
                        arguments: [draftId]
                    )
                } else if let idsData = JSONEncoder().encodeOrLog(visibilityUserIds,
                                                                  field: "story draft visibilityUserIds",
                                                                  id: draftId,
                                                                  logger: Logger.cache),
                          let idsJSON = String(data: idsData, encoding: .utf8) {
                    try db.execute(
                        sql: "INSERT OR REPLACE INTO story_draft_meta (draft_id, key, value) VALUES (?, 'visibilityUserIds', ?)",
                        arguments: [draftId, idsJSON]
                    )
                }
                if let originalLanguage {
                    try db.execute(
                        sql: "INSERT OR REPLACE INTO story_draft_meta (draft_id, key, value) VALUES (?, 'originalLanguage', ?)",
                        arguments: [draftId, originalLanguage]
                    )
                } else {
                    try db.execute(
                        sql: "DELETE FROM story_draft_meta WHERE draft_id = ? AND key = 'originalLanguage'",
                        arguments: [draftId]
                    )
                }
                // Lien vers la story publiée qu'une session d'ÉDITION modifie.
                // Même fidélité que l'audience et la langue : absent = effacé
                // (un brouillon redevenu création ne garde pas le lien). Les
                // marqueurs `pendingPublishAt`/`lastPublishError`, eux, ne
                // passent PAS par `save` — ils ont leurs écrivains dédiés et
                // survivent aux autosaves.
                if let editingPostId {
                    try db.execute(
                        sql: "INSERT OR REPLACE INTO story_draft_meta (draft_id, key, value) VALUES (?, 'editingPostId', ?)",
                        arguments: [draftId, editingPostId]
                    )
                } else {
                    try db.execute(
                        sql: "DELETE FROM story_draft_meta WHERE draft_id = ? AND key = 'editingPostId'",
                        arguments: [draftId]
                    )
                }
                // Empreinte de la carte de brouillon. Le canvas v3 — la forme
                // que `effects_json` persiste — n'a pas de logement pour le
                // `thumbHash` (métadonnée de slide, pas objet de scène) : sans
                // cette clé, la carte perdrait sa vignette dès le premier
                // enregistrement. Absent = effacé, comme les autres méta.
                if let thumbHash = slides.first?.effects.thumbHash {
                    try db.execute(
                        sql: "INSERT OR REPLACE INTO story_draft_meta (draft_id, key, value) VALUES (?, 'thumbHash', ?)",
                        arguments: [draftId, thumbHash]
                    )
                } else {
                    try db.execute(
                        sql: "DELETE FROM story_draft_meta WHERE draft_id = ? AND key = 'thumbHash'",
                        arguments: [draftId]
                    )
                }
                // Ratio de canvas — état PAR SLIDE (le composer en écrit un
                // par slide courante, `StoryComposerViewModel+Elements.swift`
                // :557/:656/:764, jusqu'à dix slides par brouillon). Le remap
                // v3 CONSOMME `canvasAspectRatio` pour repositionner les
                // ancres (le porteur garde son ratio intrinsèque, la scène
                // letterboxe) mais ne le LOGE nulle part : légitime pour le
                // fil, pas pour le brouillon local — sans une clé PAR SLIDE,
                // seule la première rouvrirait dans sa forme et toute slide
                // suivante rouvrirait en portrait dès le premier autosave.
                // Balayage puis réécriture : une slide retirée du brouillon
                // n'y laisse pas de méta orpheline.
                try db.execute(
                    sql: "DELETE FROM story_draft_meta WHERE draft_id = ? AND key LIKE 'canvasAspectRatio:%'",
                    arguments: [draftId]
                )
                for slide in slides {
                    guard let canvasAspectRatio = slide.effects.canvasAspectRatio else { continue }
                    try db.execute(
                        sql: "INSERT OR REPLACE INTO story_draft_meta (draft_id, key, value) VALUES (?, ?, ?)",
                        arguments: [draftId, "canvasAspectRatio:\(slide.id)", String(canvasAspectRatio)]
                    )
                }
                // `created_at` n'est posé qu'à la première écriture : le
                // `COALESCE` sur la ligne existante évite de rajeunir un
                // brouillon à chaque autosave.
                try db.execute(
                    sql: """
                    INSERT INTO story_draft (id, visibility, created_at, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET visibility = excluded.visibility,
                                                  updated_at = excluded.updated_at
                    """,
                    arguments: [draftId, visibility, now, now]
                )
            }
            return true
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur save: \(error.localizedDescription)")
            recordFailure("save", message: error.localizedDescription)
            return false
        }
    }

    // MARK: - Save Media

    #if canImport(UIKit)
    /// Écrit les fichiers D'ABORD, puis remplace les lignes en UNE seule
    /// transaction. Le DELETE et l'INSERT vivaient dans deux transactions
    /// séparées avec l'I/O fichier entre les deux : une mort du process
    /// pendant la copie laissait la table durablement vide — perte totale des
    /// médias du brouillon, que `checkForDraft` achevait en supprimant tout.
    @discardableResult
    public func saveMedia(
        draftId: String,
        images: [String: UIImage],
        videoURLs: [String: URL],
        audioURLs: [String: URL]
    ) -> Bool {
        ensureMediaDir(for: draftId)
        let dir = mediaDir(for: draftId)

        var entries: [(String, String, String)] = []

        for (id, image) in images {
            let fileName = "\(id).jpg"
            let dest = dir.appendingPathComponent(fileName)
            guard let data = image.jpegData(compressionQuality: 0.85) else { continue }
            do {
                try data.write(to: dest)
                entries.append((id, "image", fileName))
            } catch {
                Logger.cache.error("[StoryDraftStore] Écriture image échouée (\(fileName)): \(error.localizedDescription)")
            }
        }

        for (id, url) in videoURLs {
            let ext = url.pathExtension.isEmpty ? "mp4" : url.pathExtension
            let fileName = "\(id).\(ext)"
            let dest = dir.appendingPathComponent(fileName)
            if persistCopy(from: url, to: dest) {
                entries.append((id, "video", fileName))
            }
        }

        for (id, url) in audioURLs {
            let ext = url.pathExtension.isEmpty ? "m4a" : url.pathExtension
            let fileName = "\(id).\(ext)"
            let dest = dir.appendingPathComponent(fileName)
            if persistCopy(from: url, to: dest) {
                entries.append((id, "audio", fileName))
            }
        }

        do {
            try db.write { db in
                try db.execute(sql: "DELETE FROM story_draft_media WHERE draft_id = ?",
                               arguments: [draftId])
                for (elementId, mediaType, fileName) in entries {
                    try db.execute(
                        sql: "INSERT OR REPLACE INTO story_draft_media (draft_id, element_id, media_type, file_name) VALUES (?, ?, ?, ?)",
                        arguments: [draftId, elementId, mediaType, fileName]
                    )
                }
            }
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur saveMedia: \(error.localizedDescription)")
            recordFailure("saveMedia", message: error.localizedDescription)
            return false
        }

        reconcileMediaDirectory(draftId: draftId, keeping: Set(entries.map { $0.2 }))
        return true
    }

    /// Aligne le répertoire du brouillon sur les lignes qui viennent d'être
    /// écrites : un élément retiré de la composition laissait sinon son
    /// fichier s'accumuler jusqu'au `delete`.
    ///
    /// Ne balaye QUE le sous-répertoire de CE brouillon, et seulement après une
    /// transaction réussie — un balayage plus large est exactement ce qui a
    /// détruit des médias par le passé.
    private func reconcileMediaDirectory(draftId: String, keeping fileNames: Set<String>) {
        let dir = mediaDir(for: draftId)
        let fm = FileManager.default
        guard let existing = try? fm.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: [.isDirectoryKey]) else { return }
        for url in existing {
            let isDirectory = (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false
            guard !isDirectory, !fileNames.contains(url.lastPathComponent) else { continue }
            do {
                try fm.removeItem(at: url)
            } catch {
                Logger.cache.error("[StoryDraftStore] Média orphelin non supprimé (\(url.lastPathComponent, privacy: .public)): \(error.localizedDescription, privacy: .public)")
            }
        }
    }
    /// Copies `source` into the store at `dest`. Returns `true` when `dest`
    /// holds a valid file afterwards (only then may the caller register the
    /// DB row — a row without file becomes a « média perdu » at next resume).
    ///
    /// Après `restoreDraft()`, les URLs re-sauvées par l'autosave pointent
    /// DÉJÀ dans le media dir : supprimer `dest` avant copie détruisait la
    /// source (source == dest) et le média était perdu au resume suivant.
    private func persistCopy(from source: URL, to dest: URL) -> Bool {
        let fm = FileManager.default
        if source.standardizedFileURL.path == dest.standardizedFileURL.path {
            return fm.fileExists(atPath: dest.path)
        }
        guard fm.fileExists(atPath: source.path) else {
            return fm.fileExists(atPath: dest.path)
        }
        do {
            try fm.removeItem(at: dest)
        } catch CocoaError.fileNoSuchFile {
            // Destination libre — cas nominal.
        } catch {
            // La copie qui suit échouera très probablement.
            Logger.cache.error("[StoryDraftStore] Stale destination not removed before copy: \(error.localizedDescription, privacy: .public)")
        }
        do {
            try fm.copyItem(at: source, to: dest)
            return true
        } catch {
            Logger.cache.error("[StoryDraftStore] Copie média échouée (\(source.lastPathComponent)): \(error.localizedDescription)")
            return fm.fileExists(atPath: dest.path)
        }
    }
    #endif

    // MARK: - Load Media

    #if canImport(UIKit)
    /// Outcome of `loadMedia()`. `lostElementIds` lists element IDs that had a
    /// row in `story_draft_media` but whose underlying file disappeared from
    /// the FileManager (OS purge under storage pressure, manual deletion via
    /// the Files app, sandbox migration on app reinstall…). Callers should
    /// surface these explicitly to the user (e.g. "Media indisponible, retake")
    /// rather than silently dropping the slide.
    public struct LoadMediaResult: Sendable {
        public let images: [String: UIImage]
        public let videoURLs: [String: URL]
        public let audioURLs: [String: URL]
        public let lostElementIds: Set<String>

        public var isEmpty: Bool {
            images.isEmpty && videoURLs.isEmpty && audioURLs.isEmpty && lostElementIds.isEmpty
        }
    }

    public func loadMedia(draftId: String) -> LoadMediaResult {
        let dir = mediaDir(for: draftId)
        var images: [String: UIImage] = [:]
        var videoURLs: [String: URL] = [:]
        var audioURLs: [String: URL] = [:]
        var lost: Set<String> = []

        do {
            let rows = try db.read { db in
                try Row.fetchAll(db, sql: "SELECT * FROM story_draft_media WHERE draft_id = ?",
                                 arguments: [draftId])
            }
            for row in rows {
                let elementId: String = row["element_id"]
                let mediaType: String = row["media_type"]
                let fileName: String = row["file_name"]
                let fileURL = dir.appendingPathComponent(fileName)

                guard FileManager.default.fileExists(atPath: fileURL.path) else {
                    lost.insert(elementId)
                    continue
                }

                switch mediaType {
                case "image":
                    if let data = try? Data(contentsOf: fileURL),
                       let image = UIImage(data: data) {
                        images[elementId] = image
                    } else {
                        // File is on disk but unreadable — treat as lost too.
                        lost.insert(elementId)
                    }
                case "video":
                    videoURLs[elementId] = fileURL
                case "audio":
                    audioURLs[elementId] = fileURL
                default:
                    break
                }
            }
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur loadMedia: \(error.localizedDescription)")
        }

        return LoadMediaResult(
            images: images,
            videoURLs: videoURLs,
            audioURLs: audioURLs,
            lostElementIds: lost
        )
    }

    /// Returns absolute-path `StoryMediaReference`s for every row in
    /// `story_draft_media` whose backing file still exists on disk. Used by
    /// the offline-first publish path to build a `StoryPublishQueueItem`
    /// without re-encoding the media : the dictionaries passed to `saveMedia`
    /// are already on disk, this method just exposes them as the queue's
    /// transport type. Rows whose file has been purged by the OS or the
    /// user are silently filtered out (the caller can run `purgeLostMedia`
    /// to clean the table afterwards if desired).
    public func loadMediaReferences(draftId: String) -> [StoryMediaReference] {
        var refs: [StoryMediaReference] = []
        let dir = mediaDir(for: draftId)
        do {
            try db.read { db in
                let rows = try Row.fetchAll(db, sql:
                    "SELECT element_id, media_type, file_name FROM story_draft_media WHERE draft_id = ?",
                    arguments: [draftId])
                for row in rows {
                    let elementId: String = row["element_id"]
                    let mediaType: String = row["media_type"]
                    let fileName: String = row["file_name"]
                    let path = dir.appendingPathComponent(fileName).path
                    guard FileManager.default.fileExists(atPath: path) else { continue }
                    refs.append(StoryMediaReference(
                        elementId: elementId,
                        mediaType: mediaType,
                        localFilePath: path
                    ))
                }
            }
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur loadMediaReferences: \(error.localizedDescription)")
        }
        return refs
    }

    /// Removes the given element IDs from the `story_draft_media` table, used
    /// to purge orphans returned in `LoadMediaResult.lostElementIds` once the
    /// caller has informed the user. Idempotent.
    public func purgeLostMedia(_ elementIds: Set<String>, draftId: String) {
        guard !elementIds.isEmpty else { return }
        do {
            try db.write { db in
                for id in elementIds {
                    try db.execute(
                        sql: "DELETE FROM story_draft_media WHERE draft_id = ? AND element_id = ?",
                        arguments: [draftId, id]
                    )
                }
            }
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur purgeLostMedia: \(error.localizedDescription)")
        }
    }
    #endif

    // MARK: - Decoding (shared by the two `effects_json` read sites)

    /// Décodeur privé UNIQUE pour `effects_json`, partagé par `load` et
    /// `firstSlideEffects` — les deux seuls points de lecture. Un blob `"v":3`
    /// passe par le pont B2 (`CanvasV3` → `StoryEffects(rendering:sceneIndex:)`) ;
    /// tout le reste décode en legacy. Sans ce partage, migrer un seul des
    /// deux sites viderait l'autre en silence dès qu'une ligne devient v3.
    private func decodeSlideEffects(_ json: String) -> StoryEffects? {
        guard let data = json.data(using: .utf8) else { return nil }
        if let probe = try? JSONDecoder().decode(CanvasVersionProbe.self, from: data), probe.v == 3 {
            guard let document = try? JSONDecoder().decode(CanvasV3.self, from: data) else { return nil }
            return StoryEffects(rendering: document, sceneIndex: 0)
        }
        return try? JSONDecoder().decode(StoryEffects.self, from: data)
    }

    private func isAlreadyV3(_ json: String) -> Bool {
        guard let data = json.data(using: .utf8),
              let probe = try? JSONDecoder().decode(CanvasVersionProbe.self, from: data) else { return false }
        return probe.v == 3
    }

    private struct CanvasVersionProbe: Decodable {
        let v: Int?
    }

    // MARK: - Load

    public func load(draftId: String) -> (slides: [StorySlide],
                                          visibility: String,
                                          visibilityUserIds: [String],
                                          originalLanguage: String?,
                                          editingPostId: String?,
                                          pendingPublishAt: Date?,
                                          lastPublishError: String?)? {
        do {
            let rows = try db.read { db in
                try Row.fetchAll(db,
                                 sql: "SELECT * FROM story_draft_slide WHERE draft_id = ? ORDER BY order_index",
                                 arguments: [draftId])
            }
            guard !rows.isEmpty else { return nil }

            let decoded: [(slide: StorySlide, migratedJSON: String?)] = rows.map { row in
                let id: String = row["id"]
                let content: String? = row["content"]
                let mediaURL: String? = row["media_url"]
                let duration: TimeInterval = row["duration"] ?? 5
                let effectsJSONStr: String = row["effects_json"]
                guard let effects = decodeSlideEffects(effectsJSONStr) else {
                    // Effets illisibles : les colonnes qui, elles, sont lisibles
                    // doivent survivre — les amputer perdait le média et la
                    // durée d'une slide seulement partiellement corrompue.
                    // Échec de conversion = ligne laissée telle quelle,
                    // jamais de réécriture ni de perte.
                    return (StorySlide(id: id, mediaURL: mediaURL, content: content,
                                       duration: duration), nil)
                }
                let slide = StorySlide(id: id, mediaURL: mediaURL, content: content,
                                       effects: effects, duration: duration)
                guard !isAlreadyV3(effectsJSONStr),
                      let migratedData = JSONEncoder().encodeOrLog(CanvasV3(migrating: effects),
                                                                   field: "story slide effects (migration v3)",
                                                                   id: id, logger: Logger.cache),
                      let migratedJSON = String(data: migratedData, encoding: .utf8) else {
                    return (slide, nil)
                }
                return (slide, migratedJSON)
            }
            var slides = decoded.map(\.slide)

            // Migration one-shot : la persistance passe v3 au chargement — un
            // brouillon déjà v3 n'est jamais réécrit (isAlreadyV3 ci-dessus).
            let migrations = decoded.compactMap { entry -> (id: String, json: String)? in
                guard let json = entry.migratedJSON else { return nil }
                return (id: entry.slide.id, json: json)
            }
            if !migrations.isEmpty {
                try db.write { db in
                    for migration in migrations {
                        try db.execute(
                            sql: "UPDATE story_draft_slide SET effects_json = ? WHERE draft_id = ? AND id = ?",
                            arguments: [migration.json, draftId, migration.id])
                    }
                    // Le remap v3 absorbe `canvasAspectRatio` sans le loger nulle
                    // part (cf. `save()` ci-dessus) : capturé ICI, PAR SLIDE
                    // MIGRÉE, au moment même où la migration one-shot s'apprête
                    // à écraser la seule copie qui le porte encore — sans ça,
                    // rien ne le restituerait avant le prochain `save()`,
                    // potentiellement jamais pour un brouillon simplement
                    // rouvert puis refermé sans édition. Une slide n'ayant pas
                    // migré (déjà v3) n'a rien à capturer ici : sa méta, si
                    // elle existe, date d'un `save()` antérieur.
                    for entry in decoded where entry.migratedJSON != nil {
                        guard let ratio = entry.slide.effects.canvasAspectRatio else { continue }
                        try db.execute(
                            sql: "INSERT OR REPLACE INTO story_draft_meta (draft_id, key, value) VALUES (?, ?, ?)",
                            arguments: [draftId, "canvasAspectRatio:\(entry.slide.id)", String(ratio)])
                    }
                }
            }

            let meta = try db.read { db in
                let visibility = try Self.metaValue(db, draftId: draftId, key: "visibility") ?? "PUBLIC"
                let idsJSON = try Self.metaValue(db, draftId: draftId, key: "visibilityUserIds")
                let originalLanguage = try Self.metaValue(db, draftId: draftId, key: "originalLanguage")
                let editingPostId = try Self.metaValue(db, draftId: draftId, key: "editingPostId")
                let pendingPublishAt = try Self.metaValue(db, draftId: draftId, key: "pendingPublishAt")
                let lastPublishError = try Self.metaValue(db, draftId: draftId, key: "lastPublishError")
                let canvasAspectRatios = try Self.canvasAspectRatiosBySlide(db, draftId: draftId)
                return (visibility: visibility, idsJSON: idsJSON,
                        originalLanguage: originalLanguage, editingPostId: editingPostId,
                        pendingPublishAt: pendingPublishAt, lastPublishError: lastPublishError,
                        canvasAspectRatios: canvasAspectRatios)
            }
            let visibilityUserIds = meta.idsJSON
                .flatMap { $0.data(using: .utf8) }
                .flatMap { JSONDecoder().decodeOrLog([String].self, from: $0,
                                                     field: "story draft visibilityUserIds",
                                                     id: draftId, logger: Logger.cache) } ?? []

            // Restitution du ratio de canvas, PAR SLIDE : le canvas v3 ne le
            // loge pas (cf. écriture ci-dessus), toute slide décodée depuis un
            // document déjà v3 revient donc toujours à `nil` sans ce recours à
            // la méta — sans la boucle sur TOUTES les slides (et pas la seule
            // première), un composer 16:9 en deuxième slide ou au-delà
            // rouvrirait en portrait.
            for index in slides.indices {
                guard slides[index].effects.canvasAspectRatio == nil,
                      let ratio = meta.canvasAspectRatios[slides[index].id] else { continue }
                slides[index].effects.canvasAspectRatio = ratio
            }

            return (slides: slides,
                    visibility: meta.visibility,
                    visibilityUserIds: visibilityUserIds,
                    originalLanguage: meta.originalLanguage,
                    editingPostId: meta.editingPostId,
                    pendingPublishAt: Self.dateFromMeta(meta.pendingPublishAt),
                    lastPublishError: meta.lastPublishError)
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur load: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Clear

    // MARK: - Command history blob (E4 inc.2)

    /// E4 inc.2 — historique undo/redo du composer en blob OPAQUE : le store
    /// core ne peut pas dépendre de `CommandStackSnapshot` (MeeshyUI), il
    /// persiste des bytes. Rangé dans `story_draft_meta` (base64, colonne
    /// TEXT existante — zéro migration) → purgé avec le draft par `clear()`.
    public func saveCommandHistoryBlob(_ data: Data, draftId: String) {
        do {
            try db.write { db in
                try db.execute(
                    sql: "INSERT OR REPLACE INTO story_draft_meta (draft_id, key, value) VALUES (?, 'command_history', ?)",
                    arguments: [draftId, data.base64EncodedString()])
            }
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur saveCommandHistoryBlob: \(error.localizedDescription)")
        }
    }

    public func loadCommandHistoryBlob(draftId: String) -> Data? {
        let base64: String?
        do {
            base64 = try db.read { db in
                try String.fetchOne(db,
                                    sql: "SELECT value FROM story_draft_meta WHERE draft_id = ? AND key = 'command_history'",
                                    arguments: [draftId])
            }
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur loadCommandHistoryBlob: \(error.localizedDescription)")
            return nil
        }
        guard let base64 else { return nil }
        return Data(base64Encoded: base64)
    }

    // MARK: - Collecte d'accessibilité (F2)

    /// Écrit la collecte du composer dans la méta du brouillon (JSON, colonne
    /// TEXT existante — zéro migration), donc purgée avec lui par `delete()` et
    /// `clear()`.
    ///
    /// Une collecte VIDE efface la clé, même fidélité que l'audience et la
    /// langue : effacer son dernier texte alternatif ne doit pas laisser
    /// l'ancienne valeur ressusciter à la reprise suivante. Un échec
    /// d'encodage, lui, laisse en place ce qui était écrit — remplacer par
    /// rien perdrait des textes déjà saisis.
    @discardableResult
    public func saveAccessibility(_ accessibility: StoryDraftAccessibility, draftId: String) -> Bool {
        guard !accessibility.isEmpty else { return writeAccessibilityJSON(nil, draftId: draftId) }
        guard let data = JSONEncoder().encodeOrLog(accessibility,
                                                   field: "story draft accessibility",
                                                   id: draftId, logger: Logger.cache),
              let json = String(data: data, encoding: .utf8) else {
            recordFailure("save-accessibility", message: "encoding failed")
            return false
        }
        return writeAccessibilityJSON(json, draftId: draftId)
    }

    private func writeAccessibilityJSON(_ json: String?, draftId: String) -> Bool {
        do {
            try db.write { db in
                guard let json else {
                    try db.execute(
                        sql: "DELETE FROM story_draft_meta WHERE draft_id = ? AND key = 'accessibility'",
                        arguments: [draftId])
                    return
                }
                try db.execute(
                    sql: "INSERT OR REPLACE INTO story_draft_meta (draft_id, key, value) VALUES (?, 'accessibility', ?)",
                    arguments: [draftId, json])
            }
            return true
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur saveAccessibility: \(error.localizedDescription)")
            recordFailure("save-accessibility", message: error.localizedDescription)
            return false
        }
    }

    /// Toujours une valeur, jamais `nil` : un brouillon d'avant ce champ rend
    /// `.empty`, comme un brouillon dont l'auteur n'a rien saisi. L'appelant
    /// repose l'état sans avoir à distinguer « rien saisi » de « rien
    /// persisté » — les deux méritent la même collecte vide.
    public func loadAccessibility(draftId: String) -> StoryDraftAccessibility {
        let json: String?
        do {
            json = try db.read { db in
                try Self.metaValue(db, draftId: draftId, key: "accessibility")
            }
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur loadAccessibility: \(error.localizedDescription)")
            return .empty
        }
        guard let data = json.flatMap({ $0.data(using: .utf8) }) else { return .empty }
        return JSONDecoder().decodeOrLog(StoryDraftAccessibility.self, from: data,
                                         field: "story draft accessibility",
                                         id: draftId, logger: Logger.cache) ?? .empty
    }

    /// Efface TOUS les brouillons — déconnexion uniquement.
    ///
    /// Les lignes partent AVANT les fichiers : détruire les médias d'abord
    /// laissait, sur échec SQLite, des brouillons listables mais amputés.
    @discardableResult
    public func clear() -> Bool {
        do {
            try db.write { db in
                try db.execute(sql: "DELETE FROM story_draft_slide")
                try db.execute(sql: "DELETE FROM story_draft_meta")
                try db.execute(sql: "DELETE FROM story_draft_media")
                try db.execute(sql: "DELETE FROM story_draft")
            }
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur clear: \(error.localizedDescription)")
            recordFailure("clear", message: error.localizedDescription)
            return false
        }
        removeMediaDir(mediaRoot)
        return true
    }

    /// Efface UN brouillon et son sous-répertoire de médias. Idempotent.
    @discardableResult
    public func delete(draftId: String) -> Bool {
        do {
            try db.write { db in
                for table in ["story_draft_slide", "story_draft_meta", "story_draft_media"] {
                    try db.execute(sql: "DELETE FROM \(table) WHERE draft_id = ?", arguments: [draftId])
                }
                try db.execute(sql: "DELETE FROM story_draft WHERE id = ?", arguments: [draftId])
            }
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur delete: \(error.localizedDescription)")
            recordFailure("delete", message: error.localizedDescription)
            return false
        }
        removeMediaDir(mediaDir(for: draftId))
        return true
    }

    // MARK: - Cycle de vie de publication (2026-08-02)

    private static func metaValue(_ db: Database, draftId: String, key: String) throws -> String? {
        try String.fetchOne(
            db,
            sql: "SELECT value FROM story_draft_meta WHERE draft_id = ? AND key = ?",
            arguments: [draftId, key])
    }

    /// Ratios de canvas PAR SLIDE, indexés `canvasAspectRatio:<slideId>` (cf.
    /// `save()`/`load()`) — un composer peut porter jusqu'à dix slides à des
    /// ratios indépendants ; une seule clé par brouillon ne peut pas les
    /// représenter toutes.
    private static func canvasAspectRatiosBySlide(_ db: Database, draftId: String) throws -> [String: Double] {
        let rows = try Row.fetchAll(
            db,
            sql: "SELECT key, value FROM story_draft_meta WHERE draft_id = ? AND key LIKE 'canvasAspectRatio:%'",
            arguments: [draftId])
        return rows.reduce(into: [String: Double]()) { result, row in
            let key: String = row["key"]
            let value: String = row["value"]
            guard let slideId = key.split(separator: ":", maxSplits: 1).last.map(String.init),
                  let ratio = Double(value) else { return }
            result[slideId] = ratio
        }
    }

    private static func dateFromMeta(_ raw: String?) -> Date? {
        raw.flatMap(Double.init).map(Date.init(timeIntervalSince1970:))
    }

    /// Gèle le brouillon : une publication vient de partir pour lui. La
    /// nouvelle tentative SUPPLANTE l'erreur précédente — l'utilisateur vient
    /// de republier, l'ancien échec est caduc.
    @discardableResult
    public func markPendingPublish(draftId: String, at date: Date = Date()) -> Bool {
        do {
            try db.write { db in
                try db.execute(
                    sql: "INSERT OR REPLACE INTO story_draft_meta (draft_id, key, value) VALUES (?, 'pendingPublishAt', ?)",
                    arguments: [draftId, String(date.timeIntervalSince1970)])
                try db.execute(
                    sql: "DELETE FROM story_draft_meta WHERE draft_id = ? AND key = 'lastPublishError'",
                    arguments: [draftId])
            }
            return true
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur markPendingPublish: \(error.localizedDescription)")
            recordFailure("mark-pending-publish", message: error.localizedDescription)
            return false
        }
    }

    /// Échec PERMANENT : la story revient en brouillon pour amélioration,
    /// avec son erreur affichable. Lève le gel de publication.
    @discardableResult
    public func recordPublishFailure(draftId: String, message: String) -> Bool {
        do {
            try db.write { db in
                try db.execute(
                    sql: "DELETE FROM story_draft_meta WHERE draft_id = ? AND key = 'pendingPublishAt'",
                    arguments: [draftId])
                try db.execute(
                    sql: "INSERT OR REPLACE INTO story_draft_meta (draft_id, key, value) VALUES (?, 'lastPublishError', ?)",
                    arguments: [draftId, message])
            }
            return true
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur recordPublishFailure: \(error.localizedDescription)")
            recordFailure("record-publish-failure", message: error.localizedDescription)
            return false
        }
    }

    /// Lève le gel SANS poser d'erreur — annulation utilisateur, ou
    /// réconciliation d'un marqueur orphelin (crash entre le succès de la
    /// file et la suppression du brouillon).
    @discardableResult
    public func clearPendingPublish(draftId: String) -> Bool {
        do {
            try db.write { db in
                try db.execute(
                    sql: "DELETE FROM story_draft_meta WHERE draft_id = ? AND key = 'pendingPublishAt'",
                    arguments: [draftId])
            }
            return true
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur clearPendingPublish: \(error.localizedDescription)")
            recordFailure("clear-pending-publish", message: error.localizedDescription)
            return false
        }
    }

    /// Accès LÉGER au lien d'édition d'un brouillon (routage de réouverture) :
    /// une seule ligne de meta, jamais les slides.
    public func draftEditingPostId(_ draftId: String) -> String? {
        do {
            return try db.read { db in
                try Self.metaValue(db, draftId: draftId, key: "editingPostId")
            }
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur draftEditingPostId: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Inventaire

    /// Tous les brouillons, du plus récemment modifié au plus ancien.
    ///
    /// Ne charge NI les effets NI les médias : dresser la liste ne doit pas
    /// coûter le décodage de chaque story. Seule la vignette touche le disque,
    /// et seulement pour vérifier que le fichier est encore là.
    public func listDrafts() -> [StoryDraftSummary] {
        do {
            return try db.read { db in
                let rows = try Row.fetchAll(db, sql: """
                    SELECT d.id AS id, d.updated_at AS updated_at,
                           (SELECT COUNT(*) FROM story_draft_slide s WHERE s.draft_id = d.id) AS slide_count
                    FROM story_draft d
                    ORDER BY d.updated_at DESC
                    """)
                return try rows.compactMap { row in
                    let id: String = row["id"]
                    let slideCount: Int = row["slide_count"] ?? 0
                    guard slideCount > 0 else { return nil }
                    return StoryDraftSummary(
                        id: id,
                        updatedAt: Date(timeIntervalSince1970: row["updated_at"] ?? 0),
                        slideCount: slideCount,
                        title: try firstSlideEffects(db, draftId: id)?.textObjects
                            .map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }
                            .first(where: { !$0.isEmpty }),
                        coverFileURL: try coverFileURL(db, draftId: id),
                        backgroundHex: try firstSlideEffects(db, draftId: id)?.background,
                        thumbHash: try Self.metaValue(db, draftId: id, key: "thumbHash")
                            ?? firstSlideEffects(db, draftId: id)?.thumbHash,
                        pendingPublishAt: Self.dateFromMeta(
                            try Self.metaValue(db, draftId: id, key: "pendingPublishAt")),
                        lastPublishError: try Self.metaValue(db, draftId: id, key: "lastPublishError"),
                        editingPostId: try Self.metaValue(db, draftId: id, key: "editingPostId"))
                }
            }
        } catch {
            Logger.cache.error("[StoryDraftStore] Erreur listDrafts: \(error.localizedDescription)")
            return []
        }
    }

    /// Effets de la première diapositive décodable — porte à la fois le titre
    /// et le fond, d'où un seul décodage pour les deux.
    private func firstSlideEffects(_ db: Database, draftId: String) throws -> StoryEffects? {
        let blobs = try String.fetchAll(
            db,
            sql: "SELECT effects_json FROM story_draft_slide WHERE draft_id = ? ORDER BY order_index",
            arguments: [draftId])
        return blobs.compactMap(decodeSlideEffects).first
    }

    /// Vignette du brouillon : la première image DANS L'ORDRE DES SLIDES dont
    /// le fichier existe encore.
    ///
    /// Un `LIMIT 1` sans `ORDER BY` élisait une ligne arbitraire — la carte
    /// changeait d'image d'une ouverture à l'autre, et n'en montrait aucune
    /// quand LE fichier élu manquait alors qu'une autre image était là. Les
    /// éléments qui ne correspondent à aucune slide (médias posés dans une
    /// slide) passent après, départagés par `element_id` pour rester stables.
    private func coverFileURL(_ db: Database, draftId: String) throws -> URL? {
        let fileNames = try String.fetchAll(
            db,
            sql: """
            SELECT m.file_name
            FROM story_draft_media m
            LEFT JOIN story_draft_slide s ON s.draft_id = m.draft_id AND s.id = m.element_id
            WHERE m.draft_id = ? AND m.media_type = 'image'
            ORDER BY (s.order_index IS NULL), s.order_index, m.element_id
            """,
            arguments: [draftId])
        let dir = mediaDir(for: draftId)
        return fileNames
            .lazy
            .map { dir.appendingPathComponent($0) }
            .first { FileManager.default.fileExists(atPath: $0.path) }
    }

    /// `true` quand AUCUN brouillon n'existe.
    public func isEmpty() -> Bool {
        do {
            let count = try db.read { db in
                try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM story_draft_slide")
            }
            return (count ?? 0) == 0
        } catch {
            // Signale « pas de brouillon » : l'utilisateur ne se verra pas
            // proposer une reprise alors qu'un brouillon existe peut-être.
            Logger.cache.error("[StoryDraftStore] Draft count read failed, reporting empty: \(error.localizedDescription, privacy: .public)")
            return true
        }
    }
}
