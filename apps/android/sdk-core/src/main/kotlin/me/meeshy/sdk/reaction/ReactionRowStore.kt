package me.meeshy.sdk.reaction

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.conversation.CachedMessageUpdater
import me.meeshy.sdk.model.MessageReactionRows
import me.meeshy.sdk.model.ReactionLedger
import me.meeshy.sdk.model.ReactionRow
import me.meeshy.sdk.session.AccountFence

/**
 * Le registre des lignes de réaction persistées avec chaque message (qui a réagi, hors-ligne) — miroir de
 * `MessagePersistenceActor+Reactions` (iOS). Room reste la source unique : la ligne du message est relue,
 * réécrite par la loi pure ([MessageReactionRows]) et republiée à ses observateurs.
 */
@Singleton
class ReactionRowStore internal constructor(private val updater: CachedMessageUpdater) {

    @Inject
    constructor(database: MeeshyDatabase, messageDao: MessageDao, fence: AccountFence? = null) :
        this(CachedMessageUpdater(database, messageDao, fence))

    /** Les lignes gardées du message, `null` si le message ou ses lignes sont inconnus. */
    suspend fun rows(messageId: String): List<ReactionRow>? = updater.find(messageId)?.reactionRows

    /**
     * Range l'écho socket d'une réaction. Rend `true` quand les LIGNES ont bougé (faux : doublon, borne atteinte ou
     * message inconnu) — c'est ce qui dit à l'appelant si le compteur doit suivre, sans jamais compter deux fois.
     */
    @Suppress("LongParameterList")
    suspend fun record(
        messageId: String,
        emoji: String,
        adding: Boolean,
        participantId: String?,
        ownerUserId: String?,
        currentUserId: String?,
        aggregate: ReactionLedger.Aggregate?,
    ): Boolean {
        var changed = false
        updater.update(messageId, requireSynced = false) { message ->
            val echo = MessageReactionRows.echoed(message, emoji, adding, participantId, ownerUserId, currentUserId, aggregate)
            changed = echo.changed
            echo.message
        }
        return changed
    }

    /** Pose ou reprend MA réaction sous [ownerId] (retour arrière d'une réaction refusée pour de bon). */
    suspend fun setOwn(messageId: String, emoji: String, present: Boolean, ownerId: String?): Boolean =
        updater.update(messageId, requireSynced = false) { message ->
            MessageReactionRows.withOwn(message, emoji, present, ownerId)
        } != null
}
