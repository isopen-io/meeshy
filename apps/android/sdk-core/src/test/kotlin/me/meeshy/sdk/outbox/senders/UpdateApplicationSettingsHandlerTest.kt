package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AppThemeMode
import me.meeshy.sdk.model.ApplicationPreferenceSyncBody
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class UpdateApplicationSettingsHandlerTest {

    private val api = mockk<PreferencesApi>()
    private val handler = UpdateApplicationSettingsHandler(api, senderJson)

    private fun row() = outboxRow(
        OutboxKind.UPDATE_APPLICATION_SETTINGS,
        payload = senderJson.encodeToString(ApplicationPreferenceSyncBody.serializer(), ApplicationPreferenceSyncBody(AppThemeMode.DARK)),
    )

    private fun refusal(status: Int) = HttpException(Response.error<Unit>(status, "{}".toResponseBody()))

    @Test
    fun `un envoi accepté réussit et porte le thème de la ligne`() = runTest {
        coEvery { api.updateApplication(ApplicationPreferenceSyncBody(AppThemeMode.DARK)) } returns accepted(Unit)
        assertThat(handler.send(row())).isEqualTo(SendResult.Success)
    }

    @Test
    fun `un refus de validation échoue pour de bon`() = runTest {
        coEvery { api.updateApplication(any()) } throws refusal(400)
        assertThat(handler.send(row())).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `un délai, une limite ou une panne serveur se rejouent`() = runTest {
        listOf(401, 408, 429, 503).forEach { status ->
            coEvery { api.updateApplication(any()) } throws refusal(status)
            assertThat(handler.send(row())).isEqualTo(SendResult.TransientFailure)
        }
    }
}
