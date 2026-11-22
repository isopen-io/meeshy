package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * UNE RÉPONSE NOMME LE PARTAGE MONTRÉ (#20249, moitié Android, iso #20345 du web) : la passerelle annonce
 * `acceptsExpectedStart`, le remplacement d'un point choisi porte `expectedStartedAt`, et le refus
 * `SHARED_LOCATION_STARTED_ELSEWHERE` se lit comme tel.
 */
class SharedLocationExpectedStartTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val paris = SharedLocationFix.of(48.8566, 2.3522, 12.0)!!
    private val shown = "2026-11-22T10:00:00.000Z"
    private val recipients = listOf(SharedLocationRecipient(alice, SharedLocationPrecision.CITY, expiresInSeconds = 600))

    private fun served(accepts: String?): SharedLocationOwnSnapshot? {
        val key = accepts?.let { ""","acceptsExpectedStart":$it""" } ?: ""
        val raw = """{"recipients":[]$key}"""
        return json.decodeFromString(SharedLocationOwnSnapshotWire.serializer(), raw).served(json)
    }

    @Test
    fun `seule l'annonce vraie se lit, toute autre valeur vaut absente`() {
        assertThat(served("true")?.acceptsExpectedStart).isTrue()
        assertThat(served("false")?.acceptsExpectedStart).isFalse()
        assertThat(served("\"true\"")?.acceptsExpectedStart).isFalse()
        assertThat(served("1")?.acceptsExpectedStart).isFalse()
        assertThat(served("null")?.acceptsExpectedStart).isFalse()
        assertThat(served(null)?.acceptsExpectedStart).isFalse()
    }

    @Test
    fun `le remplacement d'un point choisi nomme le partage montre, et le repli sans echeances le garde`() {
        val request = SharedLocationStartRequest.of(
            recipients, SharedLocationShareDuration.ONE_HOUR, paris, replacesChosenPoint = true, expectedStartedAt = shown,
        )!!

        assertThat(request.wire()["expectedStartedAt"]).isEqualTo(shown)
        assertThat(request.wire()["source"]).isEqualTo("device")
        assertThat(request.carriesExpectedStart).isTrue()
        assertThat(request.withoutDeadlines().wire()["expectedStartedAt"]).isEqualTo(shown)
    }

    @Test
    fun `sans remplacement ou sans nom, la cle ne part jamais`() {
        val ordinary = SharedLocationStartRequest.of(recipients, SharedLocationShareDuration.ONE_HOUR, paris, expectedStartedAt = shown)!!
        val unnamed = SharedLocationStartRequest.of(recipients, SharedLocationShareDuration.ONE_HOUR, paris, replacesChosenPoint = true)!!
        val listOnly = SharedLocationStartRequest.listOnly(recipients, SharedLocationShareDuration.ONE_HOUR)!!

        assertThat(ordinary.wire()).doesNotContainKey("expectedStartedAt")
        assertThat(ordinary.carriesExpectedStart).isFalse()
        assertThat(unnamed.wire()).doesNotContainKey("expectedStartedAt")
        assertThat(listOnly.wire()).doesNotContainKey("expectedStartedAt")
    }

    @Test
    fun `seul un instant tel que la passerelle l'ecrit se nomme, sinon il serait refuse en boucle`() {
        assertThat(SharedLocationWireInstant.isWire(shown)).isTrue()
        assertThat(SharedLocationWireInstant.isWire("2026-11-22T10:00:00Z")).isTrue()
        assertThat(SharedLocationWireInstant.isWire("2026-11-22T10:00:00+01:00")).isFalse()
        assertThat(SharedLocationWireInstant.isWire("2026-13-45T10:00:00.000Z")).isFalse()
        assertThat(SharedLocationWireInstant.isWire("demain")).isFalse()
        assertThat(SharedLocationWireInstant.isWire(null)).isFalse()
    }

    @Test
    fun `un partage lance ailleurs depuis la question se lit comme tel`() {
        assertThat(SharedLocationSendOutcome.ofRefusal("SHARED_LOCATION_STARTED_ELSEWHERE"))
            .isEqualTo(SharedLocationSendOutcome.STARTED_ELSEWHERE)
    }
}
