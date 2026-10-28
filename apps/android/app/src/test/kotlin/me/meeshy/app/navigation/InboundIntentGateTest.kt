package me.meeshy.app.navigation

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.navigation.NavController
import androidx.navigation.NavDestination
import androidx.navigation.NavDestinationBuilder
import androidx.navigation.NavType
import androidx.navigation.Navigator
import androidx.navigation.createGraph
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.push.MeeshyFcmService
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13465 — `MainActivity` est exportée : n'importe quelle app installée peut lui envoyer un intent EXPLICITE, qui
 * contourne tous les filtres du manifeste. `NavController.handleDeepLink(activity.intent)` lit ses propres extras
 * `android-support-nav:controller:*` (identifiants de destination + arguments) sur N'IMPORTE QUEL intent : sans garde,
 * un tel intent atteint n'importe quelle destination — l'écran d'appel en premier, qui compose sans geste, contournant
 * la feuille « Appeler @x ? ».
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = android.app.Application::class, sdk = [34])
class InboundIntentGateTest {

    @Navigator.Name("probe")
    private class ProbeNavigator : Navigator<NavDestination>() {
        override fun createDestination(): NavDestination = NavDestination(this)
    }

    private fun controller(): NavController = NavController(ApplicationProvider.getApplicationContext()).apply {
        val navigator = ProbeNavigator()
        navigatorProvider.addNavigator(navigator)
        graph = createGraph(startDestination = "home") {
            destination(NavDestinationBuilder(navigator, "home"))
            destination(
                NavDestinationBuilder(navigator, CallRoute.PATTERN).apply {
                    listOf(CallRoute.CONVERSATION_ID_ARG, CallRoute.PEER_NAME_ARG, CallRoute.CALL_ID_ARG).forEach {
                        argument(it) { type = NavType.StringType; nullable = true; defaultValue = null }
                    }
                    listOf(CallRoute.VIDEO_ARG, CallRoute.INCOMING_ARG, CallRoute.ANSWER_ARG).forEach {
                        argument(it) { type = NavType.BoolType; defaultValue = false }
                    }
                },
            )
        }
    }

    private fun forgedCallIntent(controller: NavController): Intent {
        val call = controller.graph.findNode(CallRoute.PATTERN)!!
        return Intent(Intent.ACTION_VIEW).apply {
            putExtra("android-support-nav:controller:deepLinkIds", intArrayOf(controller.graph.id, call.id))
            putExtra(
                "android-support-nav:controller:deepLinkExtras",
                Bundle().apply {
                    putString(CallRoute.CONVERSATION_ID_ARG, "victim-conversation")
                    putBoolean(CallRoute.VIDEO_ARG, true)
                },
            )
        }
    }

    @Test
    fun `a forged navigation extra reaches the call screen when nothing guards it - the vector`() {
        val controller = controller()

        assertThat(controller.handleDeepLink(forgedCallIntent(controller))).isTrue()
        assertThat(controller.currentDestination?.route).isEqualTo(CallRoute.PATTERN)
        assertThat(controller.currentBackStackEntry?.arguments?.getString(CallRoute.CONVERSATION_ID_ARG)).isEqualTo("victim-conversation")
    }

    @Test
    fun `an admitted intent can no longer reach the call screen`() {
        val controller = controller()
        val intent = forgedCallIntent(controller)

        InboundIntentGate.admit(intent)

        assertThat(controller.handleDeepLink(intent)).isFalse()
        assertThat(controller.currentDestination?.route).isEqualTo("home")
    }

    @Test
    fun `the navigation controller extras are stripped, the app extras are kept`() {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            putExtra("android-support-nav:controller:deepLinkIds", intArrayOf(42))
            putExtra("android-support-nav:controller:deepLinkExtras", Bundle().apply { putString("conversationId", "abc") })
            putExtra("android-support-nav:controller:deepLinkArgs", arrayListOf(Bundle()))
            putExtra(MeeshyFcmService.EXTRA_CONVERSATION_ID, "conv")
        }

        InboundIntentGate.admit(intent)

        assertThat(intent.extras!!.keySet()).containsExactly(MeeshyFcmService.EXTRA_CONVERSATION_ID)
    }

    @Test
    fun `an implicit route address is dropped too, whatever its case`() {
        listOf(
            "android-app://androidx.navigation/call?conversationId=abc&video=true",
            "ANDROID-APP://androidx.navigation/auth/magic-link?token=t",
        ).forEach { address ->
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(address))

            InboundIntentGate.admit(intent)

            assertThat(intent.data).isNull()
        }
    }

    @Test
    fun `the links the app reads go through untouched`() {
        listOf("https://meeshy.me/reset-password#token=t", "meeshy://call?contactId=abc", "meeshy://conversation/abc").forEach { address ->
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(address))

            InboundIntentGate.admit(intent)

            assertThat(intent.dataString).isEqualTo(address)
        }
    }
}
