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

class MessageReactionRowsTest {

    private fun message(summary: Map<String, Int>? = null, mine: List<String>? = null, rows: List<ReactionRow>? = null) =
        ApiMessage(id = "m1", conversationId = "c1", reactionSummary = summary, currentUserReactions = mine, reactionRows = rows)

    @Test
    fun `my optimistic add writes a row under my user id and is idempotent`() {
        val once = MessageReactionRows.withOwn(message(), "❤️", present = true, currentUserId = "me")
        val twice = MessageReactionRows.withOwn(once, "❤️", present = true, currentUserId = "me")

        assertThat(once.reactionRows!!.map { it.participantId }).containsExactly("me")
        assertThat(twice).isEqualTo(once)
    }

    @Test
    fun `add then remove cancel locally`() {
        val added = MessageReactionRows.withOwn(message(), "❤️", present = true, currentUserId = "me")
        val removed = MessageReactionRows.withOwn(added, "❤️", present = false, currentUserId = "me")

        assertThat(removed.reactionRows).isEmpty()
    }

    @Test
    fun `an optimistic add on a message known only by its counts rebuilds the others without author`() {
        val result = MessageReactionRows.withOwn(message(summary = mapOf("❤️" to 2)), "❤️", present = true, currentUserId = "me")

        assertThat(result.reactionRows!!.map { it.participantId }).containsExactly(null, null, "me")
    }

    @Test
    fun `without an identity nothing is written`() {
        val original = message()
        assertThat(MessageReactionRows.withOwn(original, "❤️", present = true, currentUserId = null)).isSameInstanceAs(original)
    }

    @Test
    fun `the echo of my own add finds my optimistic row and changes nothing`() {
        val optimistic = MessageReactionRows.withOwn(message(summary = mapOf("❤️" to 1)), "❤️", present = true, currentUserId = "me")

        val echo = MessageReactionRows.echoed(optimistic, "❤️", adding = true, participantId = "p-me", ownerUserId = "me", currentUserId = "me", aggregate = null)

        assertThat(echo.changed).isFalse()
    }

    @Test
    fun `my add from another device is a change, written under my user id`() {
        val echo = MessageReactionRows.echoed(message(), "❤️", adding = true, participantId = "p-me", ownerUserId = "me", currentUserId = "me", aggregate = null)

        assertThat(echo.changed).isTrue()
        assertThat(echo.message.reactionRows!!.single().participantId).isEqualTo("me")
    }

    @Test
    fun `a third party echo is bounded by the served aggregate`() {
        val full = message(rows = listOf(ReactionRow("a", "m1", "p-a", "❤️"), ReactionRow("b", "m1", "p-b", "❤️")))

        val echo = MessageReactionRows.echoed(
            full, "❤️", adding = true, participantId = "p-c", ownerUserId = "c", currentUserId = "me",
            aggregate = ReactionLedger.Aggregate(count = 2, participantIds = null),
        )

        assertThat(echo.changed).isFalse()
    }
}
