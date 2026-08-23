import Foundation
import GRDB

public enum FeedDatabaseMigrations {

    public static func runAll(on db: any DatabaseWriter) throws {
        var migrator = DatabaseMigrator()
        registerAll(in: &migrator)
        try migrator.migrate(db)
    }

    public static func registerAll(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("feed_v1_posts") { db in
            try db.create(table: "feed_posts") { t in
                t.column("id", .text).primaryKey()
                t.column("authorId", .text).notNull()
                t.column("authorUsername", .text)
                t.column("authorDisplayName", .text)
                t.column("authorAvatarURL", .text)
                t.column("type", .text)
                t.column("content", .text)
                t.column("originalLanguage", .text)
                t.column("visibility", .text)
                t.column("likeCount", .integer).notNull().defaults(to: 0)
                t.column("commentCount", .integer).notNull().defaults(to: 0)
                t.column("repostCount", .integer).notNull().defaults(to: 0)
                t.column("viewCount", .integer).notNull().defaults(to: 0)
                t.column("bookmarkCount", .integer).notNull().defaults(to: 0)
                t.column("shareCount", .integer).notNull().defaults(to: 0)
                t.column("isLikedByMe", .boolean).notNull().defaults(to: false)
                t.column("isPinned", .boolean).notNull().defaults(to: false)
                t.column("isEdited", .boolean).notNull().defaults(to: false)
                t.column("isQuote", .boolean).notNull().defaults(to: false)
                t.column("moodEmoji", .text)
                t.column("audioUrl", .text)
                t.column("audioDuration", .integer)
                t.column("mediaJson", .blob)
                t.column("reactionSummaryJson", .blob)
                t.column("repostOfJson", .blob)
                t.column("mentionedUsersJson", .blob)
                t.column("translationsJson", .blob)
                t.column("createdAt", .datetime).notNull()
                t.column("updatedAt", .datetime)
                t.column("changeVersion", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_feed_posts_date", on: "feed_posts", columns: ["createdAt"])
        }

        migrator.registerMigration("feed_v1_comments") { db in
            try db.create(table: "feed_comments") { t in
                t.column("id", .text).primaryKey()
                t.column("postId", .text).notNull()
                t.column("parentId", .text)
                t.column("authorId", .text).notNull()
                t.column("authorUsername", .text)
                t.column("authorDisplayName", .text)
                t.column("authorAvatarURL", .text)
                t.column("content", .text).notNull()
                t.column("originalLanguage", .text)
                t.column("translatedContent", .text)
                t.column("likeCount", .integer).notNull().defaults(to: 0)
                t.column("replyCount", .integer).notNull().defaults(to: 0)
                t.column("effectFlags", .integer).notNull().defaults(to: 0)
                t.column("createdAt", .datetime).notNull()
                t.column("changeVersion", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_comments_post", on: "feed_comments", columns: ["postId", "createdAt"])
            try db.create(index: "idx_comments_parent", on: "feed_comments", columns: ["parentId"])
        }

        migrator.registerMigration("feed_v1_translations") { db in
            try db.create(table: "feed_translations") { t in
                t.column("id", .text).primaryKey()
                t.column("postId", .text).notNull().indexed()
                t.column("targetLanguage", .text).notNull()
                t.column("translatedContent", .text).notNull()
                t.column("receivedAt", .datetime).notNull()
            }
        }

        // Durable per-emoji reaction counts on comments (mirrors `feed_posts`).
        // Without this column the live `comment:reaction-*` socket events had no
        // persistent home, so the aggregate count reverted to the last REST
        // snapshot on a cold start. Nullable blob → existing rows decode to `nil`.
        migrator.registerMigration("feed_v2_comment_reactions") { db in
            try db.alter(table: "feed_comments") { t in
                t.add(column: "reactionSummaryJson", .blob)
            }
        }

        // Lieu partagé sur un post/commentaire de feed — même schéma que
        // `messages_location` (Task 15) : colonne texte nullable, les lignes
        // existantes décodent en `nil`.
        migrator.registerMigration("feed_location") { db in
            try db.alter(table: "feed_posts") { t in
                t.add(column: "locationJson", .text)
            }
            try db.alter(table: "feed_comments") { t in
                t.add(column: "locationJson", .text)
            }
        }

        // Média d'un commentaire (miroir de `feed_posts.mediaJson`). Sans cette
        // colonne, `comment:media-updated` — la transcription et les variantes
        // TTS d'un audio de commentaire — n'avait aucun foyer persistant : le
        // média revenait brut au prochain démarrage à froid. Blob nullable →
        // les lignes existantes décodent en `nil`.
        //
        // Enregistrée EN DERNIER, comme toute migration ajoutée depuis :
        // `DatabaseMigrator` compare la liste enregistrée au journal appliqué en
        // se calant sur le préfixe déjà joué. Insérer une migration AVANT une
        // migration déjà appliquée rejouerait cette dernière (« duplicate
        // column »).
        migrator.registerMigration("feed_v3_comment_media") { db in
            try db.alter(table: "feed_comments") { t in
                t.add(column: "mediaJson", .blob)
            }
        }

        // Liste nommée d'une audience EXCEPT/ONLY. La colonne `visibility`
        // existait déjà, mais seule elle ment : un post ONLY rouvert depuis le
        // cache affichait « aucune personne sélectionnée » alors qu'il en cible
        // plusieurs — et la loi produit 2026-08-23 veut cette audience
        // modifiable à tout moment, donc lisible hors ligne.
        //
        // Enregistrée EN DERNIER, comme le veut la note ci-dessus.
        migrator.registerMigration("feed_v4_post_audience") { db in
            try db.alter(table: "feed_posts") { t in
                t.add(column: "visibilityUserIdsJson", .text)
            }
        }
    }
}
