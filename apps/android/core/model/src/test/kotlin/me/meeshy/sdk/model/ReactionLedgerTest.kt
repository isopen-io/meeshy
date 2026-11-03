package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReactionLedgerTest {

    private fun row(id: String, participantId: String?, emoji: String = "❤️") =
        ReactionRow(id = id, messageId = "m1", participantId = participantId, emoji = emoji)

    private fun appended(
        rows: List<ReactionRow>,
        participantId: String? = null,
        ownerUserId: String? = null,
        currentUserId: String? = "me",
        maxCount: Int? = null,
        emoji: String = "❤️",
    ) = ReactionLedger.appending(rows, "r-new", "m1", emoji, participantId, ownerUserId, currentUserId, maxCount)

    @Test
    fun `my own reaction seen from another device is keyed under my user id, never my participant id`() {
        val result = appended(emptyList(), participantId = "p-me", ownerUserId = "me")

        assertThat(result!!.single().participantId).isEqualTo("me")
    }

    @Test
    fun `a third party echo keeps its participant id`() {
        val result = appended(emptyList(), participantId = "p-bob", ownerUserId = "bob")

        assertThat(result!!.single().participantId).isEqualTo("p-bob")
    }

    @Test
    fun `the echo of my own optimistic add does not count twice`() {
        val optimistic = listOf(row("opt", "me"))

        assertThat(appended(optimistic, participantId = "p-me", ownerUserId = "me")).isNull()
    }

    @Test
    fun `the same participant echoing twice writes once`() {
        val first = appended(emptyList(), participantId = "p-bob", ownerUserId = "bob")!!

        assertThat(appended(first, participantId = "p-bob", ownerUserId = "bob")).isNull()
    }

    @Test
    fun `the served count bounds the rows of an emoji`() {
        val rows = listOf(row("a", null), row("b", null))

        assertThat(appended(rows, participantId = "p-bob", ownerUserId = "bob", maxCount = 2)).isNull()
        assertThat(appended(rows, participantId = "p-bob", ownerUserId = "bob", maxCount = 3)).hasSize(3)
    }

    @Test
    fun `another emoji is not bounded by the count of the first`() {
        val rows = listOf(row("a", null, "🔥"))

        assertThat(appended(rows, participantId = "p-bob", ownerUserId = "bob", maxCount = 1)).hasSize(2)
    }

    @Test
    fun `a third party removal drops its own row and never mine`() {
        val rows = listOf(row("a", "me"), row("b", "p-bob"))

        val result = ReactionLedger.removing(rows, "❤️", "p-bob", "bob", "me", null)

        assertThat(result!!.map { it.id }).containsExactly("a")
    }

    @Test
    fun `my own removal from another device drops my row`() {
        val rows = listOf(row("a", "me"), row("b", "p-bob"))

        val result = ReactionLedger.removing(rows, "❤️", "p-me", "me", "me", null)

        assertThat(result!!.map { it.id }).containsExactly("b")
    }

    @Test
    fun `a removal of an unknown author is calibrated on the served aggregate`() {
        val rows = listOf(row("a", "me"), row("b", null), row("c", null))

        val result = ReactionLedger.removing(
            rows, "❤️", participantId = "p-x", ownerUserId = "x", currentUserId = "me",
            aggregate = ReactionLedger.Aggregate(count = 2, participantIds = null),
        )

        assertThat(result!!.map { it.id }).containsExactly("a", "b")
    }

    @Test
    fun `calibration prunes rows of participants the aggregate no longer names`() {
        val rows = listOf(row("a", "p-bob"), row("b", "p-eve"))

        val result = ReactionLedger.removing(
            rows, "❤️", "p-bob", "bob", "me",
            ReactionLedger.Aggregate(count = 1, participantIds = listOf("p-eve")),
        )

        assertThat(result!!.map { it.id }).containsExactly("b")
    }

    @Test
    fun `a removal without aggregate drops one authorless row when the author is unknown`() {
        val rows = listOf(row("a", null), row("b", null))

        val result = ReactionLedger.removing(rows, "❤️", "p-x", "x", "me", null)

        assertThat(result!!.map { it.id }).containsExactly("a")
    }

    @Test
    fun `a removal that changes nothing writes nothing`() {
        assertThat(ReactionLedger.removing(listOf(row("a", "p-bob")), "🔥", "p-x", "x", "me", null)).isNull()
    }

    @Test
    fun `a REST rebuild without authors keeps mine under my id and the others authorless`() {
        val rows = ReactionLedger.rebuilt("m1", mapOf("❤️" to 3, "🔥" to 1), mine = setOf("❤️"), currentUserId = "me")

        assertThat(rows.filter { it.emoji == "❤️" }.map { it.participantId }).containsExactly("me", null, null)
        assertThat(rows.filter { it.emoji == "🔥" }.map { it.participantId }).containsExactly(null)
    }

    @Test
    fun `a rebuild never exceeds the served count even when mine is among them`() {
        val rows = ReactionLedger.rebuilt("m1", mapOf("❤️" to 1), mine = setOf("❤️"), currentUserId = "me")

        assertThat(rows).hasSize(1)
    }

    @Test
    fun `reconciling with a smaller summary drops authorless rows first, then others, never mine`() {
        val rows = listOf(row("a", "me"), row("b", "p-bob"), row("c", null))

        val result = ReactionLedger.reconciled(rows, mapOf("❤️" to 2), currentUserId = "me")

        assertThat(result!!.map { it.id }).containsExactly("a", "b")
    }

    @Test
    fun `reconciling drops the rows of an emoji the summary no longer has`() {
        val result = ReactionLedger.reconciled(listOf(row("a", "p-bob", "🔥")), mapOf("❤️" to 1), currentUserId = "me")

        assertThat(result).isNull()
    }

    @Test
    fun `reconciling without rows or without a summary leaves things alone`() {
        assertThat(ReactionLedger.reconciled(null, mapOf("❤️" to 1), "me")).isNull()
        val rows = listOf(row("a", "p-bob"))
        assertThat(ReactionLedger.reconciled(rows, null, "me")).isEqualTo(rows)
    }
}
