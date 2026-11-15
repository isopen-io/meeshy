package me.meeshy.sdk.preferences

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.audio.InMemoryAudioPreferencesStore
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.PreferenceCategory
import me.meeshy.sdk.model.PreferenceCategoryCodecs
import me.meeshy.sdk.model.VideoQuality
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.socket.PreferencesSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import org.junit.Test

class PreferencesSyncCoordinatorSevenCategoriesTest {

    private fun servedBlock(vararg fields: Pair<String, Any>): ApiResponse<kotlinx.serialization.json.JsonElement> =
        ApiResponse(
            success = true,
            data = JsonObject(
                fields.associate { (key, value) ->
                    key to when (value) {
                        is Boolean -> JsonPrimitive(value)
                        else -> JsonPrimitive(value.toString())
                    }
                },
            ),
        )

    private class Rig(test: kotlinx.coroutines.test.TestScope, val owed: Set<OutboxKind> = emptySet()) {
        val harness = UserPreferencesHarness(test)
        val coordinator = PreferencesSyncCoordinator(
            socketManager = mockk<PreferencesSocketManager> { every { categoryPreferencesUpdated } returns MutableSharedFlow() },
            connectionManager = mockk<SocketManager> { every { connectionState } returns MutableStateFlow(SocketConnectionState.DISCONNECTED) },
            preferencesApi = mockk<PreferencesApi>(relaxed = true),
            outboxRepository = harness.outbox.also {
                coEvery { it.hasDeliverable(any(), any()) } answers { secondArg<OutboxKind>() in owed }
            },
            notificationStore = InMemoryNotificationPreferencesStore(),
            privacyStore = InMemoryPrivacyPreferencesStore(),
            audioStore = InMemoryAudioPreferencesStore(),
            scope = test.backgroundScope,
            categorySync = harness.sync,
        )
    }

    @Test
    fun `a named category that this device holds only in the snapshot store is re-read and merged`() = runTest {
        val rig = Rig(this)
        coEvery { rig.harness.readApi.getBlock("video") } returns servedBlock("videoQuality" to "high")

        rig.coordinator.refreshCategory("video")

        val stored = PreferenceCategoryCodecs.video.fromStorage(rig.harness.snapshotStore.observe("block:video").first())
        assertThat(stored.videoQuality).isEqualTo(VideoQuality.HIGH)
    }

    @Test
    fun `a local modification still pending vetoes the re-read of each of the four blocks`() = runTest {
        val rig = Rig(this)
        listOf("message", "video", "document", "application").forEach { name ->
            rig.harness.sync.markPending(PreferenceCategory.entries.first { it.name.lowercase() == name })
            rig.coordinator.refreshCategory(name)
        }

        coVerify(exactly = 0) { rig.harness.readApi.getBlock(any()) }
    }

    @Test
    fun `a deliverable outbox row of the category vetoes its re-read`() = runTest {
        val rig = Rig(this, owed = setOf(OutboxKind.UPDATE_PREFERENCE_CATEGORY))

        rig.coordinator.refreshCategory("document")

        coVerify(exactly = 0) { rig.harness.readApi.getBlock(any()) }
    }

    @Test
    fun `the veto is per category, not global`() = runTest {
        val rig = Rig(this)
        coEvery { rig.harness.readApi.getBlock("message") } returns servedBlock("sendOnEnter" to false)
        rig.harness.sync.markPending(PreferenceCategory.VIDEO)

        rig.coordinator.refreshCategory("video")
        rig.coordinator.refreshCategory("message")

        coVerify(exactly = 0) { rig.harness.readApi.getBlock("video") }
        coVerify(exactly = 1) { rig.harness.readApi.getBlock("message") }
    }

    @Test
    fun `keys unknown to this build survive the merge and travel in the next write`() = runTest {
        val rig = Rig(this)
        coEvery { rig.harness.readApi.getBlock("video") } returns servedBlock("hologram" to true)

        rig.coordinator.refreshCategory("video")

        val raw = rig.harness.snapshotStore.observe("block:video").first()
        val merged = PreferenceCategoryCodecs.video.fromStorage(raw)
        assertThat(PreferenceCategoryCodecs.video.snapshot(merged)).containsKey("hologram")
    }

    @Test
    fun `an unknown category name is ignored`() = runTest {
        val rig = Rig(this)

        rig.coordinator.refreshCategory("hologram")

        coVerify(exactly = 0) { rig.harness.readApi.getBlock(any()) }
    }
}
