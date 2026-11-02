package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.audio.AudioPreferencesSyncRepository
import me.meeshy.sdk.model.AudioPreferenceSyncBody
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class UpdateAudioSettingsHandlerTest {

    private val api = mockk<PreferencesApi>()
    private val sync = mockk<AudioPreferencesSyncRepository>(relaxed = true)
    private val handler = UpdateAudioSettingsHandler(api, senderJson) { sync }

    private fun row() = outboxRow(
        OutboxKind.UPDATE_AUDIO_SETTINGS,
        payload = senderJson.encodeToString(AudioPreferenceSyncBody.serializer(), AudioPreferenceSyncBody(false)),
    )

    private fun refusal(status: Int) = HttpException(Response.error<Unit>(status, "{}".toResponseBody()))

    @Test
    fun `un envoi accepté réussit et porte la valeur de la ligne`() = runTest {
        coEvery { api.updateAudio(AudioPreferenceSyncBody(false)) } returns accepted(Unit)
        assertThat(handler.send(row())).isEqualTo(SendResult.Success)
    }

    @Test
    fun `un refus de validation échoue pour de bon`() = runTest {
        coEvery { api.updateAudio(any()) } throws refusal(400)
        assertThat(handler.send(row())).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `un jeton expiré, un délai, une limite ou une panne serveur se rejouent`() = runTest {
        listOf(401, 408, 429, 503).forEach { status ->
            coEvery { api.updateAudio(any()) } throws refusal(status)
            assertThat(handler.send(row())).isEqualTo(SendResult.TransientFailure)
        }
    }

    @Test
    fun `un envoi épuisé replace le bloc sur la vérité de la passerelle`() = runTest {
        handler.onExhausted(row())
        coVerify(exactly = 1) { sync.refresh() }
    }
}
