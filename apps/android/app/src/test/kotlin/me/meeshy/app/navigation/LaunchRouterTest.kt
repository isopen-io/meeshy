package me.meeshy.app.navigation

import android.net.Uri
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.calls.CallConfig
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Behavioural coverage for the notification-launch route decoder (SSOT). Each arm
 * of the decision is asserted through the route it produces — for a call push the
 * route is decoded back through [CallRoute.config] so the assertion is on the real
 * [CallConfig] the screen would drive, not a string literal.
 */
@RunWith(RobolectricTestRunner::class)
class LaunchRouterTest {

    private fun configOf(route: String): CallConfig {
        val uri = Uri.parse(route)
        return CallRoute.config(
            conversationId = uri.getQueryParameter(CallRoute.CONVERSATION_ID_ARG),
            peerName = uri.getQueryParameter(CallRoute.PEER_NAME_ARG),
            isVideo = uri.getQueryParameter(CallRoute.VIDEO_ARG)?.toBoolean(),
            callId = uri.getQueryParameter(CallRoute.CALL_ID_ARG),
            incoming = uri.getQueryParameter(CallRoute.INCOMING_ARG)?.toBoolean() ?: false,
        )
    }

    @Test
    fun `a call push routes to an incoming call carrying the server id and direction`() {
        val route = LaunchRouter.route(
            LaunchExtras(
                callId = "call-abc",
                conversationId = "conv-1",
                callerName = "Alice",
                isVideo = true,
            ),
        )!!

        val config = configOf(route)
        assertThat(config.callId).isEqualTo("call-abc")
        assertThat(config.conversationId).isEqualTo("conv-1")
        assertThat(config.peerName).isEqualTo("Alice")
        assertThat(config.isVideo).isTrue()
        assertThat(config.isOutgoing).isFalse()
    }

    @Test
    fun `a call push wins over a conversation id`() {
        val route = LaunchRouter.route(
            LaunchExtras(callId = "call-abc", conversationId = "conv-1"),
        )!!

        assertThat(configOf(route).isOutgoing).isFalse()
        assertThat(configOf(route).callId).isEqualTo("call-abc")
    }

    @Test
    fun `a call push with a reserved-char caller name round-trips intact`() {
        val route = LaunchRouter.route(
            LaunchExtras(callId = "c/1", conversationId = "x", callerName = "Ann / Bob & Co"),
        )!!

        val config = configOf(route)
        assertThat(config.peerName).isEqualTo("Ann / Bob & Co")
        assertThat(config.callId).isEqualTo("c/1")
    }

    @Test
    fun `a call push with no conversation id still rings with an empty room`() {
        val config = configOf(LaunchRouter.route(LaunchExtras(callId = "call-abc"))!!)

        assertThat(config.conversationId).isEmpty()
        assertThat(config.callId).isEqualTo("call-abc")
        assertThat(config.isOutgoing).isFalse()
    }

    @Test
    fun `a bare conversation id routes to that chat`() {
        val route = LaunchRouter.route(LaunchExtras(conversationId = "6650f0aa11bb22cc33dd44ee"))

        assertThat(route).isEqualTo(Routes.chat("6650f0aa11bb22cc33dd44ee"))
    }

    @Test
    fun `a blank call id falls through to the conversation id`() {
        val route = LaunchRouter.route(LaunchExtras(callId = "  ", conversationId = "conv-9"))

        assertThat(route).isEqualTo(Routes.chat("conv-9"))
    }

    @Test
    fun `no actionable extras yields no route`() {
        assertThat(LaunchRouter.route(LaunchExtras())).isNull()
    }

    @Test
    fun `blank call id and blank conversation id yields no route`() {
        assertThat(LaunchRouter.route(LaunchExtras(callId = "", conversationId = ""))).isNull()
    }
}
