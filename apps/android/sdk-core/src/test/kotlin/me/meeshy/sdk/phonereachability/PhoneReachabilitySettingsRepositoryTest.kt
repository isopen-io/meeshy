package me.meeshy.sdk.phonereachability

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.phonereachability.PhoneAliveResultWire
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityEmitterSettings
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityPersonSettingsBody
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityPersonSettingsWire
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

/** Les réglages du téléphone injoignable (#18737) : interrupteur global optimiste, partage par personne, signe de vie. */
class PhoneReachabilitySettingsRepositoryTest {
    private fun refused() = NetworkResult.Failure(ApiError("refusé", code = "PHONE_REACHABILITY_UNAVAILABLE", httpStatus = 503))

    private fun repository(
        setEmitter: suspend (PhoneReachabilityEmitterSettings) -> NetworkResult<PhoneReachabilityEmitterSettings> = { NetworkResult.Success(it) },
        setPerson: suspend (String, PhoneReachabilityPersonSettingsBody) -> NetworkResult<PhoneReachabilityPersonSettingsWire> =
            { _, _ -> NetworkResult.Success(PhoneReachabilityPersonSettingsWire()) },
        level: String? = "BLOOD",
    ) = PhoneReachabilitySettingsRepository(
        PhoneReachabilitySettingsCalls(
            emitter = { NetworkResult.Success(PhoneReachabilityEmitterSettings(sharingEnabled = true)) },
            setEmitter = setEmitter,
            person = { NetworkResult.Success(PhoneReachabilityPersonSettingsWire("u2", shared = false)) },
            setPerson = setPerson,
            level = { level },
        ),
    )

    @Test
    fun `couper le partage global est optimiste et revient en arriere sur un refus`() = runTest {
        val repo = repository(setEmitter = { refused() })
        repo.loadSharing()
        assertThat(repo.setSharing(false)).isFalse()
        assertThat(repo.sharingEnabled.value).isTrue()

        val accepting = repository()
        assertThat(accepting.setSharing(false)).isTrue()
        assertThat(accepting.sharingEnabled.value).isFalse()
    }

    @Test
    fun `la fiche d'une personne porte son niveau et ce que je lui partage`() = runTest {
        assertThat(repository(level = "CLOSE").personSettings("u2"))
            .isEqualTo(PhoneReachabilityPersonSettings(RelationLevel.CLOSE, shared = false))
    }

    @Test
    fun `le partage par personne part seul et dit si la passerelle l'a pris`() = runTest {
        val sent = mutableListOf<Pair<String, PhoneReachabilityPersonSettingsBody>>()
        val repo = repository(setPerson = { id, body -> sent += id to body; NetworkResult.Success(PhoneReachabilityPersonSettingsWire()) })
        assertThat(repo.setShared("u2", true)).isTrue()
        assertThat(sent).containsExactly("u2" to PhoneReachabilityPersonSettingsBody(shared = true))
        assertThat(repository(setPerson = { _, _ -> refused() }).setShared("u2", true)).isFalse()
    }

    @Test
    fun `le changement de compte oublie l'interrupteur global`() = runTest {
        val repo = repository()
        repo.loadSharing()
        repo.clear()
        assertThat(repo.sharingEnabled.value).isNull()
    }

    @Test
    fun `le signe de vie dit si la passerelle l'a recu, sans jamais lever`() = runTest {
        assertThat(PhoneAliveReporter { NetworkResult.Success(PhoneAliveResultWire(tracked = true)) }.reportAlive()).isTrue()
        assertThat(PhoneAliveReporter { refused() }.reportAlive()).isFalse()
        assertThat(PhoneAliveReporter { error("boum") }.reportAlive()).isFalse()
    }
}
