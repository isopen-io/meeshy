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

    @Test
    fun `l'union garde toutes les personnes que le serveur peut servir et la plus recente l'emporte`() {
        val previous = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)
            .adding(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)
        val next = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.EXACT, SharedLocationShareDuration.EIGHT_HOURS, nowMillis = 0L)

        val union = previous.union(next)

        assertThat(union.entry(bob)).isNotNull()
        assertThat(union.entry(alice)).isEqualTo(SharedLocationRoster.Entry(SharedLocationPrecision.EXACT, 8 * hour))
    }

    @Test
    fun `un retrait en attente ne garde que l'identifiant jusqu'au plus long terme serveur et se relit`() {
        val roster = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.EXACT, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)
            .withdrawing(alice, nowMillis = 0L)

        assertThat(roster.entry(alice)).isNull()
        assertThat(roster.hasRecipients).isFalse()
        assertThat(roster.isEmpty).isFalse()
        assertThat(roster.isSettled(nowMillis = 0L)).isFalse()
        assertThat(roster.pruned(nowMillis = 8 * hour).isEmpty).isTrue()
        assertThat(roster.stored()).doesNotContain("exact")
        assertThat(SharedLocationRoster.fromStored(roster.stored())).isEqualTo(roster)
    }

    @Test
    fun `partager de nouveau efface le retrait et la liste envoyee les solde tous`() {
        val roster = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.EXACT, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)
            .adding(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)
            .withdrawing(alice, nowMillis = 0L)
            .withdrawing(bob, nowMillis = 0L)
            .adding(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)

        assertThat(roster.isWithdrawalPending(alice)).isFalse()
        assertThat(roster.isWithdrawalPending(bob)).isTrue()
        assertThat(roster.settled().hasPendingWithdrawals).isFalse()
        assertThat(roster.settled().entry(alice)).isNotNull()
        assertThat(roster.withdrawing("cccccccccccccccccccccccc", nowMillis = 0L)).isEqualTo(roster)
    }

    @Test
    fun `une liste gardee avant les retraits en attente se relit sans retrait`() {
        val legacy = """{"entries":{"$alice":{"precision":"city","untilMillis":42}}}"""

        val roster = SharedLocationRoster.fromStored(legacy)

        assertThat(roster.entry(alice)).isEqualTo(SharedLocationRoster.Entry(SharedLocationPrecision.CITY, 42L))
        assertThat(roster.hasPendingWithdrawals).isFalse()
    }

    @Test
    fun `chaque personne dont l'echeance tombe avant le terme part avec la sienne, arrondie a la seconde au-dessus`() {
        val roster = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.EXACT, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)
            .adding(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.EIGHT_HOURS, nowMillis = 0L)

        assertThat(roster.deadlinedRecipients(nowMillis = 1_500L)).containsExactly(
            SharedLocationRecipient(alice, SharedLocationPrecision.EXACT, expiresInSeconds = 3_599),
            SharedLocationRecipient(bob, SharedLocationPrecision.CITY, expiresInSeconds = 28_799),
        ).inOrder()
        assertThat(roster.deadlinedRecipients(nowMillis = 0L)).containsExactly(
            SharedLocationRecipient(alice, SharedLocationPrecision.EXACT, expiresInSeconds = 3_600),
            SharedLocationRecipient(bob, SharedLocationPrecision.CITY),
        ).inOrder()
    }

    @Test
    fun `une personne seule n'a pas d'echeance plus proche que le terme qu'elle fixe`() {
        val roster = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.EXACT, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)

        assertThat(roster.deadlinedRecipients(nowMillis = 0L))
            .containsExactly(SharedLocationRecipient(alice, SharedLocationPrecision.EXACT))
    }

    @Test
    fun `une echeance a moins d'une seconde vaut une seconde et une personne echue ne part plus`() {
        val roster = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.EXACT, SharedLocationShareDuration.ONE_HOUR, nowMillis = 0L)
            .adding(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.EIGHT_HOURS, nowMillis = 0L)

        assertThat(roster.deadlinedRecipients(nowMillis = hour - 200L).first().expiresInSeconds).isEqualTo(1)
        assertThat(roster.deadlinedRecipients(nowMillis = hour).map { it.userId }).containsExactly(bob)
    }
}
