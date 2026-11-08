package me.meeshy.sdk.preferences

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.PreferenceCategory
import me.meeshy.sdk.model.VideoQuality
import me.meeshy.sdk.outbox.OutboxKind
import org.junit.Test

class UserPreferencesManagerTest {

    @Test
    fun `a change lands in the state flow at once, before any network`() = runTest {
        val harness = UserPreferencesHarness(this)
        val manager = harness.manager()

        manager.updateVideo { it.copy(videoQuality = VideoQuality.HIGH) }

        assertThat(manager.video.value.videoQuality).isEqualTo(VideoQuality.HIGH)
        assertThat(harness.enqueued).isEmpty()
    }

    @Test
    fun `nothing is queued before the one second debounce, then exactly one row`() = runTest {
        val harness = UserPreferencesHarness(this)
        val manager = harness.manager()

        manager.updateVideo { it.copy(mirrorLocalVideo = false) }
        advanceTimeBy(999)
        runCurrent()
        assertThat(harness.enqueued).isEmpty()

        advanceTimeBy(2)
        runCurrent()

        assertThat(harness.enqueued).hasSize(1)
        val row = harness.enqueued.single()
        assertThat(row.kind).isEqualTo(OutboxKind.UPDATE_PREFERENCE_CATEGORY)
        assertThat(row.targetId).isEqualTo("video")
        assertThat(row.payload).contains("\"mirrorLocalVideo\":false")
    }

    @Test
    fun `a burst on one category restarts the debounce and sends only the final value`() = runTest {
        val harness = UserPreferencesHarness(this)
        val manager = harness.manager()

        manager.updateDocument { it.copy(autoDownloadOnWifi = false) }
        advanceTimeBy(600)
        manager.updateDocument { it.copy(autoDownloadOnWifi = true) }
        advanceTimeBy(600)
        runCurrent()
        assertThat(harness.enqueued).isEmpty()

        advanceTimeBy(500)
        runCurrent()

        assertThat(harness.enqueued).hasSize(1)
        assertThat(harness.enqueued.single().payload).contains("\"autoDownloadOnWifi\":true")
    }

    @Test
    fun `two categories debounce independently`() = runTest {
        val harness = UserPreferencesHarness(this)
        val manager = harness.manager()

        manager.updateVideo { it.copy(mirrorLocalVideo = false) }
        manager.updateMessage { it.copy(sendOnEnter = false) }
        advanceTimeBy(1_001)
        runCurrent()

        assertThat(harness.enqueued.map { it.targetId }).containsExactly("video", "message")
    }

    @Test
    fun `a change that alters nothing neither queues nor marks pending`() = runTest {
        val harness = UserPreferencesHarness(this)
        val manager = harness.manager()

        manager.updateVideo { it }
        advanceTimeBy(2_000)
        runCurrent()

        assertThat(harness.enqueued).isEmpty()
        assertThat(harness.sync.pendingCategories()).isEmpty()
    }

    @Test
    fun `the category stays pending until its row is queued`() = runTest {
        val harness = UserPreferencesHarness(this)
        val manager = harness.manager()

        manager.updateVideo { it.copy(mirrorLocalVideo = false) }
        assertThat(harness.sync.isPending(PreferenceCategory.VIDEO)).isTrue()

        advanceTimeBy(1_001)
        runCurrent()

        assertThat(harness.sync.isPending(PreferenceCategory.VIDEO)).isFalse()
    }

    @Test
    fun `without a session the value is kept and the category stays pending`() = runTest {
        val harness = UserPreferencesHarness(this, hasSession = false)
        val manager = harness.manager()

        manager.updateVideo { it.copy(mirrorLocalVideo = false) }
        advanceTimeBy(2_000)
        runCurrent()

        assertThat(harness.enqueued).isEmpty()
        assertThat(manager.video.value.mirrorLocalVideo).isFalse()
        assertThat(harness.sync.isPending(PreferenceCategory.VIDEO)).isTrue()
    }

    @Test
    fun `every notification write re-stamps the device UTC offset`() = runTest {
        val harness = UserPreferencesHarness(this, utcOffset = 540)
        val manager = harness.manager()

        manager.updateNotification { it.copy(dndEnabled = true) }
        assertThat(manager.notification.value.dndUtcOffsetMinutes).isEqualTo(540)

        harness.utcOffset = -240
        manager.updateNotification { it.copy(soundEnabled = false) }

        assertThat(manager.notification.value.dndUtcOffsetMinutes).isEqualTo(-240)
        advanceTimeBy(1_001)
        runCurrent()
        assertThat(harness.enqueued.single().payload).contains("\"dndUtcOffsetMinutes\":-240")
    }

    @Test
    fun `logging out purges values, pending flags and disk keys but not the observers`() = runTest {
        val harness = UserPreferencesHarness(this)
        val manager = harness.manager()
        manager.updateVideo { it.copy(mirrorLocalVideo = false) }

        manager.clear()
        advanceTimeBy(2_000)
        runCurrent()

        assertThat(harness.enqueued).isEmpty()
        assertThat(harness.sync.pendingCategories()).isEmpty()
        assertThat(manager.video.value.mirrorLocalVideo).isTrue()

        manager.updateVideo { it.copy(mirrorLocalVideo = false) }
        advanceTimeBy(1_001)
        runCurrent()
        assertThat(harness.enqueued).hasSize(1)
    }
}
