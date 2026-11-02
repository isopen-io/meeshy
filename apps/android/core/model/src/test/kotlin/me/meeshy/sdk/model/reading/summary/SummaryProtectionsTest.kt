package me.meeshy.sdk.model.reading.summary

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import org.junit.Test

class SummaryProtectionsTest {
    private val now = Instant.parse("2026-10-27T10:00:00Z")

    private fun fact(
        id: String,
        viewOnce: Boolean = false,
        consumed: Boolean = false,
        blurred: Boolean = false,
        ephemeral: Boolean = false,
        expiresAt: Instant? = null,
        deleted: Boolean = false,
        system: Boolean = false,
    ) = SummaryProtectionFacts(id, "Bob", viewOnce, consumed, blurred, ephemeral, expiresAt, deleted, system)

    @Test fun `un message ordinaire n'a aucune entree`() {
        assertThat(SummaryProtections.entries(listOf(fact("m1")), now)).isEmpty()
    }

    @Test fun `un ephemere vivant porte son decompte`() {
        val entries = SummaryProtections.entries(
            listOf(fact("m1", ephemeral = true, expiresAt = now.plusSeconds(90))),
            now,
        )
        assertThat(entries.single().badges).containsExactly(SummaryProtectionBadge.Ephemeral(90.0))
    }

    @Test fun `un ephemere echu ne laisse aucune trace`() {
        val entries = SummaryProtections.entries(
            listOf(fact("m1", ephemeral = true, expiresAt = now.minusSeconds(1))),
            now,
        )
        assertThat(entries).isEmpty()
    }

    @Test fun `un ephemere sans echeance servie attend sans decompter`() {
        val entries = SummaryProtections.entries(listOf(fact("m1", ephemeral = true)), now)
        assertThat(entries.single().badges).containsExactly(SummaryProtectionBadge.Ephemeral(null))
    }

    @Test fun `une vue unique consommee par le lecteur a disparu pour lui`() {
        assertThat(SummaryProtections.entries(listOf(fact("m1", viewOnce = true, consumed = true)), now)).isEmpty()
        assertThat(SummaryProtections.entries(listOf(fact("m2", viewOnce = true)), now).single().badges)
            .containsExactly(SummaryProtectionBadge.ViewOnce)
    }

    @Test fun `les badges cohabitent dans l'ordre ephemere vue unique flou`() {
        val badges = SummaryProtections.entries(
            listOf(fact("m1", viewOnce = true, blurred = true, ephemeral = true, expiresAt = now.plusSeconds(5))),
            now,
        ).single().badges
        assertThat(badges).containsExactly(
            SummaryProtectionBadge.Ephemeral(5.0),
            SummaryProtectionBadge.ViewOnce,
            SummaryProtectionBadge.Blurred,
        ).inOrder()
    }

    @Test fun `un message supprime ou systeme n'y figure pas et l'ordre du fil est garde`() {
        val entries = SummaryProtections.entries(
            listOf(
                fact("m1", blurred = true),
                fact("m2", blurred = true, deleted = true),
                fact("m3", blurred = true, system = true),
                fact("m4", viewOnce = true),
            ),
            now,
        )
        assertThat(entries.map { it.id }).containsExactly("m1", "m4").inOrder()
    }
}
