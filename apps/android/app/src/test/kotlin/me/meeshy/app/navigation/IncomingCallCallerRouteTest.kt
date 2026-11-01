package me.meeshy.app.navigation

import android.net.Uri
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.calls.CallConfig
import me.meeshy.sdk.model.call.WaitingCall
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13875 — l'appelant d'un appel entrant arrive jusqu'à l'écran d'appel, comme iOS (`remoteUserId` lu sur l'initiateur
 * de `call:initiated` ou le `callerUserId` du push VoIP). Sans lui, Telecom annonçait un appelant inconnu et les
 * sous-titres reconstituaient l'appelant en cours d'appel.
 */
@RunWith(RobolectricTestRunner::class)
class IncomingCallCallerRouteTest {

    private fun configOf(route: String): CallConfig {
        val uri = Uri.parse(route)
        return CallRoute.config(
            conversationId = uri.getQueryParameter(CallRoute.CONVERSATION_ID_ARG),
            peerName = uri.getQueryParameter(CallRoute.PEER_NAME_ARG),
            isVideo = uri.getQueryParameter(CallRoute.VIDEO_ARG)?.toBoolean(),
            callId = uri.getQueryParameter(CallRoute.CALL_ID_ARG),
            incoming = uri.getQueryParameter(CallRoute.INCOMING_ARG)?.toBoolean() ?: false,
            peerId = uri.getQueryParameter(CallRoute.PEER_ID_ARG),
        )
    }

    @Test
    fun `une invitation reçue par le socket amène son initiateur jusqu'à l'écran d'appel`() {
        val offer = WaitingCall(callId = "call-1", callerId = "u-ana", callerName = "Ana", isVideo = false, conversationId = "conv-1")

        val config = configOf(LaunchRouter.routeIncomingSocketOffer(offer, currentRoute = Routes.CONVERSATIONS)!!)

        assertThat(config.peerId).isEqualTo("u-ana")
        assertThat(config.isOutgoing).isFalse()
    }

    @Test
    fun `un push d'appel amène son appelant jusqu'à l'écran d'appel`() {
        val route = LaunchRouter.route(
            LaunchExtras(callId = "call-1", conversationId = "conv-1", callerId = "u-ana", callerName = "Ana", isVideo = true),
        )!!

        assertThat(configOf(route).peerId).isEqualTo("u-ana")
    }

    @Test
    fun `un push sans appelant garde la route d'avant et sonne toujours`() {
        val extras = LaunchExtras(callId = "call-1", conversationId = "conv-1", callerName = "Ana", isVideo = true)

        val route = LaunchRouter.route(extras)!!

        assertThat(route).doesNotContain("${CallRoute.PEER_ID_ARG}=")
        assertThat(configOf(route).peerId).isEmpty()
        assertThat(configOf(route).callId).isEqualTo("call-1")
    }

    @Test
    fun `l'identifiant de l'appelant est encodé sans casser la requête`() {
        val config = configOf(
            CallRoute.incoming(callId = "call-1", conversationId = "conv-1", callerName = "Ana", isVideo = false, callerId = "u/1&x=y"),
        )

        assertThat(config.peerId).isEqualTo("u/1&x=y")
        assertThat(config.conversationId).isEqualTo("conv-1")
    }

    @Test
    fun `revenir à un appel entrant depuis la pastille garde son appelant`() {
        val live = CallConfig(peerId = "u-ana", peerName = "Ana", isVideo = false, isOutgoing = false, conversationId = "conv-1", callId = "call-1")

        assertThat(configOf(CallRoute.reopen(live)).peerId).isEqualTo("u-ana")
    }

    @Test
    fun `le motif de la route déclare l'appelant`() {
        assertThat(CallRoute.PATTERN).contains("{${CallRoute.PEER_ID_ARG}}")
    }
}
