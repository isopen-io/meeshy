import Foundation
import os
import GRDB

/// Réécriture transactionnelle des lignes d'UN brouillon (slides + méta).
enum StoryDraftRows {
    static func write(_ db: Database,
                      draftId: String,
                      slides: [StorySlide],
                      visibility: String,
                      visibilityUserIds: [String],
                      originalLanguage: String?,
                      editingPostId: String?,
                      now: Double) throws {
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
}
