package me.meeshy.app.feed

import me.meeshy.sdk.model.StatusEntry

/** Une réaction déjà posée sur l'humeur : son [emoji] et son [count]. */
data class MoodReactionChip(val emoji: String, val count: Int)

/**
 * Ce que la bulle d'humeur d'un ami montre et offre (iOS `StatusBubbleOverlay`, #13662) : l'humeur, son auteur,
 * les réactions déjà posées, et les trois gestes — réagir, republier, répondre. Pur : la vue n'invente rien.
 * Sur sa propre humeur la bulle n'offre aucun geste (iOS ne propose ni republier ni répondre à soi) ; le rail
 * ouvre alors le composeur d'humeur, jamais cette bulle.
 */
data class MoodBubbleModel(
    val statusId: String,
    val moodEmoji: String,
    val username: String,
    val content: String?,
    val viaUsername: String?,
    val reactions: List<MoodReactionChip>,
    val canReact: Boolean,
    val canRepublish: Boolean,
    val canReply: Boolean,
) {
    companion object {
        fun of(entry: StatusEntry, currentUserId: String?): MoodBubbleModel {
            val isOwn = currentUserId != null && entry.userId == currentUserId
            return MoodBubbleModel(
                statusId = entry.id,
                moodEmoji = entry.moodEmoji,
                username = entry.username,
                content = entry.content?.takeIf { it.isNotBlank() },
                viaUsername = entry.viaUsername?.takeIf { it.isNotBlank() },
                reactions = entry.reactionSummary.orEmpty()
                    .filter { it.value > 0 }
                    .map { MoodReactionChip(it.key, it.value) }
                    .sortedWith(compareByDescending<MoodReactionChip> { it.count }.thenBy { it.emoji }),
                canReact = !isOwn,
                canRepublish = !isOwn,
                canReply = !isOwn,
            )
        }
    }
}
