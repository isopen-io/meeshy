package me.meeshy.app.navigation

/**
 * The primitive launch inputs a notification tap / full-screen call intent carries.
 * [MainActivity] extracts these from the Android `Intent` extras (thin, untestable
 * platform glue) and hands them to the pure [LaunchRouter], which owns the decision.
 *
 * Keys mirror the extras [me.meeshy.app.push.MeeshyFcmService] sets:
 *  - a **call** full-screen intent carries [callId] / [conversationId] / [callerName] / [isVideo]
 *  - a **message** notification tap carries only [conversationId]
 *  - a cold/normal launch carries none.
 */
data class LaunchExtras(
    val callId: String? = null,
    val conversationId: String? = null,
    val callerName: String? = null,
    val isVideo: Boolean = false,
)

/**
 * Pure single source of truth translating an app-launch's notification extras into
 * the deep-link route to navigate to, or `null` when nothing actionable is present
 * (the start destination stands). Shared plumbing for both notification kinds:
 *
 *  - a **call** push (non-blank [LaunchExtras.callId]) wins — a ringing call is the
 *    urgent, foreground-worthy intent — and deep-links into the incoming-call screen
 *    via [CallRoute.incoming], carrying the server id so the screen answers rather
 *    than re-initiates.
 *  - otherwise a bare non-blank [LaunchExtras.conversationId] opens that chat
 *    ([Routes.chat]) — the message-notification tap path.
 *  - everything else (both blank) yields `null`.
 *
 * Keeping the branch decision here (unit-tested) leaves the `MainActivity` /
 * `MeeshyApp` wiring a thin layer that only reads extras and calls `navigate`.
 */
object LaunchRouter {
    fun route(extras: LaunchExtras): String? = when {
        !extras.callId.isNullOrBlank() -> CallRoute.incoming(
            callId = extras.callId,
            conversationId = extras.conversationId.orEmpty(),
            callerName = extras.callerName.orEmpty(),
            isVideo = extras.isVideo,
        )
        !extras.conversationId.isNullOrBlank() -> Routes.chat(extras.conversationId)
        else -> null
    }
}
