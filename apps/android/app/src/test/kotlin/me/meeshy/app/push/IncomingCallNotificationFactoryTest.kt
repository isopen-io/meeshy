package me.meeshy.app.push

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.IncomingCallPush
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = android.app.Application::class, sdk = [28, 34])
class IncomingCallNotificationFactoryTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val push = IncomingCallPush(callId = "call-1", conversationId = "conv-1", callerUserId = "peer-1")

    @Test
    fun `l'action de reponse porte une saisie directe et s'annonce comme une reponse`() {
        val action = IncomingCallNotificationFactory.replyAction(context, push)

        assertThat(action.remoteInputs).hasLength(1)
        assertThat(action.remoteInputs!![0].resultKey).isEqualTo(IncomingCallNotificationFactory.KEY_DECLINE_REPLY)
        assertThat(action.semanticAction).isEqualTo(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
        assertThat(action.showsUserInterface).isFalse()
    }

    @Test
    fun `l'action vise le receiver de refus avec l'appel, la conversation et l'appelant`() {
        val action = IncomingCallNotificationFactory.replyAction(context, push)

        val intent = shadowOf(action.actionIntent).savedIntent
        assertThat(intent.component?.className).isEqualTo(DeclineCallReceiver::class.java.name)
        assertThat(intent.getStringExtra(MeeshyFcmService.EXTRA_CALL_ID)).isEqualTo("call-1")
        assertThat(intent.getStringExtra(MeeshyFcmService.EXTRA_CONVERSATION_ID)).isEqualTo("conv-1")
        assertThat(intent.getStringExtra(MeeshyFcmService.EXTRA_CALLER_ID)).isEqualTo("peer-1")
        assertThat(shadowOf(action.actionIntent).isBroadcastIntent).isTrue()
    }

    @Test
    fun `le texte saisi se relit de l'intent, un simple refus n'en porte pas`() {
        val action = IncomingCallNotificationFactory.replyAction(context, push)
        val filled = Intent()
        RemoteInput.addResultsToIntent(
            action.remoteInputs!!,
            filled,
            Bundle().apply { putCharSequence(IncomingCallNotificationFactory.KEY_DECLINE_REPLY, "Je te rappelle.") },
        )

        assertThat(IncomingCallNotificationFactory.replyText(filled)).isEqualTo("Je te rappelle.")
        assertThat(IncomingCallNotificationFactory.replyText(Intent())).isNull()
    }
}
