import Foundation
import os
import GRDB

extension StoryDraftStore {
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
