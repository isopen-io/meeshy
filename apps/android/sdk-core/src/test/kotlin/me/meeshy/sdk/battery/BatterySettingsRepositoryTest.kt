package me.meeshy.sdk.battery

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.battery.BatteryEmitterSettings
import me.meeshy.sdk.model.battery.BatteryEmitterSettingsBody
import me.meeshy.sdk.model.battery.BatteryPersonSettingsBody
import me.meeshy.sdk.model.battery.BatteryPersonSettingsWire
import me.meeshy.sdk.model.battery.BatteryPullResultWire
import me.meeshy.sdk.model.battery.BatteryReceiveMode
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

/** Les réglages de la batterie des Proches (#14147) : partage optimiste, fiche d'une personne, demande de relevé bornée. */
class BatterySettingsRepositoryTest {
    private fun refused(code: String) = NetworkResult.Failure(ApiError("refusé", code = code, httpStatus = 429))

    private fun repository(
        setEmitter: suspend (BatteryEmitterSettingsBody) -> NetworkResult<BatteryEmitterSettings> = { NetworkResult.Success(BatteryEmitterSettings(it.sharingEnabled)) },
        setPerson: suspend (String, BatteryPersonSettingsBody) -> NetworkResult<BatteryPersonSettingsWire> =
            { _, _ -> NetworkResult.Success(BatteryPersonSettingsWire()) },
        pull: suspend (String) -> NetworkResult<BatteryPullResultWire> =
            { NetworkResult.Success(BatteryPullResultWire("2026-11-15T10:00:00.000Z", episodeOnly = false)) },
        level: String? = "BLOOD",
    ) = BatterySettingsRepository(
        BatterySettingsCalls(
            emitter = { NetworkResult.Success(BatteryEmitterSettings(sharingEnabled = true)) },
            setEmitter = setEmitter,
            person = { NetworkResult.Success(BatteryPersonSettingsWire("u2", shared = true, receive = "critical")) },
            setPerson = setPerson,
            pull = pull,
            level = { level },
        ),
    )

    @Test
    fun `couper le partage est optimiste et revient en arriere sur un refus`() = runTest {
        val repo = repository(setEmitter = { refused("NOPE") })
        repo.loadSharing()
        assertThat(repo.setSharing(false)).isFalse()
        assertThat(repo.sharingEnabled.value).isTrue()

        val accepting = repository()
        assertThat(accepting.setSharing(false)).isTrue()
        assertThat(accepting.sharingEnabled.value).isFalse()
    }

    @Test
    fun `la fiche d'une personne porte son niveau, le partage et le mode de reception`() = runTest {
        val settings = repository(level = "CLOSE").personSettings("u2")
        assertThat(settings).isEqualTo(BatteryPersonSettings(RelationLevel.CLOSE, shared = true, receive = BatteryReceiveMode.CRITICAL))
    }

    @Test
    fun `le mode de reception part sous son nom de fil, seul`() = runTest {
        val sent = mutableListOf<BatteryPersonSettingsBody>()
        repository(setPerson = { _, body -> sent += body; NetworkResult.Success(BatteryPersonSettingsWire()) })
            .setReceive("u2", BatteryReceiveMode.CRITICAL)
        assertThat(sent).containsExactly(BatteryPersonSettingsBody(receive = "critical"))
    }

    @Test
    fun `une demande de releve dit pourquoi elle est refusee`() = runTest {
        assertThat(repository().pull("u2")).isEqualTo(BatteryPullOutcome.Requested(episodeOnly = false))
        assertThat(repository(pull = { refused("BATTERY_PULL_TOO_SOON") }).pull("u2")).isEqualTo(BatteryPullOutcome.TooSoon)
        assertThat(repository(pull = { refused("BATTERY_PULL_FORBIDDEN") }).pull("u2")).isEqualTo(BatteryPullOutcome.Forbidden)
        assertThat(repository(pull = { refused("BATTERY_UNAVAILABLE") }).pull("u2")).isEqualTo(BatteryPullOutcome.Unavailable)
    }
}
