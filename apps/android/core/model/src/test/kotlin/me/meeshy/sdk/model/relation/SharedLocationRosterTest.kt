package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SharedLocationRosterTest {

    private val alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private val hour = 3_600_000L

    @Test
    fun `chaque personne garde son echeance et le serveur recoit la duree qui couvre la plus lointaine`() {
        val roster = SharedLocationRoster.EMPTY
            .adding(alice.uppercase(), SharedLocationPrecision.EXACT, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)
            .adding(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.EIGHT_HOURS, nowMillis = 0L)

        assertThat(roster.entry(alice)).isEqualTo(SharedLocationRoster.Entry(SharedLocationPrecision.EXACT, hour))
        assertThat(roster.nextDeadlineMillis).isEqualTo(hour)
        assertThat(roster.serverDuration(nowMillis = 0L)).isEqualTo(SharedLocationShareDuration.EIGHT_HOURS)
        assertThat(roster.removing(bob).serverDuration(nowMillis = 0L)).isEqualTo(SharedLocationShareDuration.ONE_HOUR)
        assertThat(roster.recipients).containsExactly(
            SharedLocationRecipient(alice, SharedLocationPrecision.EXACT),
            SharedLocationRecipient(bob, SharedLocationPrecision.CITY),
        ).inOrder()
    }

    @Test
    fun `une echeance passee sort de la liste`() {
        val roster = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.EXACT, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)
            .adding(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.EIGHT_HOURS, nowMillis = 0L)

        val pruned = roster.pruned(nowMillis = hour)

        assertThat(pruned.entry(alice)).isNull()
        assertThat(pruned.entry(bob)).isNotNull()
        assertThat(roster.pruned(nowMillis = 8 * hour).isEmpty).isTrue()
    }

    @Test
    fun `la liste gardee ne porte que des identifiants des precisions et des echeances et se relit`() {
        val roster = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.NEIGHBORHOOD, SharedLocationShareDuration.ONE_HOUR, nowMillis = 10L)

        val stored = roster.stored()

        assertThat(stored).doesNotContain("latitude")
        assertThat(SharedLocationRoster.fromStored(stored)).isEqualTo(roster)
    }

    @Test
    fun `une liste gardee illisible ou une precision inconnue ne rouvre jamais plus que la ville`() {
        assertThat(SharedLocationRoster.fromStored(null)).isEqualTo(SharedLocationRoster.EMPTY)
        assertThat(SharedLocationRoster.fromStored("{pas du json")).isEqualTo(SharedLocationRoster.EMPTY)
        val future = """{"entries":{"$alice":{"precision":"street","untilMillis":42}}}"""
        assertThat(SharedLocationRoster.fromStored(future).entry(alice))
            .isEqualTo(SharedLocationRoster.Entry(SharedLocationPrecision.CITY, 42L))
    }
}
