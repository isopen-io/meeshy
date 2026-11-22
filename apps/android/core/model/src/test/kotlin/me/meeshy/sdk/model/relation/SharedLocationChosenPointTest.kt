package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Un POINT CHOISI à la main par un autre appareil du compte (#20212, iso #20087 iOS et #20126 web) : la source servie se
 * lit, la liste s'en souvient, et la position réelle ne le remplace qu'avec `source: 'device'`.
 */
class SharedLocationChosenPointTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val hour = 3_600_000L
    private val paris = SharedLocationFix.of(48.8566, 2.3522, 12.0)!!

    private fun at(millis: Long): String = Instant.ofEpochMilli(millis).toString()

    private fun served(source: String?): SharedLocationOwnSnapshot? {
        val key = source?.let { ""","source":$it""" } ?: ""
        val raw = """{"recipients":[{"userId":"$alice","precision":"city","expiresAt":"${at(hour)}"}]$key}"""
        return json.decodeFromString(SharedLocationOwnSnapshotWire.serializer(), raw).served(json)
    }

    private fun mine(): SharedLocationRoster =
        SharedLocationRoster.EMPTY.adding(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)

    @Test
    fun `la source servie se lit, inconnue elle vaut un point choisi, absente elle n'est pas dite`() {
        assertThat(served("\"device\"")?.source).isEqualTo(SharedLocationSource.DEVICE)
        assertThat(served("\"manual\"")?.source).isEqualTo(SharedLocationSource.MANUAL)
        assertThat(served("\"satellite\"")?.source).isEqualTo(SharedLocationSource.MANUAL)
        assertThat(served("42")?.source).isEqualTo(SharedLocationSource.MANUAL)
        assertThat(served(null)?.source).isNull()
        assertThat(served("null")?.source).isNull()
    }

    @Test
    fun `la liste suit la source servie, et une passerelle qui ne la dit pas ne change rien`() {
        val pointed = mine().withServed(served("\"manual\"")!!, nowMillis = 0L)
        assertThat(pointed.isFixedPoint).isTrue()
        assertThat(pointed.withServed(served(null)!!, nowMillis = 0L).isFixedPoint).isTrue()
        assertThat(pointed.withServed(served("\"device\"")!!, nowMillis = 0L).isFixedPoint).isFalse()
        assertThat(mine().withServed(served(null)!!, nowMillis = 0L).isFixedPoint).isFalse()
    }

    @Test
    fun `le point choisi survit aux operations de la liste et a un lancement, jamais sans personne`() {
        val pointed = mine().withFixedPoint(true)
        assertThat(pointed.pruned(nowMillis = 0L).isFixedPoint).isTrue()
        assertThat(pointed.settled().isFixedPoint).isTrue()
        assertThat(pointed.withdrawing(alice, nowMillis = 0L).isFixedPoint).isFalse()
        assertThat(SharedLocationRoster.fromStored(pointed.stored()).isFixedPoint).isTrue()
        assertThat(SharedLocationRoster.fromStored(mine().stored()).isFixedPoint).isFalse()
        assertThat(SharedLocationRoster.EMPTY.withFixedPoint(true).isFixedPoint).isFalse()
        assertThat(pointed).isNotEqualTo(mine())
        assertThat(mine().union(pointed).isFixedPoint).isTrue()
    }

    @Test
    fun `la derniere personne en retrait en attente ne fait pas oublier le point a la suivante`() {
        val withdrawn = mine().withFixedPoint(true).withdrawing(alice, nowMillis = 0L)
        val bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
        assertThat(withdrawn.isFixedPoint).isFalse()
        assertThat(withdrawn.adding(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L).isFixedPoint).isTrue()
        assertThat(SharedLocationRoster.EMPTY.withFixedPoint(true).adding(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, 0L).isFixedPoint).isFalse()
    }

    @Test
    fun `un point choisi qui n'a pas pu se remplacer se lit comme tel`() {
        assertThat(SharedLocationSendOutcome.ofRefusal("SHARED_LOCATION_FIXED_POINT")).isEqualTo(SharedLocationSendOutcome.FIXED_POINT)
    }

    @Test
    fun `seul un demarrage avec position qui remplace le point porte la source de l'appareil`() {
        val recipients = listOf(SharedLocationRecipient(alice, SharedLocationPrecision.CITY))
        val replacing = SharedLocationStartRequest.of(recipients, SharedLocationShareDuration.ONE_HOUR, paris, replacesChosenPoint = true)!!
        assertThat(replacing.wire()["source"]).isEqualTo("device")
        assertThat(replacing.withoutDeadlines().wire()["source"]).isEqualTo("device")
        assertThat(SharedLocationStartRequest.of(recipients, SharedLocationShareDuration.ONE_HOUR, paris)!!.wire()).doesNotContainKey("source")
        assertThat(SharedLocationStartRequest.listOnly(recipients, SharedLocationShareDuration.ONE_HOUR)!!.wire()).doesNotContainKey("source")
    }
}
