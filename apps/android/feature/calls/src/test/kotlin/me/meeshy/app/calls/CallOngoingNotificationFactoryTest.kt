package me.meeshy.app.calls

import android.app.Notification
import androidx.core.app.NotificationCompat
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ongoing.CallActivityCaption
import me.meeshy.sdk.model.ongoing.CallActivityPhase
import me.meeshy.sdk.model.ongoing.CallActivitySnapshot
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallOngoingNotificationFactoryTest {

    private val factory = CallOngoingNotificationFactory(RuntimeEnvironment.getApplication())

    private fun snapshot(
        phase: CallActivityPhase = CallActivityPhase.Connected,
        muted: Boolean = false,
        since: Long? = 5_000L,
        caption: CallActivityCaption? = null,
    ) = CallActivitySnapshot(
        phase = phase,
        title = "Alice",
        statusLabel = "Audio call",
        initials = "A",
        isVideo = false,
        isMuted = muted,
        connectedSinceEpochMs = since,
        showsDurationInCompact = true,
        caption = caption,
    )

    private fun Notification.actionTitles() = actions.orEmpty().map { it.title.toString() }

    @Test
    fun `an ongoing call uses the call style with the name and status`() {
        val n = factory.build(snapshot())
        assertThat(n.extras.getString(NotificationCompat.EXTRA_COMPAT_TEMPLATE)).contains("CallStyle")
        assertThat(n.extras.getCharSequence(Notification.EXTRA_TITLE).toString()).isEqualTo("Alice")
        assertThat(n.extras.getCharSequence(Notification.EXTRA_TEXT).toString()).isEqualTo("Audio call")
        assertThat(n.flags and Notification.FLAG_ONGOING_EVENT).isNotEqualTo(0)
    }

    @Test
    fun `the chronometer counts from the moment the call connected`() {
        val n = factory.build(snapshot(since = 5_000L))
        assertThat(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER)).isTrue()
        assertThat(n.`when`).isEqualTo(5_000L)
    }

    @Test
    fun `no chronometer while the call is still ringing`() {
        val n = factory.build(snapshot(phase = CallActivityPhase.Ringing, since = null))
        assertThat(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER)).isFalse()
    }

    @Test
    fun `the hang up and mute actions are offered and the mute label follows the microphone`() {
        assertThat(factory.build(snapshot(muted = false)).actionTitles()).contains("Mute")
        assertThat(factory.build(snapshot(muted = true)).actionTitles()).contains("Unmute")
    }

    @Test
    fun `the lock screen version never carries a caption`() {
        val caption = CallActivityCaption(speaker = "Alice", text = "bonjour")
        val n = factory.build(snapshot(caption = caption))
        assertThat(n.extras.getCharSequence(Notification.EXTRA_TEXT).toString()).contains("bonjour")
        assertThat(n.publicVersion.extras.getCharSequence(Notification.EXTRA_TEXT).toString()).doesNotContain("bonjour")
        assertThat(n.visibility).isEqualTo(Notification.VISIBILITY_PRIVATE)
    }

    @Test
    fun `the ended state is a final self-removing notification`() {
        val n = factory.build(snapshot(phase = CallActivityPhase.Ended))
        assertThat(n.flags and Notification.FLAG_ONGOING_EVENT).isEqualTo(0)
        assertThat(n.actions).isNull()
        assertThat(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER)).isFalse()
    }
}
