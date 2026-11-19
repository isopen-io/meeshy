package me.meeshy.sdk.fall

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.fall.FallPersonSettingsBody
import me.meeshy.sdk.model.fall.FallPersonSettingsWire
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

/** Le réglage par personne de la chute (#18748) : lu avec le niveau, écrit en `{ shared }` strict, refus rendu. */
class FallSettingsRepositoryTest {
    private val sent = mutableListOf<Pair<String, FallPersonSettingsBody>>()

    private fun repository(accept: Boolean = true) = FallSettingsRepository(
        FallSettingsCalls(
            person = { NetworkResult.Success(FallPersonSettingsWire(it, shared = true)) },
            setPerson = { userId, body ->
                sent += userId to body
                if (accept) NetworkResult.Success(FallPersonSettingsWire(userId, body.shared)) else NetworkResult.Failure(ApiError("refusé", code = "FALL_UNAVAILABLE", httpStatus = 503))
            },
            level = { "BLOOD" },
        ),
    )

    @Test
    fun `le reglage se lit avec le niveau de la relation`() = runTest {
        assertThat(repository().personSettings("u2")).isEqualTo(FallPersonSettings(RelationLevel.BLOOD, shared = true))
    }

    @Test
    fun `l'ecriture part en shared strict, et un refus se dit`() = runTest {
        assertThat(repository().setShared("u2", false)).isTrue()
        assertThat(sent.single()).isEqualTo("u2" to FallPersonSettingsBody(shared = false))
        assertThat(repository(accept = false).setShared("u2", true)).isFalse()
    }
}
