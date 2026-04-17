import Foundation
import GRDB
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Story Draft Store (GRDB / SQLite)

/// Persistance locale des brouillons Story via SQLite (GRDB).
/// Remplace UserDefaults pour permettre le stockage de slides volumineux
/// et garantir l'intégrité transactionnelle.
public final class StoryDraftStore: @unchecked Sendable {
    public static let shared = StoryDraftStore()

    private let db: DatabaseQueue
    private let mediaDir: URL

    private init() {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let path = dir.appendingPathComponent("meeshy_story_draft.db").path
        mediaDir = dir.appendingPathComponent("meeshy_draft_media")
        db = Self.makeQueue(path: path)
        try? createSchema()
    }

    init(dbPath: String, mediaDirectory: URL) {
        mediaDir = mediaDirectory
        db = Self.makeQueue(path: dbPath)
        try? createSchema()
    }

    /// Never-throwing queue builder. Falls back to an in-memory queue if the
    /// requested file cannot be opened — drafts are ephemeral in that case,
    /// but the app is not crashed. An OOM on in-memory creation would be
    /// handled by the OS anyway.
    private static func makeQueue(path: String) -> DatabaseQueue {
        if let disk = try? DatabaseQueue(path: path) {
            return disk
        }
        print("[StoryDraftStore] Disk queue unavailable at \(path), falling back to in-memory")
        return (try? DatabaseQueue()) ?? {
            // Last-resort path; `DatabaseQueue()` is trivially constructible.
            try! DatabaseQueue()  // swiftlint:disable:this force_try
        }()
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
            try db.create(table: "story_draft_media", ifNotExists: true) { t in
                t.column("element_id", .text).primaryKey()
                t.column("media_type", .text).notNull()
                t.column("file_name", .text).notNull()
            }
        }
    }

    // MARK: - Media Directory

    private func ensureMediaDir() {
        try? FileManager.default.createDirectory(at: mediaDir, withIntermediateDirectories: true)
    }

    private func clearMediaDir() {
        try? FileManager.default.removeItem(at: mediaDir)
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

    // MARK: - Save Media

    #if canImport(UIKit)
    public func saveMedia(
        images: [String: UIImage],
        videoURLs: [String: URL],
        audioURLs: [String: URL]
    ) {
        ensureMediaDir()
        let fm = FileManager.default

        do {
            try db.write { db in
                try db.execute(sql: "DELETE FROM story_draft_media")
            }
        } catch {
            print("[StoryDraftStore] Erreur clearing media table: \(error)")
            return
        }

        var entries: [(String, String, String)] = []

        for (id, image) in images {
            let fileName = "\(id).jpg"
            let dest = mediaDir.appendingPathComponent(fileName)
            if let data = image.jpegData(compressionQuality: 0.85) {
                try? data.write(to: dest)
                entries.append((id, "image", fileName))
            }
        }

        for (id, url) in videoURLs {
            let ext = url.pathExtension.isEmpty ? "mp4" : url.pathExtension
            let fileName = "\(id).\(ext)"
            let dest = mediaDir.appendingPathComponent(fileName)
            try? fm.removeItem(at: dest)
            try? fm.copyItem(at: url, to: dest)
            entries.append((id, "video", fileName))
        }

        for (id, url) in audioURLs {
            let ext = url.pathExtension.isEmpty ? "m4a" : url.pathExtension
            let fileName = "\(id).\(ext)"
            let dest = mediaDir.appendingPathComponent(fileName)
            try? fm.removeItem(at: dest)
            try? fm.copyItem(at: url, to: dest)
            entries.append((id, "audio", fileName))
        }

        do {
            try db.write { db in
                for (elementId, mediaType, fileName) in entries {
                    try db.execute(
                        sql: "INSERT OR REPLACE INTO story_draft_media (element_id, media_type, file_name) VALUES (?, ?, ?)",
                        arguments: [elementId, mediaType, fileName]
                    )
                }
            }
        } catch {
            print("[StoryDraftStore] Erreur saveMedia: \(error)")
        }
    }
    #endif

    // MARK: - Load Media

    #if canImport(UIKit)
    public func loadMedia() -> (images: [String: UIImage], videoURLs: [String: URL], audioURLs: [String: URL]) {
        var images: [String: UIImage] = [:]
        var videoURLs: [String: URL] = [:]
        var audioURLs: [String: URL] = [:]

        do {
            let rows = try db.read { db in
                try Row.fetchAll(db, sql: "SELECT * FROM story_draft_media")
            }
            for row in rows {
                let elementId: String = row["element_id"]
                let mediaType: String = row["media_type"]
                let fileName: String = row["file_name"]
                let fileURL = mediaDir.appendingPathComponent(fileName)

                guard FileManager.default.fileExists(atPath: fileURL.path) else { continue }

                switch mediaType {
                case "image":
                    if let data = try? Data(contentsOf: fileURL),
                       let image = UIImage(data: data) {
                        images[elementId] = image
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
            print("[StoryDraftStore] Erreur loadMedia: \(error)")
        }

        return (images, videoURLs, audioURLs)
    }
    #endif

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
        clearMediaDir()
        do {
            try db.write { db in
                try db.execute(sql: "DELETE FROM story_draft_slide")
                try db.execute(sql: "DELETE FROM story_draft_meta")
                try db.execute(sql: "DELETE FROM story_draft_media")
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
