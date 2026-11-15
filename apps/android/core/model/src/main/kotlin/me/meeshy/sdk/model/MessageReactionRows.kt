package me.meeshy.sdk.model

/**
 * La loi des réactions appliquée à UN message : les lignes ([ApiMessage.reactionRows]) se tiennent de pair avec
 * le résumé ([ApiMessage.reactionSummary]). Pure : l'identité de l'utilisateur courant est un paramètre.
 */
object MessageReactionRows {

    /** Les lignes du message, ou leur reconstruction REST sans auteur depuis le résumé quand aucune n'est gardée. */
    fun seeded(message: ApiMessage, currentUserId: String?): List<ReactionRow> =
        message.reactionRows ?: ReactionLedger.rebuilt(
            messageId = message.id,
            summary = message.reactionSummary.orEmpty(),
            mine = message.currentUserReactions.orEmpty().toSet(),
            currentUserId = currentUserId,
        )

    /**
     * MA réaction sur [emoji] est posée ([present]) ou reprise, sous [currentUserId]. Sans identité, rien n'est écrit
     * (une ligne sans clé ne se retirerait plus). Le résumé n'est pas touché : il a son propre décalage.
     */
    fun withOwn(message: ApiMessage, emoji: String, present: Boolean, currentUserId: String?): ApiMessage {
        if (currentUserId.isNullOrEmpty()) return message
        val rows = seeded(message, currentUserId)
        val next = if (present) {
            ReactionLedger.appending(
                rows, "own-${message.id}-$emoji", message.id, emoji,
                participantId = currentUserId, ownerUserId = currentUserId, currentUserId = currentUserId, maxCount = null,
            )
        } else {
            ReactionLedger.removing(rows, emoji, currentUserId, currentUserId, currentUserId, aggregate = null)
        }
        return if (next == null) message else message.copy(reactionRows = next)
    }

    /** Ce qu'un écho socket a changé : le message réécrit, et si les LIGNES ont bougé (faux ⇒ doublon ou borne). */
    data class Echo(val message: ApiMessage, val changed: Boolean)

    /**
     * L'écho `reaction:added` / `reaction:removed` : [participantId] est l'acteur côté participant, [ownerUserId] son
     * `User.id`. L'écho de ma propre réaction se range sous [currentUserId] et ne change rien s'il la retrouve
     * (jamais de +2) ; [aggregate] borne le nombre de lignes de l'emoji.
     */
    @Suppress("LongParameterList")
    fun echoed(
        message: ApiMessage,
        emoji: String,
        adding: Boolean,
        participantId: String?,
        ownerUserId: String?,
        currentUserId: String?,
        aggregate: ReactionLedger.Aggregate?,
    ): Echo {
        val rows = seeded(message, currentUserId)
        val next = if (adding) {
            ReactionLedger.appending(
                rows, "echo-${message.id}-$emoji-${participantId ?: ownerUserId}", message.id, emoji,
                participantId, ownerUserId, currentUserId, aggregate?.count,
            )
        } else {
            ReactionLedger.removing(rows, emoji, participantId, ownerUserId, currentUserId, aggregate)
        }
        if (next == null) return Echo(message, changed = false)
        return Echo(message.copy(reactionRows = next), changed = true)
    }
}
