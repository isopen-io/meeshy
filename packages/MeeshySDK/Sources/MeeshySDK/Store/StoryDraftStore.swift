import Foundation
import GRDB

// MARK: - Story Draft Store (GRDB / SQLite)

/// Persistance locale des brouillons Story via SQLite (GRDB).
/// Remplace UserDefaults pour permettre le stockage de slides volumineux
/// et garantir l'intégrité transactionnelle.
public final class StoryDraftStore {
    public static let shared = StoryDraftStore()

    private let db: DatabaseQueue

    private init() {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let path = dir.appendingPathComponent("meeshy_story_draft.db").path
        do {
            db = try DatabaseQueue(path: path)
            try createSchema()
        } catch {
            fatalError("[StoryDraftStore] Impossible d'ouvrir la base SQLite: \(error)")
        }
    }

    private func createSchema() throws {
        try db.write { db in
            try db.create(table: "story_draft_slide", ifNotExists: true) { t in
                t.column("id", .text).primaryKey()
                t.column("order_index", .integer).notNull()
                t.column("content", .text)
                t.column("effects_json", .text).notNull()
                t.column("media_url", .text)
                t.column("duration", .double).notNull()
                t.column("updated_at", .double).notNull()
            }
            try db.create(table: "story_draft_meta", ifNotExists: true) { t in
                t.column("key", .text).primaryKey()
                t.column("value", .text).notNull()
            }
        }
    }

    // MARK: - Upsert

    public func save(slides: [StorySlide], visibility: String) {
        do {
            try db.write { db in
                try db.execute(sql: "DELETE FROM story_draft_slide")
                for (index, slide) in slides.enumerated() {
                    guard let effectsData = try? JSONEncoder().encode(slide.effects),
                          let effectsJSON = String(data: effectsData, encoding: .utf8) else { continue }
                    try db.execute(
                        sql: """
                        INSERT INTO story_draft_slide (id, order_index, content, effects_json, media_url, duration, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        arguments: [
                            slide.id,
                            index,
                            slide.content,
                            effectsJSON,
                            slide.mediaURL,
                            slide.duration,
                            Date().timeIntervalSince1970
                        ]
                    )
                }
                try db.execute(
                    sql: "INSERT OR REPLACE INTO story_draft_meta (key, value) VALUES ('visibility', ?)",
                    arguments: [visibility]
                )
            }
        } catch {
            print("[StoryDraftStore] Erreur save: \(error)")
        }
    }

    // MARK: - Load

    public func load() -> (slides: [StorySlide], visibility: String)? {
        do {
            let rows = try db.read { db in
                try Row.fetchAll(db, sql: "SELECT * FROM story_draft_slide ORDER BY order_index")
            }
            guard !rows.isEmpty else { return nil }

            let slides: [StorySlide] = rows.compactMap { row in
                let id: String = row["id"]
                let content: String? = row["content"]
                let mediaURL: String? = row["media_url"]
                let duration: TimeInterval = row["duration"] ?? 5
                let effectsJSONStr: String = row["effects_json"]
                guard let effectsData = effectsJSONStr.data(using: .utf8),
                      let effects = try? JSONDecoder().decode(StoryEffects.self, from: effectsData) else {
                    return StorySlide(id: id, content: content)
                }
                return StorySlide(id: id, mediaURL: mediaURL, content: content,
                                  effects: effects, duration: duration)
            }

            let visibility = try db.read { db in
                try String.fetchOne(db, sql: "SELECT value FROM story_draft_meta WHERE key = 'visibility'")
            } ?? "PUBLIC"

            return (slides: slides, visibility: visibility)
        } catch {
            print("[StoryDraftStore] Erreur load: \(error)")
            return nil
        }
    }

    // MARK: - Clear

    public func clear() {
        do {
            try db.write { db in
                try db.execute(sql: "DELETE FROM story_draft_slide")
                try db.execute(sql: "DELETE FROM story_draft_meta")
            }
        } catch {
            print("[StoryDraftStore] Erreur clear: \(error)")
        }
    }

    public func isEmpty() -> Bool {
        (try? db.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM story_draft_slide")
        } ?? 0) == 0
    }
}
