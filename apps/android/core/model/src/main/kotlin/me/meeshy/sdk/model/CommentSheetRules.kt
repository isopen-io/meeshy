package me.meeshy.sdk.model

import me.meeshy.sdk.lang.PrismTranslationResolver

/**
 * Les règles PURES de la feuille de commentaires — iso `CommentSheetRules` iOS. Elles ne lisent que leurs entrées :
 * le moteur et les écrans y délèguent, aucune ne réécrit la boucle.
 */
object CommentSheetRules {
    /** Ce que le fil embarque avec un post : au-delà, la charge complète doit être lue. */
    const val EMBEDDED_COMMENTS: Int = 3

    /** Le plafond d'un fil gardé sur le disque. */
    const val PERSISTED_CAP: Int = 500

    /** Une ligne optimiste (`tmp_` / `cmid_`) n'existe pas côté serveur : elle ne survit jamais à la session. */
    fun isOptimistic(id: String): Boolean = id.startsWith("tmp_") || id.startsWith("cmid_")

    /** Ce qui peut être écrit sur le disque : jamais une ligne optimiste non confirmée, jamais plus de [PERSISTED_CAP]. */
    fun persistable(comments: List<ApiPostComment>): List<ApiPostComment> =
        comments.filterNot { isOptimistic(it.id) }.take(PERSISTED_CAP)

    /**
     * Pose une page fraîchement lue sur la liste en mémoire SANS perdre les lignes que le serveur ne pouvait pas
     * connaître : un envoi optimiste non confirmé, ou un écho `comment:added` arrivé pendant le GET. [fetched]
     * (ordre serveur, plus récent d'abord) est la base ; toute ligne de [current] absente de [fetched] reste EN TÊTE.
     */
    fun mergeFetched(current: List<ApiPostComment>, fetched: List<ApiPostComment>): List<ApiPostComment> {
        val fetchedIds = fetched.mapTo(HashSet()) { it.id }
        return current.filter { it.id !in fetchedIds } + fetched
    }

    /** Le post n'a embarqué qu'une partie de ses commentaires : la première page complète doit être chargée. */
    fun needsFullLoad(embeddedCount: Int, serverTotal: Int?): Boolean =
        serverTotal != null && serverTotal > embeddedCount && embeddedCount <= EMBEDDED_COMMENTS

    /**
     * Une traduction poussée se pose seulement si sa langue est celle que le Prisme du lecteur élit : la langue
     * d'origine concourt à son rang, donc une origine déjà plus prioritaire (ou aussi prioritaire) garde l'original.
     */
    fun shouldApplyTranslation(language: String, originalLanguage: String?, readerLanguages: List<String>): Boolean {
        val elected = PrismTranslationResolver.resolve(
            originalLanguage = originalLanguage,
            translations = mapOf(language to PLACEHOLDER),
            preferredLanguages = readerLanguages,
        )
        return elected != null
    }

    private const val PLACEHOLDER = "·"
}

/** L'agrégat ABSOLU d'un emoji sur un commentaire, appliqué à la ligne — jamais un drapeau relatif à l'acteur. */
object CommentReactionLaw {
    /**
     * Applique [aggregation] à [comment] : le résumé prend le compte absolu (retiré à zéro), `likeCount` suit pour le
     * cœur [heart], et le cœur du lecteur se DÉRIVE de la liste des `userIds` (si elle est servie), jamais de l'acteur.
     */
    fun applying(comment: ApiPostComment, aggregation: SocketCommentReactionAggregation, viewerId: String?, heart: String): ApiPostComment {
        val emoji = aggregation.emoji.takeIf { it.isNotBlank() } ?: return comment
        val summary = comment.reactionSummary.orEmpty().let { if (aggregation.count <= 0) it - emoji else it + (emoji to aggregation.count) }
        val mine = comment.currentUserReactions.orEmpty().let { held ->
            when {
                viewerId == null -> held
                aggregation.userIds.isNotEmpty() -> if (viewerId in aggregation.userIds) (held + emoji).distinct() else held - emoji
                aggregation.count <= 0 -> held - emoji
                else -> held
            }
        }
        return comment.copy(
            reactionSummary = summary,
            currentUserReactions = mine,
            likeCount = if (emoji == heart) aggregation.count.coerceAtLeast(0) else comment.likeCount,
        )
    }

    /** Le cœur du lecteur d'après l'agrégat : `null` quand l'agrégat ne permet pas de le dire. */
    fun viewerHeart(aggregation: SocketCommentReactionAggregation, viewerId: String?): Boolean? = when {
        viewerId == null -> null
        aggregation.userIds.isNotEmpty() -> viewerId in aggregation.userIds
        aggregation.count <= 0 -> false
        else -> null
    }
}
