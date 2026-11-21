package me.meeshy.sdk.phonecall

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.phonecall.PhoneCallAckWire
import me.meeshy.sdk.model.phonecall.PhoneCallEmitterSettingsBody
import me.meeshy.sdk.model.phonecall.PhoneCallEmitterSettingsWire
import me.meeshy.sdk.model.phonecall.PhoneCallPersonSettingsBody
import me.meeshy.sdk.model.phonecall.PhoneCallPersonSettingsWire
import me.meeshy.sdk.model.phonecall.PhoneCallReportBody
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

/** Les réglages et le rapport d'« en appel » (#18753) : interrupteur global optimiste, partage par personne, rapport au changement. */
class PhoneCallSettingsRepositoryTest {
    private fun refused() = NetworkResult.Failure(ApiError("refusé", code = "PHONE_CALL_UNAVAILABLE", httpStatus = 503))

    private fun repository(
        setEmitter: suspend (PhoneCallEmitterSettingsBody) -> NetworkResult<PhoneCallEmitterSettingsWire> =
            { NetworkResult.Success(PhoneCallEmitterSettingsWire(it.sharingEnabled)) },
        setPerson: suspend (String, PhoneCallPersonSettingsBody) -> NetworkResult<PhoneCallPersonSettingsWire> =
            { _, _ -> NetworkResult.Success(PhoneCallPersonSettingsWire()) },
        level: String? = "BLOOD",
    ) = PhoneCallSettingsRepository(
        PhoneCallSettingsCalls(
            emitter = { NetworkResult.Success(PhoneCallEmitterSettingsWire(sharingEnabled = true)) },
            setEmitter = setEmitter,
            person = { NetworkResult.Success(PhoneCallPersonSettingsWire("u2", shared = true)) },
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

        val sent = mutableListOf<PhoneCallEmitterSettingsBody>()
        val accepting = repository(setEmitter = { sent += it; NetworkResult.Success(PhoneCallEmitterSettingsWire(it.sharingEnabled)) })
        assertThat(accepting.setSharing(false)).isTrue()
        assertThat(accepting.sharingEnabled.value).isFalse()
        assertThat(sent).containsExactly(PhoneCallEmitterSettingsBody(false))
    }

    @Test
    fun `la fiche d'une personne porte son niveau et ce que je lui partage`() = runTest {
        assertThat(repository(level = "BLOOD").personSettings("u2")).isEqualTo(PhoneCallPersonSettings(RelationLevel.BLOOD, shared = true))
    }

    @Test
    fun `le partage par personne part seul et dit si la passerelle l'a pris`() = runTest {
        val sent = mutableListOf<Pair<String, PhoneCallPersonSettingsBody>>()
        val repo = repository(setPerson = { id, body -> sent += id to body; NetworkResult.Success(PhoneCallPersonSettingsWire()) })
        assertThat(repo.setShared("u2", false)).isTrue()
        assertThat(sent).containsExactly("u2" to PhoneCallPersonSettingsBody(shared = false))
        assertThat(repository(setPerson = { _, _ -> refused() }).setShared("u2", false)).isFalse()
    }

    @Test
    fun `le changement de compte oublie le reglage global`() = runTest {
        val repo = repository()
        repo.loadSharing()
        repo.clear()
        assertThat(repo.sharingEnabled.value).isNull()
    }

    private class ReporterHarness {
        var inCall: Boolean? = false
        var signedIn = true
        var sharing: Boolean? = true
        var accept = true
        val sent = mutableListOf<PhoneCallReportBody>()
        val reporter = PhoneCallReporter(
            PhoneCallReporterPorts(
                reader = DeviceCallReader { inCall },
                send = { body -> sent += body; if (accept) NetworkResult.Success(PhoneCallAckWire(tracked = true)) else NetworkResult.Failure(ApiError("x")) },
                signedIn = { signedIn },
                sharingEnabled = { sharing },
            ),
        )
    }

    @Test
    fun `un rapport ne part qu'au changement de valeur, et le premier toujours`() = runTest {
        val h = ReporterHarness()
        assertThat(h.reporter.report()).isTrue()
        assertThat(h.reporter.report()).isFalse()
        h.inCall = true
        assertThat(h.reporter.report()).isTrue()
        assertThat(h.reporter.report()).isFalse()
        h.inCall = false
        assertThat(h.reporter.report()).isTrue()
        assertThat(h.sent.map { it.active }).containsExactly(false, true, false).inOrder()
    }

    @Test
    fun `un rapport refuse n'est pas retenu, le suivant repart`() = runTest {
        val h = ReporterHarness()
        h.inCall = true
        h.accept = false
        assertThat(h.reporter.report()).isFalse()
        h.accept = true
        assertThat(h.reporter.report()).isTrue()
        assertThat(h.sent.map { it.active }).containsExactly(true, true).inOrder()
    }

    @Test
    fun `rien ne part hors session, partage coupe ou mode illisible, et rouvrir le partage rapporte de nouveau`() = runTest {
        val h = ReporterHarness()
        h.inCall = true
        h.signedIn = false
        assertThat(h.reporter.report()).isFalse()
        h.signedIn = true
        h.inCall = null
        assertThat(h.reporter.report()).isFalse()
        h.inCall = true
        assertThat(h.reporter.report()).isTrue()
        h.sharing = false
        assertThat(h.reporter.report()).isFalse()
        h.sharing = true
        assertThat(h.reporter.report()).isTrue()
        assertThat(h.sent.map { it.active }).containsExactly(true, true).inOrder()
    }

    @Test
    fun `le changement de compte oublie le dernier rapport`() = runTest {
        val h = ReporterHarness()
        h.reporter.report()
        h.reporter.clear()
        assertThat(h.reporter.report()).isTrue()
        assertThat(h.sent).hasSize(2)
    }
}
