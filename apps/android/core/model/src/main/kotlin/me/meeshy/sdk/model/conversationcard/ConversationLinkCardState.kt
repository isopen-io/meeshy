package me.meeshy.sdk.model.conversationcard

import me.meeshy.sdk.model.deeplink.ConversationCardTarget

/**
 * L'état d'UNE carte de conversation dans une bulle — réduction pure de
 * iOS `ConversationLinkCardViewModel` (#8099, #13672).
 *
 * Cache d'abord : ce que le cache sert s'affiche aussitôt ([served]) ; [Phase.Loading] n'existe que
 * sur cache vide. Rejoindre n'est PAS optimiste (proposer de quitter un groupe dont l'entrée n'est
 * pas acquise serait un mensonge de l'interface) ; quitter l'est, et se rétablit sur un refus.
 */
data class ConversationLinkCardState(
    val phase: Phase = Phase.Loading,
    val pending: Pending = Pending.NONE,
    val error: CardError? = null,
    private val beforeLeave: ConversationCard? = null,
) {
    sealed interface Phase {
        data object Loading : Phase
        data class Card(val card: ConversationCard) : Phase
        data object PrivateConversation : Phase
        data object Unavailable : Phase
    }

    enum class Pending { NONE, JOINING, LEAVING }

    /** Le refus dit dans la carte même ; l'écran le traduit dans sa langue. */
    enum class CardError { LINK_NOT_FOUND, LINK_INACTIVE, FORBIDDEN, JOIN_FAILED, LEAVE_FAILED }

    private val card: ConversationCard? get() = (phase as? Phase.Card)?.card

    fun actions(target: ConversationCardTarget): ConversationCardActions =
        card?.let { ConversationCardActions.resolve(it, target) } ?: ConversationCardActions.None

    /**
     * Ce que le cache (ou la relecture) sert. Un « indisponible » est un repli, pas un contenu : périmé,
     * il ne se sert jamais, et il ne remplace jamais une carte déjà à l'écran. Une carte occupée
     * (jonction, départ) ignore ce qui arrive entre-temps : son geste en décidera.
     */
    fun served(resolution: ConversationCardResolution, isFresh: Boolean): ConversationLinkCardState {
        if (pending != Pending.NONE) return this
        return when (resolution) {
            is ConversationCardResolution.Card -> copy(phase = Phase.Card(resolution.card))
            ConversationCardResolution.PrivateConversation -> copy(phase = Phase.PrivateConversation)
            ConversationCardResolution.Unavailable ->
                if (!isFresh || phase is Phase.Card) this else copy(phase = Phase.Unavailable)
        }
    }

    /** Une relecture a échoué sans verdict : sur cache vide, la bulle retombe sur l'aperçu générique. */
    fun refreshFailed(): ConversationLinkCardState =
        if (phase == Phase.Loading) copy(phase = Phase.Unavailable) else this

    /** `null` quand la carte ne propose pas de rejoindre, ou qu'un geste est déjà en cours. */
    fun joinStarted(target: ConversationCardTarget): ConversationLinkCardState? {
        if (pending != Pending.NONE || actions(target) !is ConversationCardActions.Join) return null
        return copy(pending = Pending.JOINING, error = null)
    }

    fun joined(conversationId: String): ConversationLinkCardState {
        val joined = card?.withMembership(isMember = true, conversationId = conversationId) ?: return copy(pending = Pending.NONE)
        return copy(phase = Phase.Card(joined), pending = Pending.NONE, error = null)
    }

    fun joinFailed(httpStatus: Int?): ConversationLinkCardState {
        val reason = when (httpStatus) {
            404 -> CardError.LINK_NOT_FOUND
            410 -> CardError.LINK_INACTIVE
            403 -> CardError.FORBIDDEN
            else -> CardError.JOIN_FAILED
        }
        return copy(pending = Pending.NONE, error = reason)
    }

    /** `null` quand le lecteur n'est pas membre, ou qu'un geste est déjà en cours. */
    fun leaveStarted(target: ConversationCardTarget): ConversationLinkCardState? {
        val before = card ?: return null
        val leave = actions(target) as? ConversationCardActions.LeaveOrOpen ?: return null
        if (pending != Pending.NONE) return null
        val keptId = if (before.kind == ConversationCardKind.DIRECT) leave.conversationId else null
        val left = before.withMembership(isMember = false, conversationId = keptId)
        return copy(phase = Phase.Card(left), pending = Pending.LEAVING, error = null, beforeLeave = before)
    }

    /** Hors du groupe, un lien DIRECT ne montre plus rien : le serveur en décidera à la prochaine lecture. */
    fun left(): ConversationLinkCardState {
        val wasDirect = beforeLeave?.kind == ConversationCardKind.DIRECT
        return copy(
            phase = if (wasDirect) Phase.PrivateConversation else phase,
            pending = Pending.NONE,
            beforeLeave = null,
        )
    }

    fun leaveFailed(): ConversationLinkCardState = copy(
        phase = beforeLeave?.let { Phase.Card(it) } ?: phase,
        pending = Pending.NONE,
        error = CardError.LEAVE_FAILED,
        beforeLeave = null,
    )

    /** La carte désigne-t-elle cette conversation — par sa cible (lien direct) ou par l'id servi ? */
    fun designates(conversationId: String, target: ConversationCardTarget): Boolean =
        (target as? ConversationCardTarget.Direct)?.conversationId == conversationId ||
            card?.conversationId == conversationId
}
