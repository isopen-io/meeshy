package me.meeshy.app.push

import me.meeshy.sdk.model.push.PushPayload

/**
 * One incoming FCM push, decoded ONCE into [payload]. [data] keeps the raw string map for
 * the readers that still parse their own keys (call router, revocation parser). The
 * `notification` block only exists for a legacy push received in the foreground.
 */
data class IncomingPush(
    val data: Map<String, String>,
    val payload: PushPayload,
    val notificationTitle: String? = null,
    val notificationBody: String? = null,
    val hasNotificationBlock: Boolean = false,
) {
    companion object {
        fun of(
            data: Map<String, String>,
            notificationTitle: String? = null,
            notificationBody: String? = null,
            hasNotificationBlock: Boolean = false,
        ): IncomingPush = IncomingPush(
            data = data,
            payload = PushPayload.decode(data),
            notificationTitle = notificationTitle,
            notificationBody = notificationBody,
            hasNotificationBlock = hasNotificationBlock,
        )
    }
}

/**
 * The single extension point of the push pipeline (CONVENTIONS rule 16) : a lot that needs
 * to react to every push (silent sync, badge, message pre-persist, presence...) contributes
 * an implementation with `@Binds @IntoSet` from its OWN module — [MeeshyFcmService] is never
 * edited again.
 *
 * Called on the FCM worker thread, after the system rendering, for EVERY push (calls and
 * revocations included). An exception is logged and isolated : it deprives neither the other
 * observers nor the rendering. Heavy work must hop to its own scope : FCM grants ~10 s.
 */
interface PushObserver {
    /** Ascending ; ties are broken by class name so the order is deterministic. */
    val order: Int get() = 0

    fun onPush(push: IncomingPush)
}
