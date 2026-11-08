package me.meeshy.sdk.model

/** Ce que devient un `notification:new` reçu en direct (miroir de `handleNewNotification`, iOS). */
public sealed interface NotificationArrival {
    /** La même livraison (APN + socket) vient d'être traitée : rien à refaire. */
    public data object Duplicate : NotificationArrival

    /** Le contenu visé est déjà à l'écran : la notification naît LUE, sans toucher au compteur. */
    public data object ConsumedOnArrival : NotificationArrival

    /** Nominal : persistée non lue, comptée, publiée. Les préférences ne décident jamais ici. */
    public data object Unread : NotificationArrival
}

/**
 * Loi d'arrivée d'une notification temps réel, pure et immuable : dédoublonnage sur 2 s ([ToastDedupWindow]) puis
 * décision « née lue » selon la conversation ouverte. Les interrupteurs de bannière ne l'atteignent pas : ils ne
 * gouvernent que la bannière, et le compteur reflète ce que le serveur pense, push coupé ou non.
 */
public class NotificationArrivalPolicy private constructor(private val window: ToastDedupWindow) {

    public data class Outcome(val policy: NotificationArrivalPolicy, val arrival: NotificationArrival)

    public fun admit(
        notification: ApiNotification,
        openConversationIds: Set<String>,
        nowMillis: Long,
    ): Outcome {
        val admitted = window.admit(notification.id, nowMillis)
        val next = NotificationArrivalPolicy(admitted.window)
        val arrival = when {
            admitted.isDuplicate -> NotificationArrival.Duplicate
            ActiveContextMatch.matchesOpenConversation(notification.context?.conversationId, openConversationIds) ->
                NotificationArrival.ConsumedOnArrival
            else -> NotificationArrival.Unread
        }
        return Outcome(next, arrival)
    }

    public companion object {
        public fun empty(): NotificationArrivalPolicy = NotificationArrivalPolicy(ToastDedupWindow.empty())
    }
}

/** La même notification, déjà lue : la forme persistée d'une arrivée sur un contenu ouvert. */
public fun ApiNotification.bornRead(): ApiNotification =
    if (state.isRead) this else copy(state = state.copy(isRead = true))
