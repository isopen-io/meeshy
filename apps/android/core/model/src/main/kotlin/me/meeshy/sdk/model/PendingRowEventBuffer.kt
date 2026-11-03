package me.meeshy.sdk.model

/** Une suppression arrivée avant son message. */
data class PendingTombstone(
    val deletedAtIso: String,
    val sparingOpenedViewOnce: Boolean = false,
    val expired: Boolean = false,
)

/** Une modification arrivée avant son message. [marksEdited] `false` : un avis complété sur place, `isEdited` reste tel quel. */
data class PendingEdit(
    val newContent: String,
    val editedAtIso: String?,
    val marksEdited: Boolean = true,
)

/** Une réaction (+1 / −1 sur [emoji]) arrivée avant son message. */
data class PendingReaction(val emoji: String, val delta: Int)

/**
 * Ce qui attend une ligne, dans l'ordre où cela se rejoue : la modification, les réactions, puis
 * la suppression, qui l'emporte.
 */
data class PendingRowEvents(
    val rememberedAtMillis: Long,
    val edit: PendingEdit? = null,
    val reactions: List<PendingReaction> = emptyList(),
    val tombstone: PendingTombstone? = null,
)

/**
 * Mémoire des événements arrivés avant leur message — miroir de `PendingRowEventBuffer` (iOS).
 *
 * Un `message:new` passe par le flux d'écriture ; `message:deleted`, `message:edited` et
 * `reaction:*` s'écrivent tout de suite : ils trouvaient la table sans la ligne, ne faisaient rien,
 * puis l'insertion posait le message intact (« supprimé pour tous », il restait lisible).
 *
 * Bornée en NOMBRE ([cap] : le plus ancien part) et en DURÉE ([lifetimeMillis]) : ceux d'un message
 * qu'on ne recevra jamais — hors de la fenêtre chargée — ne s'accumulent pas. Pure : elle ne
 * touche ni la base ni l'horloge (l'appelant passe `nowMillis`) et ne se synchronise pas elle-même.
 */
class PendingRowEventBuffer(
    private val cap: Int = CAP,
    private val lifetimeMillis: Long = LIFETIME_MILLIS,
    private val reactionCapPerRow: Int = REACTION_CAP_PER_ROW,
) {
    private val events = LinkedHashMap<String, PendingRowEvents>()

    val isEmpty: Boolean get() = events.isEmpty()
    val count: Int get() = events.size

    operator fun get(id: String): PendingRowEvents? = events[id]

    /** Mémorise, pour [id], le résultat de [update] appliqué à ce qui attend déjà (ou à une entrée neuve). */
    fun remember(id: String, nowMillis: Long, update: (PendingRowEvents) -> PendingRowEvents) {
        dropExpired(nowMillis)
        val current = events[id] ?: PendingRowEvents(rememberedAtMillis = nowMillis)
        val updated = update(current)
        val bounded = updated.copy(reactions = updated.reactions.takeLast(reactionCapPerRow))
        events[id] = bounded
        while (events.size > cap) events.remove(events.keys.first())
    }

    /** L'ordre d'insertion est celui des dates : les échus sont en tête. */
    fun dropExpired(nowMillis: Long) {
        val iterator = events.entries.iterator()
        while (iterator.hasNext()) {
            if (nowMillis - iterator.next().value.rememberedAtMillis <= lifetimeMillis) return
            iterator.remove()
        }
    }

    /** Retire et rend ce qui attendait [id] (un événement échu n'est jamais rendu). */
    fun take(id: String, nowMillis: Long): PendingRowEvents? {
        dropExpired(nowMillis)
        return events.remove(id)
    }

    fun clear() = events.clear()

    /** Garde la modification la plus récente : une plus ancienne n'écrase pas. */
    fun rememberEdit(id: String, nowMillis: Long, edit: PendingEdit) = remember(id, nowMillis) { current ->
        val kept = current.edit
        if (kept != null && !MessageEditOrdering.acceptsIso(kept.editedAtIso, edit.editedAtIso)) current
        else current.copy(edit = edit)
    }

    fun rememberReaction(id: String, nowMillis: Long, reaction: PendingReaction) =
        remember(id, nowMillis) { it.copy(reactions = it.reactions + reaction) }

    fun rememberTombstone(id: String, nowMillis: Long, tombstone: PendingTombstone) =
        remember(id, nowMillis) { it.copy(tombstone = tombstone) }

    companion object {
        const val CAP: Int = 512
        const val LIFETIME_MILLIS: Long = 300_000L
        const val REACTION_CAP_PER_ROW: Int = 32
    }
}

/** Le résumé des réactions décalé de [delta] sur [emoji] ; un compte nul ou négatif disparaît. */
object ReactionSummaryShift {
    fun shifted(summary: Map<String, Int>?, emoji: String, delta: Int): Map<String, Int>? {
        val next = (summary ?: emptyMap()) + (emoji to ((summary?.get(emoji) ?: 0) + delta))
        return next.filterValues { it > 0 }.ifEmpty { null }
    }
}

/** Une suppression, comme le serveur l'annonce : pierre tombale, ou enveloppe de vue unique ouverte épargnée. */
object MessageTombstoning {

    fun isViewOnce(message: ApiMessage): Boolean =
        message.isViewOnce == true || ((message.effectFlags?.toLong() ?: 0L) and MessageEffectFlags.VIEW_ONCE) != 0L

    /**
     * [sparingOpenedViewOnce] : une VUE UNIQUE ne devient pas « Message supprimé » mais « déjà
     * ouverte », contenu purgé — le serveur la détruit quand tous ses destinataires l'ont ouverte,
     * et ce n'est pas une suppression pour qui la voit passer. Une suppression explicite passe `false`.
     */
    fun delete(message: ApiMessage, deletedAtIso: String, sparingOpenedViewOnce: Boolean): ApiMessage {
        if (sparingOpenedViewOnce && isViewOnce(message)) {
            val purged = ConversationEventDeltas.viewOncePurged(message)
            return if (purged.consumedByMe == true) purged else purged.copy(consumedByMe = true)
        }
        return ConversationEventDeltas.deleted(message, deletedAtIso)
    }
}

/** Le résultat d'un rejeu : le message réécrit, ou `null` quand la ligne doit partir (mort par expiration). */
data class PendingRowReplay(val message: ApiMessage?)

/** Rejoue [PendingRowEvents] sur un message : modification, réactions, puis suppression, qui l'emporte. */
object PendingRowEventReplay {

    fun apply(message: ApiMessage, events: PendingRowEvents): PendingRowReplay {
        var next = events.edit?.let { applyEdit(message, it) } ?: message
        for (reaction in events.reactions) {
            val summary = ReactionSummaryShift.shifted(next.reactionSummary, reaction.emoji, reaction.delta)
            if (summary != next.reactionSummary) next = next.copy(reactionSummary = summary)
        }
        val tombstone = events.tombstone ?: return PendingRowReplay(next)
        if (tombstone.expired) return PendingRowReplay(null)
        return PendingRowReplay(MessageTombstoning.delete(next, tombstone.deletedAtIso, tombstone.sparingOpenedViewOnce))
    }

    /** Une modification sous la garde d'ordre ; un contenu changé retire les traductions du texte d'avant. */
    fun applyEdit(message: ApiMessage, edit: PendingEdit): ApiMessage {
        if (!MessageEditOrdering.acceptsIso(message.editedAt, edit.editedAtIso)) return message
        return message.copy(
            content = edit.newContent,
            isEdited = message.isEdited || edit.marksEdited,
            editedAt = edit.editedAtIso ?: message.editedAt,
            translations = if (message.content == edit.newContent) message.translations else emptyList(),
        )
    }
}
