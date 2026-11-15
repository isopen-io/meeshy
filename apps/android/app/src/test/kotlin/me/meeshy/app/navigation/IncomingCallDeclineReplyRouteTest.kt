package me.meeshy.app.navigation

import android.net.Uri
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.calls.CallConfig
import me.meeshy.app.calls.CallDeclineReplyTarget
import me.meeshy.sdk.model.call.WaitingCall
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Le chemin NOMINAL d'un appel entrant (#13866) : une invitation reçue par le socket et un
 * push d'appel arrivent à l'écran par [CallRoute.incoming], qui ne transporte pas l'identifiant
 * de l'appelant. La capsule « Message » doit pourtant y être offerte, vers la conversation de
 * l'appel — pas seulement après la bascule d'un appel en attente.
 */
@RunWith(RobolectricTestRunner::class)
class IncomingCallDeclineReplyRouteTest {

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
    fun `une invitation reçue par le socket ouvre un écran qui offre la réponse par message vers sa conversation`() {
        val offer = WaitingCall(callId = "call-1", callerId = "u-ana", callerName = "Ana", isVideo = false, conversationId = "conv-1")
        val route = LaunchRouter.routeIncomingSocketOffer(offer, currentRoute = Routes.CONVERSATIONS)!!

        assertThat(CallDeclineReplyTarget.of(configOf(route))?.conversationId).isEqualTo("conv-1")
    }

    @Test
    fun `un push d'appel ouvre un écran qui offre la réponse par message vers sa conversation`() {
        val route = LaunchRouter.route(
            LaunchExtras(callId = "call-1", conversationId = "conv-1", callerName = "Ana", isVideo = true),
        )!!

        assertThat(CallDeclineReplyTarget.of(configOf(route))?.conversationId).isEqualTo("conv-1")
    }

    @Test
    fun `un appel sortant placé depuis le fil n'offre jamais la réponse par message`() {
        val route = CallRoute.path(conversationId = "conv-1", peerName = "Ana", isVideo = false)

        assertThat(CallDeclineReplyTarget.of(configOf(route))).isNull()
    }
}
