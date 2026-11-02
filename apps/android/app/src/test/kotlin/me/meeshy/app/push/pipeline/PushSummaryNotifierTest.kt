package me.meeshy.app.push.pipeline

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.push.NotificationChannelIds
import me.meeshy.sdk.model.push.PushGrouping
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [26])
class PushSummaryNotifierTest {

    private lateinit var context: Context
    private lateinit var manager: NotificationManager

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancelAll()
    }

    @Test
    fun `le recapitulatif porte le groupe, le drapeau de resume et le badge`() {
        PushSummaryNotifier(context).post("conversation:c1", NotificationChannelIds.CHANNEL_MESSAGES, badge = 3)

        val posted = manager.activeNotifications.single()
        assertThat(posted.id).isEqualTo(PushGrouping.summaryNotificationId("conversation:c1"))
        assertThat(posted.notification.group).isEqualTo("conversation:c1")
        assertThat(posted.notification.flags and Notification.FLAG_GROUP_SUMMARY).isNotEqualTo(0)
        assertThat(posted.notification.number).isEqualTo(3)
    }

    @Test
    fun `un recapitulatif repete remplace le precedent`() {
        val notifier = PushSummaryNotifier(context)

        notifier.post("post:p1", NotificationChannelIds.CHANNEL_SOCIAL, badge = null)
        notifier.post("post:p1", NotificationChannelIds.CHANNEL_SOCIAL, badge = null)

        assertThat(manager.activeNotifications).hasLength(1)
    }
}
