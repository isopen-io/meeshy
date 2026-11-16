package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Test

/** MON partage tel que la passerelle le sert (#18389), et la liste de l'appareil qui s'y recale (#18578). */
class SharedLocationOwnTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private val carol = "cccccccccccccccccccccccc"
    private val hour = 3_600_000L

    private fun at(millis: Long): String = Instant.ofEpochMilli(millis).toString()

    private fun served(raw: String): SharedLocationOwnSnapshot? =
        json.decodeFromString(SharedLocationOwnSnapshotWire.serializer(), raw).served(json)

    private fun snapshot(vararg recipients: SharedLocationOwnRecipient) = SharedLocationOwnSnapshot(recipients.toList())

    @Test
    fun `le cliche servi garde qui, a quelle precision et jusqu'a quand, et ecarte une personne illisible`() {
        val snapshot = served(
            """{"recipients":[
                {"userId":" $alice ","precision":"exact","expiresAt":"${at(hour)}"},
                {"userId":"$bob","precision":"galaxie","expiresAt":"${at(2 * hour)}"},
                {"userId":"","precision":"city","expiresAt":"${at(hour)}"},
                {"userId":"$carol","precision":"city","expiresAt":"demain"},
                42
            ]}""",
        )

        assertThat(snapshot?.recipients).containsExactly(
            SharedLocationOwnRecipient(alice, SharedLocationPrecision.EXACT, hour),
            SharedLocationOwnRecipient(bob, SharedLocationPrecision.CITY, 2 * hour),
        ).inOrder()
    }

    @Test
    fun `une reponse sans liste lisible ne dit pas que plus rien n'est partage`() {
        assertThat(served("""{}""")).isNull()
        assertThat(served("""{"recipients":null}""")).isNull()
        assertThat(served("""{"recipients":[]}""")?.recipients).isEmpty()
    }

    @Test
    fun `la liste servie remplace la mienne, ajout et prolongation faits ailleurs compris`() {
        val mine = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)
            .adding(bob, SharedLocationPrecision.EXACT, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)

        val next = mine.withServed(
            snapshot(
                SharedLocationOwnRecipient(alice.uppercase(), SharedLocationPrecision.EXACT, 8 * hour),
                SharedLocationOwnRecipient(carol, SharedLocationPrecision.NEIGHBORHOOD, 2 * hour),
            ),
            nowMillis = 10L,
        )

        assertThat(next.entry(alice)).isEqualTo(SharedLocationRoster.Entry(SharedLocationPrecision.EXACT, 8 * hour))
        assertThat(next.entry(bob)).isNull()
        assertThat(next.entry(carol)).isEqualTo(SharedLocationRoster.Entry(SharedLocationPrecision.NEIGHBORHOOD, 2 * hour))
        assertThat(next.hasPendingWithdrawals).isFalse()
    }

    @Test
    fun `un retrait en attente d'ici gagne tant que la passerelle sert encore la personne, et s'eteint ensuite`() {
        val mine = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)
            .adding(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)
            .withdrawing(bob, nowMillis = 0L)
        val stillServed = snapshot(
            SharedLocationOwnRecipient(alice, SharedLocationPrecision.CITY, hour),
            SharedLocationOwnRecipient(bob, SharedLocationPrecision.CITY, hour),
        )

        val kept = mine.withServed(stillServed, nowMillis = 10L)
        assertThat(kept.entry(bob)).isNull()
        assertThat(kept.isWithdrawalPending(bob)).isTrue()

        val solded = kept.withServed(snapshot(SharedLocationOwnRecipient(alice, SharedLocationPrecision.CITY, hour)), nowMillis = 20L)
        assertThat(solded.isWithdrawalPending(bob)).isFalse()
        assertThat(solded.hasPendingWithdrawals).isFalse()
    }

    @Test
    fun `une personne servie deja echue ou a l'identifiant illisible n'entre pas`() {
        val next = SharedLocationRoster.EMPTY.withServed(
            snapshot(
                SharedLocationOwnRecipient(alice, SharedLocationPrecision.CITY, hour),
                SharedLocationOwnRecipient("pas-un-identifiant", SharedLocationPrecision.CITY, 2 * hour),
            ),
            nowMillis = hour,
        )

        assertThat(next.isEmpty).isTrue()
    }

    @Test
    fun `une passerelle qui ne sert plus rien vide la liste`() {
        val mine = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)

        assertThat(mine.withServed(snapshot(), nowMillis = 10L)).isEqualTo(SharedLocationRoster.EMPTY)
    }
}
