package me.meeshy.sdk.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.relation.SharedLocationOwnRecipient
import me.meeshy.sdk.model.relation.SharedLocationOwnSnapshot
import me.meeshy.sdk.model.relation.SharedLocationPointReplacement
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.model.relation.SharedLocationSendOutcome
import me.meeshy.sdk.model.relation.SharedLocationShareDuration
import me.meeshy.sdk.model.relation.SharedLocationSource
import me.meeshy.sdk.model.relation.SharedLocationStartVerdict
import org.junit.Test

/**
 * UNE RÉPONSE NOMME LE PARTAGE MONTRÉ (#20249, moitié Android, iso #20345 du web) : « Montrer ta position réelle ? » vaut
 * pour le partage montré ; entre la relecture de la réponse et l'envoi, un autre appareil du compte peut encore démarrer.
 * Sur `acceptsExpectedStart`, le remplacement porte `expectedStartedAt` ; sur `STARTED_ELSEWHERE` (ou `INVALID` d'une charge
 * partie avec la clé), rien n'a été écrit : l'appareil relit et redemande, sans jamais renvoyer sans la clé.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SharedLocationSharingExpectedStartTest {

    private val alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private val hour = 3_600_000L
    private val shown = "2026-11-22T10:00:00.000Z"
    private val elsewhere = "2026-11-22T10:05:00.000Z"

    private fun chosenPoint(startedAt: String? = shown, accepts: Boolean = true) = SharedLocationOwnSnapshot(
        listOf(SharedLocationOwnRecipient(alice, SharedLocationPrecision.CITY, 8 * hour)),
        startedAt = startedAt,
        source = SharedLocationSource.MANUAL,
        acceptsExpectedStart = accepts,
    )

    private fun asked(startedAt: String? = shown) = SharedLocationPointReplacement(startedAt, setOf(alice))

    private suspend fun SharingDevice.answer(replacing: SharedLocationPointReplacement = asked()) =
        center.share(bob, SharedLocationPrecision.EXACT, SharedLocationShareDuration.ONE_HOUR, replacing = replacing)

    private suspend fun SharingDevice.showing(snapshot: SharedLocationOwnSnapshot) {
        servedSnapshot = snapshot
        center.sync()
    }

    @Test
    fun `la reponse nomme le partage montre, tel que servi`() = runTest {
        val device = SharingDevice(this)
        runCurrent()
        device.showing(chosenPoint())

        val problem = device.answer()
        runCurrent()

        assertThat(problem).isNull()
        assertThat(device.starts.single().wire()["expectedStartedAt"]).isEqualTo(shown)
        assertThat(device.starts.single().wire()["source"]).isEqualTo("device")
    }

    @Test
    fun `une passerelle qui n'annonce pas la cle recoit la charge d'avant`() = runTest {
        val device = SharingDevice(this)
        runCurrent()
        device.showing(chosenPoint(accepts = false))

        assertThat(device.answer()).isNull()
        runCurrent()

        assertThat(device.starts.single().wire()).doesNotContainKey("expectedStartedAt")
        assertThat(device.starts.single().wire()["source"]).isEqualTo("device")
    }

    @Test
    fun `un demarrage servi sous une autre forme ne se nomme pas, il serait refuse en boucle`() = runTest {
        val device = SharingDevice(this)
        runCurrent()
        device.showing(chosenPoint(startedAt = "hier"))

        assertThat(device.answer(asked(startedAt = "hier"))).isNull()
        runCurrent()

        assertThat(device.starts.single().wire()).doesNotContainKey("expectedStartedAt")
    }

    @Test
    fun `un point relance ailleurs avant l'envoi fait reposer la question a jour, rien d'autre ne part`() = runTest {
        val device = SharingDevice(this)
        runCurrent()
        device.showing(chosenPoint())
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.STARTED_ELSEWHERE)
        device.onStart = { device.servedSnapshot = chosenPoint(startedAt = elsewhere) }

        val problem = device.answer()

        assertThat(problem).isEqualTo(SharedLocationShareProblem.ReplacesChosenPoint(asked(startedAt = elsewhere)))
        assertThat(device.starts).hasSize(1)
        assertThat(device.starts.single().wire()["expectedStartedAt"]).isEqualTo(shown)
        assertThat(device.center.roster.value.entry(bob)).isNull()
        assertThat(device.center.roster.value.isFixedPoint).isTrue()
    }

    @Test
    fun `un partage repris ailleurs par la position d'un appareil ne se relance pas, la decision prise ailleurs tient`() = runTest {
        val device = SharingDevice(this)
        runCurrent()
        device.showing(chosenPoint())
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.STARTED_ELSEWHERE)
        device.onStart = { device.servedSnapshot = chosenPoint(startedAt = elsewhere).copy(source = SharedLocationSource.DEVICE) }

        val problem = device.answer()
        runCurrent()

        assertThat(problem).isEqualTo(SharedLocationShareProblem.Refused(SharedLocationSendOutcome.STARTED_ELSEWHERE))
        assertThat(device.starts).hasSize(1)
        assertThat(device.center.roster.value.entry(bob)).isNull()
        assertThat(device.updates).isEmpty()
    }

    @Test
    fun `un partage arrete ailleurs depuis la question ne se relance pas`() = runTest {
        val device = SharingDevice(this)
        runCurrent()
        device.showing(chosenPoint())
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.STARTED_ELSEWHERE)
        device.onStart = { device.servedSnapshot = SharedLocationOwnSnapshot(emptyList(), acceptsExpectedStart = true) }

        val problem = device.answer()
        runCurrent()

        assertThat(problem).isEqualTo(SharedLocationShareProblem.Refused(SharedLocationSendOutcome.STARTED_ELSEWHERE))
        assertThat(device.starts).hasSize(1)
        assertThat(device.center.roster.value.hasRecipients).isFalse()
    }

    @Test
    fun `une passerelle revenue en arriere qui refuse la cle fait relire et redemander, jamais renvoyer sans elle`() = runTest {
        val device = SharingDevice(this)
        runCurrent()
        device.showing(chosenPoint())
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.INVALID)
        device.onStart = { device.servedSnapshot = chosenPoint(accepts = false) }

        val problem = device.answer()

        assertThat(problem).isEqualTo(SharedLocationShareProblem.ReplacesChosenPoint(asked()))
        assertThat(device.starts).isNotEmpty()
        assertThat(device.starts.all { it.wire()["expectedStartedAt"] == shown }).isTrue()

        val sent = device.starts.size
        device.onStart = null
        device.startVerdict = SharedLocationStartVerdict.Started(8 * hour, startedAt = elsewhere)
        assertThat(device.answer()).isNull()
        runCurrent()

        assertThat(device.starts.drop(sent).single().wire()).doesNotContainKey("expectedStartedAt")
    }

    @Test
    fun `un refus INVALID qui ne met pas la cle en cause se dit, sans reposer la meme question`() = runTest {
        val device = SharingDevice(this)
        runCurrent()
        device.showing(chosenPoint())
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.INVALID)

        val problem = device.answer()

        assertThat(problem).isEqualTo(SharedLocationShareProblem.Refused(SharedLocationSendOutcome.INVALID))
        assertThat(device.starts.all { it.wire()["expectedStartedAt"] == shown }).isTrue()
    }

    @Test
    fun `un INVALID d'une charge partie sans la cle ne fait rien relire`() = runTest {
        val device = SharingDevice(this)
        runCurrent()
        device.showing(chosenPoint(accepts = false))
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.INVALID)
        device.onStart = { device.servedSnapshot = chosenPoint(startedAt = elsewhere) }
        val readsBefore = device.reads

        val problem = device.answer()

        assertThat(problem).isEqualTo(SharedLocationShareProblem.Refused(SharedLocationSendOutcome.INVALID))
        assertThat(device.reads).isEqualTo(readsBefore + 1)
    }

    @Test
    fun `une relecture en panne apres le refus n'envoie rien de plus et le dit`() = runTest {
        val device = SharingDevice(this)
        runCurrent()
        device.showing(chosenPoint())
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.STARTED_ELSEWHERE)
        device.onStart = { device.servedFailure = IllegalStateException("hors ligne") }

        val problem = device.answer()

        assertThat(problem).isEqualTo(SharedLocationShareProblem.Refused(SharedLocationSendOutcome.OFFLINE))
        assertThat(device.starts).hasSize(1)
        device.endOutage()
    }

    private val publishedHere = "2026-11-22T09:00:00.000Z"

    /** Un appareil qui a gardé le démarrage qu'il a publié avant que le point choisi soit posé ailleurs. */
    private fun deviceThatPublished(scope: TestScope) =
        SharingDevice(scope, startMarks = mutableMapOf("me" to publishedHere))

    @Test
    fun `un refus STARTED_ELSEWHERE n'a rien ecrit, le demarrage garde d'ici tient`() = runTest {
        val device = deviceThatPublished(this)
        runCurrent()
        device.showing(chosenPoint())
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.STARTED_ELSEWHERE)
        device.onStart = { device.servedSnapshot = chosenPoint(startedAt = elsewhere).copy(source = SharedLocationSource.DEVICE) }

        device.answer()
        runCurrent()

        assertThat(device.startMarks["me"]).isEqualTo(publishedHere)
    }

    @Test
    fun `un refus FIXED_POINT n'a rien ecrit, le demarrage garde d'ici tient`() = runTest {
        val device = deviceThatPublished(this)
        runCurrent()
        device.showing(chosenPoint())
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.FIXED_POINT)

        device.answer()
        runCurrent()

        assertThat(device.startMarks["me"]).isEqualTo(publishedHere)
    }

    @Test
    fun `un refus INVALID d'une charge partie avec la cle n'a rien ecrit, le demarrage garde d'ici tient`() = runTest {
        val device = deviceThatPublished(this)
        runCurrent()
        device.showing(chosenPoint())
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.INVALID)
        device.onStart = { device.servedSnapshot = chosenPoint(accepts = false) }

        device.answer()
        runCurrent()

        assertThat(device.startMarks["me"]).isEqualTo(publishedHere)
    }

    @Test
    fun `un refus douteux oublie encore le demarrage garde, la passerelle a pu prendre l'envoi`() = runTest {
        val device = deviceThatPublished(this)
        runCurrent()
        device.showing(chosenPoint())
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.UNAVAILABLE)

        device.answer()
        runCurrent()

        assertThat(device.startMarks["me"]).isNull()
    }
}
