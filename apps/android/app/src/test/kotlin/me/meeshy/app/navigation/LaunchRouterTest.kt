package me.meeshy.app.navigation

import android.net.Uri
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.calls.CallConfig
import me.meeshy.sdk.model.call.WaitingCall
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

    // --- Socket-delivered incoming offer (foreground path) ---

    @Test
    fun `a socket incoming offer while idle rings the incoming-call screen`() {
        val route = LaunchRouter.routeIncomingSocketOffer(
            offer = WaitingCall(callId = "call-xyz", callerId = "u1", callerName = "Bob", isVideo = true),
            currentRoute = Routes.CONVERSATIONS,
        )!!

        val config = configOf(route)
        assertThat(config.callId).isEqualTo("call-xyz")
        assertThat(config.peerName).isEqualTo("Bob")
        assertThat(config.isVideo).isTrue()
        assertThat(config.isOutgoing).isFalse()
    }

    @Test
    fun `a socket incoming offer while already on the call screen yields no route`() {
        val route = LaunchRouter.routeIncomingSocketOffer(
            offer = WaitingCall(callId = "call-2", callerId = "u2", callerName = "Carol", isVideo = false),
            currentRoute = CallRoute.PATTERN,
        )

        assertThat(route).isNull()
    }

    @Test
    fun `a socket incoming offer with no current route still rings`() {
        val route = LaunchRouter.routeIncomingSocketOffer(
            offer = WaitingCall(callId = "call-3", callerId = "u3", callerName = "Dave", isVideo = false),
            currentRoute = null,
        )!!

        assertThat(configOf(route).callId).isEqualTo("call-3")
        assertThat(configOf(route).isOutgoing).isFalse()
    }

    // --- autoAnswer : bouton « Répondre » de la notification CallStyle --------

    @Test
    fun `the notification Answer button routes with the auto-answer flag`() {
        val route = LaunchRouter.route(
            LaunchExtras(callId = "call-abc", callerName = "Alice", autoAnswer = true),
        )!!

        assertThat(Uri.parse(route).getQueryParameter(CallRoute.ANSWER_ARG)).isEqualTo("true")
    }

    @Test
    fun `a plain notification tap never auto-answers`() {
        val route = LaunchRouter.route(LaunchExtras(callId = "call-abc", callerName = "Alice"))!!

        assertThat(Uri.parse(route).getQueryParameter(CallRoute.ANSWER_ARG)).isEqualTo("false")
    }

    @Test
    fun `a socket incoming offer never auto-answers`() {
        val route = LaunchRouter.routeIncomingSocketOffer(
            offer = WaitingCall(callId = "call-3", callerId = "u3", callerName = "Dave", isVideo = false),
            currentRoute = null,
        )!!

        assertThat(Uri.parse(route).getQueryParameter(CallRoute.ANSWER_ARG)).isEqualTo("false")
    }

    // ---- Un lien a jeton d'e-mail n'entre que par la forme exacte de l'e-mail, sur l'origine https (#10873, #10875)

    private fun routeOf(uri: String): String? = LaunchRouter.routeForDeepLink(uri)

    @Test
    fun `the secret written in the fragment routes to validation`() {
        assertThat(routeOf("https://meeshy.me/auth/magic-link?via=email#token=abc123"))
            .isEqualTo("auth/magic-link?token=abc123")
    }

    @Test
    fun `the fragment prevails over the query`() {
        assertThat(routeOf("https://meeshy.me/auth/magic-link?token=old#token=new"))
            .isEqualTo("auth/magic-link?token=new")
    }

    @Test
    fun `a blank fragment secret falls back to the query`() {
        assertThat(routeOf("https://meeshy.me/auth/magic-link?token=old#token="))
            .isEqualTo("auth/magic-link?token=old")
    }

    @Test
    fun `the email-link alias written in the mails routes to validation`() {
        assertThat(routeOf("https://meeshy.me/auth/email-link/magic-link#token=abc123"))
            .isEqualTo("auth/magic-link?token=abc123")
    }

    @Test
    fun `the historical path token routes to validation`() {
        assertThat(routeOf("https://meeshy.me/auth/magic-link/tok-3_A"))
            .isEqualTo("auth/magic-link?token=tok-3_A")
    }

    @Test
    fun `the default https port and an upper-case origin are the same origin`() {
        assertThat(routeOf("https://meeshy.me:443/auth/magic-link#token=abc"))
            .isEqualTo("auth/magic-link?token=abc")
        assertThat(routeOf("HTTPS://MEESHY.ME/auth/magic-link#token=abc"))
            .isEqualTo("auth/magic-link?token=abc")
    }

    @Test
    fun `a token link received through the custom scheme is never routed`() {
        listOf(
            "meeshy://auth/magic-link?token=abc",
            "meeshy://auth/magic-link#token=abc",
            "meeshy://auth/magic-link/abc",
            "meeshy://auth/email-link/magic-link#token=abc",
            "meeshy://auth/verify-email#token=t&email=a%40b.co",
            "meeshy://auth/reset-password#token=r",
            "meeshy://reset-password#token=r",
            "MEESHY://auth/magic-link?token=abc",
            "Meeshy://Auth/Magic-Link?token=abc",
        ).forEach { assertThat(routeOf(it)).isNull() }
    }

    @Test
    fun `every variant of the exact form is refused`() {
        listOf(
            "https://meeshy.me/auth/magic-link/validate?token=abc",
            "https://meeshy.me/auth/magic-link/abc/extra",
            "https://meeshy.me/auth/magic-link/ab%20c",
            "https://meeshy.me/auth/magic-link/?token=abc",
            "https://meeshy.me//auth/magic-link?token=abc",
            "https://meeshy.me/x/../auth/magic-link?token=abc",
            "https://meeshy.me/AUTH/Magic-Link?token=abc",
            "https://meeshy.me/auth%2Fmagic-link?token=abc",
            "https://meeshy.me/%61uth/magic-link?token=abc",
            "https://meeshy.me/auth/magic-link%20?token=abc",
            "https://meeshy.me/auth/magic%E2%80%8B-link?token=abc",
            "https://meeshy.me/auth/magic-link;x=1?token=abc",
            "https://meeshy.me/auth/magic-linker?token=abc",
            "https://user:pass@meeshy.me/auth/magic-link?token=abc",
            "https://evil.example%5C@meeshy.me/auth/magic-link?token=abc",
            "https://meeshy.me:8443/auth/magic-link?token=abc",
            "http://meeshy.me/auth/magic-link?token=abc",
        ).forEach { assertThat(routeOf(it)).isNull() }
    }

    @Test
    fun `an origin that only looks like Meeshy is refused`() {
        listOf(
            "https://evil.example/auth/magic-link?token=abc",
            "https://meeshy.me.evil.example/auth/magic-link?token=abc",
            "https://meeshy.me@evil.example/auth/magic-link?token=abc",
            "https://meeshy.me\\@evil.example/auth/magic-link?token=abc",
            "https://notmeeshy.me/auth/magic-link?token=abc",
            "https://www.evil.example/?u=https://meeshy.me/auth/magic-link?token=abc",
        ).forEach { assertThat(routeOf(it)).isNull() }
    }

    @Test
    fun `verification and reset links have no destination here and never route`() {
        assertThat(routeOf("https://meeshy.me/auth/verify-email#token=t&email=a%40b.co")).isNull()
        assertThat(routeOf("https://meeshy.me/auth/email-link/verify-email#token=t&email=a%40b.co")).isNull()
        assertThat(routeOf("https://meeshy.me/reset-password#token=r")).isNull()
        assertThat(routeOf("https://meeshy.me/auth/email-link/reset-password#token=r")).isNull()
    }

    @Test
    fun `a magic link without any secret never routes`() {
        assertThat(routeOf("https://meeshy.me/auth/magic-link")).isNull()
        assertThat(routeOf("https://meeshy.me/auth/magic-link?via=email")).isNull()
        assertThat(routeOf("https://meeshy.me/auth/magic-link#token=")).isNull()
        assertThat(routeOf("https://meeshy.me/auth/magic-link#other=abc")).isNull()
    }
}
