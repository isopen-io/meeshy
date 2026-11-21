package me.meeshy.sdk.inactivity

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.inactivity.InactivityDelayChoice
import me.meeshy.sdk.model.inactivity.InactivityPersonSettingsBody
import me.meeshy.sdk.model.inactivity.InactivityPersonSettingsWire
import me.meeshy.sdk.model.inactivity.WellnessOkResultWire
import me.meeshy.sdk.model.inactivity.WellnessSettingsWire
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

/** Les réglages de la vérification d'inactivité (#18738) : délai optimiste, partage par personne, « Je vais bien ». */
class InactivitySettingsRepositoryTest {
    private fun refused() = NetworkResult.Failure(ApiError("refusé", code = "INACTIVITY_UNAVAILABLE", httpStatus = 503))

    private fun repository(
        setDelay: suspend (InactivityDelayChoice) -> NetworkResult<WellnessSettingsWire> = { NetworkResult.Success(WellnessSettingsWire(it.hours)) },
        setPerson: suspend (String, InactivityPersonSettingsBody) -> NetworkResult<InactivityPersonSettingsWire> =
            { _, _ -> NetworkResult.Success(InactivityPersonSettingsWire()) },
        level: String? = "BLOOD",
    ) = InactivitySettingsRepository(
        InactivitySettingsCalls(
            delay = { NetworkResult.Success(WellnessSettingsWire(12)) },
            setDelay = setDelay,
            person = { NetworkResult.Success(InactivityPersonSettingsWire("u2", shared = true)) },
            setPerson = setPerson,
            level = { level },
        ),
    )

    @Test
    fun `changer le delai est optimiste et revient en arriere sur un refus`() = runTest {
        val repo = repository(setDelay = { refused() })
        repo.loadDelay()
        assertThat(repo.delay.value).isEqualTo(InactivityDelayChoice.TWELVE_HOURS)
        assertThat(repo.setDelay(InactivityDelayChoice.OFF)).isFalse()
        assertThat(repo.delay.value).isEqualTo(InactivityDelayChoice.TWELVE_HOURS)

        val accepting = repository()
        assertThat(accepting.setDelay(InactivityDelayChoice.SIX_HOURS)).isTrue()
        assertThat(accepting.delay.value).isEqualTo(InactivityDelayChoice.SIX_HOURS)
    }

    @Test
    fun `la fiche d'une personne porte son niveau et ce que je lui partage`() = runTest {
        assertThat(repository(level = "BLOOD").personSettings("u2"))
            .isEqualTo(InactivityPersonSettings(RelationLevel.BLOOD, shared = true))
    }

    @Test
    fun `le partage par personne part seul et dit si la passerelle l'a pris`() = runTest {
        val sent = mutableListOf<Pair<String, InactivityPersonSettingsBody>>()
        val repo = repository(setPerson = { id, body -> sent += id to body; NetworkResult.Success(InactivityPersonSettingsWire()) })
        assertThat(repo.setShared("u2", false)).isTrue()
        assertThat(sent).containsExactly("u2" to InactivityPersonSettingsBody(shared = false))
        assertThat(repository(setPerson = { _, _ -> refused() }).setShared("u2", true)).isFalse()
    }

    @Test
    fun `le changement de compte oublie le delai`() = runTest {
        val repo = repository()
        repo.loadDelay()
        repo.clear()
        assertThat(repo.delay.value).isNull()
    }

    @Test
    fun `je vais bien dit si la passerelle l'a recu, sans jamais lever`() = runTest {
        assertThat(WellnessReporter { NetworkResult.Success(WellnessOkResultWire(tracked = true)) }.reportOk()).isTrue()
        assertThat(WellnessReporter { refused() }.reportOk()).isFalse()
        assertThat(WellnessReporter { error("boum") }.reportOk()).isFalse()
    }

    @Test
    fun `une annonce de push ne passe que si une pastille ecoute`() {
        assertThat(InactivityForegroundNotices().offer(InactivityForegroundNotice("n1", "x"))).isFalse()
    }
}
