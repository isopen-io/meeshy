package me.meeshy.app.ongoing

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.push.NotificationChannelIds
import me.meeshy.sdk.model.ongoing.LiveActivityAction
import me.meeshy.sdk.model.ongoing.LiveActivityCommand
import me.meeshy.sdk.model.ongoing.LiveActivityPlan
import me.meeshy.sdk.model.ongoing.OngoingActivityKind
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [26])
class LiveActivityNotifierTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val notifier = LiveActivityNotifier(context)

    private val plan = LiveActivityPlan(
        kind = OngoingActivityKind.Outbox,
        title = "Sending media",
        detail = "1 of 3 sent",
        progress = 1.0 / 3.0,
        actions = listOf(LiveActivityAction(LiveActivityCommand.OutboxCancel, "Cancel")),
    )

    @Test
    fun `on Android 8 to 15 progress is a standard bar on the silent ongoing channel`() {
        val notification = notifier.build(plan, sdk = 35)
        assertThat(notification.channelId).isEqualTo(NotificationChannelIds.CHANNEL_ONGOING)
        assertThat(notification.extras.getInt("android.progress")).isEqualTo(33)
        assertThat(notification.extras.getInt("android.progressMax")).isEqualTo(100)
        assertThat(notification.extras.getBoolean("android.progressIndeterminate")).isFalse()
    }

    @Test
    fun `the cancel button is a broadcast to the single command receiver`() {
        val notification = notifier.build(plan, sdk = 35)
        assertThat(notification.actions.map { it.title.toString() }).containsExactly("Cancel")
    }

    @Test
    fun `an unknown total shows an indeterminate bar`() {
        val notification = notifier.build(plan.copy(progress = null, indeterminate = true), sdk = 35)
        assertThat(notification.extras.getBoolean("android.progressIndeterminate")).isTrue()
    }

    @Test
    fun `a recording plan runs a chronometer`() {
        val recording = LiveActivityPlan(OngoingActivityKind.Recording, "Voice", chronometerFromEpochMs = 42L)
        val notification = notifier.build(recording, sdk = 35)
        assertThat(notification.extras.getBoolean("android.showChronometer")).isTrue()
        assertThat(notification.`when`).isEqualTo(42L)
    }

    @Test
    fun `an outcome is not ongoing and leaves the lock screen neutral`() {
        val outcome = LiveActivityPlan(OngoingActivityKind.Outbox, "Sent", isOngoing = false)
        val notification = notifier.build(outcome, timeoutMs = 3_000L, sdk = 35)
        assertThat(notification.flags and android.app.Notification.FLAG_ONGOING_EVENT).isEqualTo(0)
        assertThat(notification.publicVersion).isNotNull()
    }

    @Test
    fun `the command intent carries the command wire name`() {
        val intent = OngoingCommandReceiver.intent(context, LiveActivityCommand.OutboxCancel)
        assertThat(intent.action).isEqualTo(OngoingCommandReceiver.ACTION)
        assertThat(intent.getStringExtra(OngoingCommandReceiver.EXTRA_COMMAND)).isEqualTo("outbox_cancel")
    }
}
