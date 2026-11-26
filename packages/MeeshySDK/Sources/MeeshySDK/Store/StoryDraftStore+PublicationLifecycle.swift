import Foundation
import os
import GRDB

extension StoryDraftStore {
    static func metaValue(_ db: Database, draftId: String, key: String) throws -> String? {
        try String.fetchOne(
            db,
            sql: "SELECT value FROM story_draft_meta WHERE draft_id = ? AND key = ?",
            arguments: [draftId, key])
    }

    /// Ratios de canvas PAR SLIDE, indexés `canvasAspectRatio:<slideId>` (cf.
    /// `save()`/`load()`) — un composer peut porter jusqu'à dix slides à des
    /// ratios indépendants ; une seule clé par brouillon ne peut pas les
    /// représenter toutes.
    static func canvasAspectRatiosBySlide(_ db: Database, draftId: String) throws -> [String: Double] {
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

    static func dateFromMeta(_ raw: String?) -> Date? {
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
}
