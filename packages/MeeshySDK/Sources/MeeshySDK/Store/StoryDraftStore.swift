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

    public init(id: String, updatedAt: Date, slideCount: Int,
                title: String?, coverFileURL: URL?, backgroundHex: String?,
                thumbHash: String?) {
        self.id = id
        self.updatedAt = updatedAt
        self.slideCount = slideCount
        self.title = title
        self.coverFileURL = coverFileURL
        self.backgroundHex = backgroundHex
        self.thumbHash = thumbHash
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
    public func save(draftId: String, slides: [StorySlide], visibility: String) -> Bool {
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

    // MARK: - Load

    public func load(draftId: String) -> (slides: [StorySlide], visibility: String)? {
        do {
            let rows = try db.read { db in
                try Row.fetchAll(db,
                                 sql: "SELECT * FROM story_draft_slide WHERE draft_id = ? ORDER BY order_index",
                                 arguments: [draftId])
            }
            guard !rows.isEmpty else { return nil }

            let slides: [StorySlide] = rows.compactMap { row in
                let id: String = row["id"]
                let content: String? = row["content"]
                let mediaURL: String? = row["media_url"]
                let duration: TimeInterval = row["duration"] ?? 5
                let effectsJSONStr: String = row["effects_json"]
                guard let effectsData = effectsJSONStr.data(using: .utf8),
                      let effects = JSONDecoder().decodeOrLog(StoryEffects.self, from: effectsData,
                                                              field: "story slide effects",
                                                              id: id, logger: Logger.cache) else {
                    // Effets illisibles : les colonnes qui, elles, sont lisibles
                    // doivent survivre — les amputer perdait le média et la
                    // durée d'une slide seulement partiellement corrompue.
                    return StorySlide(id: id, mediaURL: mediaURL, content: content,
                                      duration: duration)
                }
                return StorySlide(id: id, mediaURL: mediaURL, content: content,
                                  effects: effects, duration: duration)
            }

            let visibility = try db.read { db in
                try String.fetchOne(db,
                                    sql: "SELECT value FROM story_draft_meta WHERE draft_id = ? AND key = 'visibility'",
                                    arguments: [draftId])
            } ?? "PUBLIC"

            return (slides: slides, visibility: visibility)
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
                        thumbHash: try firstSlideEffects(db, draftId: id)?.thumbHash)
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
        for json in blobs {
            guard let data = json.data(using: .utf8),
                  let effects = try? JSONDecoder().decode(StoryEffects.self, from: data) else { continue }
            return effects
        }
        return nil
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
