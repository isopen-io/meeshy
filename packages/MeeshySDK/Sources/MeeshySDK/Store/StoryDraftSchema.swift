import Foundation
import os
import GRDB

/// Schéma SQLite des brouillons Story et migration mono → multi-brouillon.
enum StoryDraftSchema {
    static func create(in db: DatabaseQueue, mediaRoot: URL) throws {
        try migrateLegacySingleDraftIfNeeded(db: db, mediaRoot: mediaRoot)
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
    private static func migrateLegacySingleDraftIfNeeded(db: DatabaseQueue, mediaRoot: URL) throws {
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
        relocateLegacyMediaFiles(into: legacyId, mediaRoot: mediaRoot)
    }

    /// Déplace les fichiers posés à plat sous la racine vers le
    /// sous-répertoire du brouillon migré. Sans ce déplacement, la base
    /// pointerait des noms de fichiers introuvables et le brouillon repris
    /// serait amputé de ses images.
    private static func relocateLegacyMediaFiles(into draftId: String, mediaRoot: URL) {
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
}
