package me.meeshy.sdk.model.ongoing

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ongoing.ForegroundTypeLaw.CAMERA
import me.meeshy.sdk.model.ongoing.ForegroundTypeLaw.DATA_SYNC
import me.meeshy.sdk.model.ongoing.ForegroundTypeLaw.MEDIA_PLAYBACK
import me.meeshy.sdk.model.ongoing.ForegroundTypeLaw.MEDIA_PROJECTION
import me.meeshy.sdk.model.ongoing.ForegroundTypeLaw.MICROPHONE
import me.meeshy.sdk.model.ongoing.ForegroundTypeLaw.PHONE_CALL
import org.junit.Test

class ForegroundTypeLawTest {

    private val all = ForegroundTypeLaw.Permissions(microphone = true, camera = true)
    private val none = ForegroundTypeLaw.Permissions(microphone = false, camera = false)

    private fun resolve(vararg kinds: OngoingActivityKind, video: Boolean = false, permissions: ForegroundTypeLaw.Permissions = all) =
        ForegroundTypeLaw.resolve(kinds.toSet(), video, permissions)

    @Test
    fun `an audio call declares phone call and microphone`() {
        assertThat(resolve(OngoingActivityKind.Call).mask).isEqualTo(PHONE_CALL or MICROPHONE)
    }

    @Test
    fun `a video call adds the camera only when permitted`() {
        assertThat(resolve(OngoingActivityKind.Call, video = true).mask).isEqualTo(PHONE_CALL or MICROPHONE or CAMERA)
        val noCamera = all.copy(camera = false)
        assertThat(resolve(OngoingActivityKind.Call, video = true, permissions = noCamera).mask).isEqualTo(PHONE_CALL or MICROPHONE)
    }

    @Test
    fun `a recording without the microphone permission holds no foreground`() {
        val result = resolve(OngoingActivityKind.Recording, permissions = none)
        assertThat(result.mask).isEqualTo(0)
        assertThat(result.primary).isNull()
    }

    @Test
    fun `each simple kind maps to its type`() {
        assertThat(resolve(OngoingActivityKind.Playback).mask).isEqualTo(MEDIA_PLAYBACK)
        assertThat(resolve(OngoingActivityKind.Outbox).mask).isEqualTo(DATA_SYNC)
        assertThat(resolve(OngoingActivityKind.ScreenShare).mask).isEqualTo(MEDIA_PROJECTION)
    }

    @Test
    fun `combined activities merge their types`() {
        val result = resolve(OngoingActivityKind.Playback, OngoingActivityKind.Outbox)
        assertThat(result.mask).isEqualTo(MEDIA_PLAYBACK or DATA_SYNC)
    }

    @Test
    fun `priority is call then recording then screen share then playback then outbox`() {
        val order = listOf(
            OngoingActivityKind.Call,
            OngoingActivityKind.Recording,
            OngoingActivityKind.ScreenShare,
            OngoingActivityKind.Playback,
            OngoingActivityKind.Outbox,
        )
        order.indices.forEach { i ->
            assertThat(resolve(*order.drop(i).toTypedArray()).primary).isEqualTo(order[i])
        }
    }

    @Test
    fun `the primary skips a kind whose permission is missing`() {
        val result = resolve(OngoingActivityKind.Recording, OngoingActivityKind.Playback, permissions = none)
        assertThat(result.primary).isEqualTo(OngoingActivityKind.Playback)
    }

    @Test
    fun `no activity means no mask`() {
        assertThat(resolve().mask).isEqualTo(0)
    }

    @Test
    fun `constants match the Android service types`() {
        assertThat(listOf(DATA_SYNC, MEDIA_PLAYBACK, PHONE_CALL, MEDIA_PROJECTION, CAMERA, MICROPHONE))
            .containsExactly(1, 2, 4, 32, 64, 128)
    }
}
