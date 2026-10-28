package me.meeshy.app.push

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.MainActivity
import me.meeshy.app.calls.CallForegroundService
import me.meeshy.app.calls.CallHangUpReceiver
import me.meeshy.app.launchExtras
import me.meeshy.app.navigation.CallRoute
import me.meeshy.app.navigation.InboundIntentGate
import me.meeshy.app.navigation.LaunchRouter
import me.meeshy.sdk.model.call.IncomingCallPush
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * #13504 — `MainActivity` est exportée : une app installée lui envoie un intent EXPLICITE portant les extras du push
 * d'appel (`callId`, `autoAnswer`…). Sans preuve, l'app décrochait seule l'appel d'un attaquant, caméra et micro
 * ouverts, sans geste. Les extras d'appel ne sont crus que s'ils portent la preuve que seul le processus Meeshy sait
 * calculer — posée par [IncomingCallNotificationPresenter] dans ses propres `PendingIntent`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = android.app.Application::class, sdk = [28, 34])
class IncomingCallLaunchProofTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val proof = LaunchIntentProof(context)

    private val push = IncomingCallPush(
        callId = "attacker-call",
        conversationId = "direct-conversation",
        callerName = "Mallory",
        isVideo = true,
    )

    private fun forged(autoAnswer: Boolean = true, extra: Intent.() -> Unit = {}) =
        Intent().apply {
            component = ComponentName(context, MainActivity::class.java)
            putExtra(MeeshyFcmService.EXTRA_CALL_ID, push.callId)
            putExtra(MeeshyFcmService.EXTRA_CONVERSATION_ID, push.conversationId)
            putExtra(MeeshyFcmService.EXTRA_CALLER_NAME, "Maman")
            putExtra(MeeshyFcmService.EXTRA_IS_VIDEO, true)
            putExtra(MeeshyFcmService.EXTRA_AUTO_ANSWER, autoAnswer)
            extra()
        }

    private fun routeOf(intent: Intent): String? {
        InboundIntentGate.admit(intent, proof::admits)
        return LaunchRouter.route(intent.launchExtras())
    }

    private fun postedNotification(): Notification {
        IncomingCallNotificationPresenter(context, proof).show(push)
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return shadowOf(manager).getNotification(push.callId.hashCode())
    }

    private fun PendingIntent.savedIntent(): Intent = Intent(shadowOf(this).savedIntent)

    @Suppress("DEPRECATION")
    private fun Notification.answerIntent(): PendingIntent =
        extras.getParcelable(Notification.EXTRA_ANSWER_INTENT)
            ?: actions.first { it.actionIntent.savedIntent().getBooleanExtra(MeeshyFcmService.EXTRA_AUTO_ANSWER, false) }
                .actionIntent

    @Test
    fun `a forged explicit intent that asks to answer produces no call route`() {
        val route = routeOf(forged())

        assertThat(route.orEmpty()).doesNotContain("call?")
    }

    @Test
    fun `a forged intent without auto-answer cannot present a spoofed incoming call either`() {
        val route = routeOf(forged(autoAnswer = false))

        assertThat(route.orEmpty()).doesNotContain("call?")
    }

    @Test
    fun `a guessed proof is refused`() {
        val route = routeOf(forged { putExtra(LaunchIntentProof.EXTRA_PROOF, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") })

        assertThat(route.orEmpty()).doesNotContain("call?")
    }

    @Test
    fun `the answer button of the incoming-call notification answers the call`() {
        val answer = postedNotification().answerIntent().savedIntent()

        val route = routeOf(answer)

        assertThat(route).isEqualTo(
            CallRoute.incoming(
                callId = push.callId,
                conversationId = push.conversationId!!,
                callerName = push.callerName!!,
                isVideo = true,
                autoAnswer = true,
            ),
        )
    }

    @Test
    fun `the full-screen intent rings the call without answering it`() {
        val notification = postedNotification()
        val fullScreen = notification.fullScreenIntent.savedIntent()
        val tap = notification.contentIntent.savedIntent()

        assertThat(routeOf(fullScreen)).isEqualTo(
            CallRoute.incoming(push.callId, push.conversationId!!, push.callerName!!, isVideo = true, autoAnswer = false),
        )
        assertThat(routeOf(tap)).contains("answer=false")
    }

    @Test
    fun `a genuine proof never vouches for another call or for an answer it did not sign`() {
        val ringing = postedNotification().fullScreenIntent.savedIntent()

        val promoted = Intent(ringing).putExtra(MeeshyFcmService.EXTRA_AUTO_ANSWER, true)
        val retargeted = Intent(ringing).putExtra(MeeshyFcmService.EXTRA_CALL_ID, "another-call")

        assertThat(routeOf(promoted).orEmpty()).doesNotContain("call?")
        assertThat(routeOf(retargeted).orEmpty()).doesNotContain("call?")
    }

    @Test
    fun `the proof key is a per-install secret that survives a process restart`() {
        val answer = postedNotification().answerIntent().savedIntent()
        val afterRestart = LaunchIntentProof(context)

        assertThat(afterRestart.admits(Intent(answer))).isTrue()
    }

    @Test
    fun `the components that decline or hang up a call are not reachable by another app`() {
        val packageManager = context.packageManager
        listOf(
            packageManager.getReceiverInfo(ComponentName(context, DeclineCallReceiver::class.java), 0),
            packageManager.getReceiverInfo(ComponentName(context, CallHangUpReceiver::class.java), 0),
            packageManager.getReceiverInfo(ComponentName(context, PushActionReceiver::class.java), 0),
            packageManager.getServiceInfo(ComponentName(context, CallForegroundService::class.java), 0),
            packageManager.getServiceInfo(ComponentName(context, MeeshyFcmService::class.java), PackageManager.GET_META_DATA),
        ).forEach { component ->
            assertThat(component.exported).isFalse()
        }
    }
}
