package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Une ligne de réaction persistée avec le message (emoji, auteur, date) — miroir de `MeeshyReaction` (iOS).
 * [participantId] est la CLÉ d'auteur : `User.id` pour MA réaction, `Participant.id` pour celle d'un tiers,
 * `null` quand la reconstruction REST ne nomme pas son réacteur.
 */
@Serializable
data class ReactionRow(
    val id: String,
    val messageId: String,
    val participantId: String? = null,
    val emoji: String,
    val createdAt: String? = null,
)

/**
 * La loi PURE des réactions de message écrites dans `reactionRows` — miroir de `ReactionLedger.swift`
 * (iOS, #7927). Ma réaction (optimiste, reconstruction REST, écho de mon autre appareil) est keyée par
 * l'id de l'utilisateur courant — la clé que teste la pastille « c'est moi » ; l'écho d'un tiers l'est par son
 * `Participant.id` ; la reconstruction REST des autres n'en porte aucune. Le retrait d'un tiers se cale sur
 * l'agrégat servi et ne touche jamais MA ligne.
 */
object ReactionLedger {

    /** L'agrégat que le serveur sert APRÈS l'action. */
    data class Aggregate(val count: Int, val participantIds: List<String>?)

    /** La clé sous laquelle une réaction reçue s'écrit. */
    fun rowKey(participantId: String?, ownerUserId: String?, currentUserId: String?): String? =
        if (ownerUserId != null && currentUserId != null && ownerUserId == currentUserId) currentUserId else participantId

    /** `null` ⇒ rien à écrire. */
    @Suppress("LongParameterList")
    fun appending(
        rows: List<ReactionRow>,
        reactionId: String,
        messageId: String,
        emoji: String,
        participantId: String?,
        ownerUserId: String?,
        currentUserId: String?,
        maxCount: Int?,
        createdAt: String? = null,
    ): List<ReactionRow>? {
        val key = rowKey(participantId, ownerUserId, currentUserId)
        val alreadyThere = rows.any { row ->
            row.emoji == emoji &&
                (row.participantId == key ||
                    (participantId != null && row.participantId == participantId) ||
                    (ownerUserId != null && row.participantId == ownerUserId))
        }
        if (alreadyThere) return null
        if (maxCount != null && rows.count { it.emoji == emoji } >= maxCount) return null
        return rows + ReactionRow(reactionId, messageId, key, emoji, createdAt)
    }

    /** `null` ⇒ rien à écrire. */
    fun removing(
        rows: List<ReactionRow>,
        emoji: String,
        participantId: String?,
        ownerUserId: String?,
        currentUserId: String?,
        aggregate: Aggregate?,
    ): List<ReactionRow>? {
        val authorIsMe = ownerUserId != null && ownerUserId == currentUserId
        val isMine = { row: ReactionRow -> currentUserId != null && row.participantId == currentUserId }
        val matchesAuthor = { row: ReactionRow ->
            when {
                row.emoji != emoji -> false
                isMine(row) -> authorIsMe || (participantId != null && participantId == currentUserId)
                participantId != null && row.participantId == participantId -> true
                else -> ownerUserId != null && row.participantId == ownerUserId
            }
        }
        val withoutAuthor = rows.filterNot(matchesAuthor)
        val removedByAuthor = withoutAuthor.size != rows.size
        val result = when {
            aggregate != null -> calibrated(withoutAuthor, emoji, aggregate, isMine)
            removedByAuthor || authorIsMe -> withoutAuthor
            else -> withoutAuthor.indexOfLast { it.emoji == emoji && it.participantId == null }
                .let { index -> if (index < 0) withoutAuthor else withoutAuthor.filterIndexed { i, _ -> i != index } }
        }
        return if (result.map { it.id } == rows.map { it.id }) null else result
    }

    /**
     * Les lignes d'une reconstruction REST SANS auteur : [summary] (emoji → compte) donne le nombre de lignes,
     * [mine] marque les miennes (rangées sous [currentUserId]), les autres n'ont pas de clé.
     */
    fun rebuilt(
        messageId: String,
        summary: Map<String, Int>,
        mine: Set<String>,
        currentUserId: String?,
    ): List<ReactionRow> = summary.flatMap { (emoji, count) ->
        val mineHere = currentUserId != null && emoji in mine && count > 0
        List(count.coerceAtLeast(0)) { index ->
            val key = if (mineHere && index == 0) currentUserId else null
            ReactionRow(id = "rebuilt-$messageId-$emoji-$index", messageId = messageId, participantId = key, emoji = emoji)
        }
    }

    /**
     * Cale les lignes sur le résumé servi (la vérité qui sait compter) : un emoji absent du résumé n'a plus de
     * ligne, un emoji en excès perd d'abord ses lignes sans auteur, puis celles d'autrui — jamais la mienne.
     * `null` rend `null` si plus rien ne reste ; un résumé absent (canal allégé) ne change rien.
     */
    fun reconciled(rows: List<ReactionRow>?, summary: Map<String, Int>?, currentUserId: String?): List<ReactionRow>? {
        if (rows == null || summary == null) return rows
        val isMine = { row: ReactionRow -> currentUserId != null && row.participantId == currentUserId }
        val result = rows.map { it.emoji }.distinct().fold(rows) { acc, emoji ->
            calibrated(acc, emoji, Aggregate(summary[emoji] ?: 0, null), isMine)
        }
        return result.ifEmpty { null }
    }

    private fun calibrated(
        rows: List<ReactionRow>,
        emoji: String,
        aggregate: Aggregate,
        isMine: (ReactionRow) -> Boolean,
    ): List<ReactionRow> {
        val served = aggregate.participantIds?.toSet()
        val pruned = rows.filter { row ->
            val pid = row.participantId
            row.emoji != emoji || pid == null || isMine(row) || served == null || pid in served
        }
        val excess = pruned.count { it.emoji == emoji } - aggregate.count.coerceAtLeast(0)
        if (excess <= 0) return pruned
        val removable = pruned.indices.filter { pruned[it].emoji == emoji && !isMine(pruned[it]) }
        val unattributed = removable.filter { pruned[it].participantId == null }.reversed()
        val attributed = removable.filter { pruned[it].participantId != null }.reversed()
        val dropped = (unattributed + attributed).take(excess).toSet()
        return pruned.filterIndexed { index, _ -> index !in dropped }
    }
}
