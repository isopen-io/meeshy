package me.meeshy.app.push

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = android.app.Application::class, sdk = [28, 34])
class PushActionSettlementTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun postBanner() {
        manager.cancelAll()
        manager.notify(
            7,
            NotificationCompat.Builder(context, "meeshy_messages_v2")
                .setSmallIcon(me.meeshy.app.R.drawable.ic_stat_meeshy)
                .setContentTitle("Alice")
                .setContentText("Salut")
                .build(),
        )
    }

    @Test
    fun `une reponse gardee en brouillon reste affichee et le dit`() {
        postBanner()

        PushActionSettlement.settle(context, 7, PushNotificationActionHandler.Outcome.DRAFT_KEPT)

        val banner = shadowOf(manager).getNotification(7)
        val history = banner.extras.getCharSequenceArray(Notification.EXTRA_REMOTE_INPUT_HISTORY)
        assertThat(history?.map { it.toString() }).containsExactly(context.getString(me.meeshy.app.R.string.push_reply_kept_as_draft))
        assertThat(banner.extras.getCharSequence("android.title").toString()).isEqualTo("Alice")
    }

    @Test
    fun `une action prise en compte retire la banniere, un echec la repose telle quelle`() {
        postBanner()
        PushActionSettlement.settle(context, 7, PushNotificationActionHandler.Outcome.FAILED)
        assertThat(shadowOf(manager).getNotification(7).extras.getCharSequenceArray(Notification.EXTRA_REMOTE_INPUT_HISTORY)).isNull()

        PushActionSettlement.settle(context, 7, PushNotificationActionHandler.Outcome.SENT)
        assertThat(shadowOf(manager).getNotification(7)).isNull()
    }
}
