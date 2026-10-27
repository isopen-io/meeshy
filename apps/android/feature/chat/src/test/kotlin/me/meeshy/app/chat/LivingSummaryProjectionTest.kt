package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import java.time.ZoneOffset
import me.meeshy.sdk.model.reading.summary.AwaitingKind
import me.meeshy.sdk.model.reading.summary.SummaryProtectionBadge
import me.meeshy.ui.component.bubble.BubbleBlurRevealSpec
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

class LivingSummaryProjectionTest {
    private val viewer = SummaryViewer("me", "meeshy")
    private val now = Instant.parse("2026-10-27T12:00:00Z")

    private fun bubble(
        id: String,
        sender: String = "bob",
        text: String = "salut",
        at: String = "2026-10-27T10:00:00Z",
        deleted: Boolean = false,
        viewOnce: Boolean = false,
        blurred: Boolean = false,
        expiresAtIso: String? = null,
        sealed: Boolean = false,
    ) = BubbleContent(
        messageId = id,
        text = text,
        isOutgoing = sender == "me",
        isTranslated = false,
        originalText = null,
        senderName = sender.replaceFirstChar { it.uppercase() },
        showSenderName = false,
        senderId = sender,
        isEdited = false,
        isDeleted = deleted,
        createdAtIso = at,
        isViewOnce = viewOnce,
        isBlurred = blurred,
        expiresAtIso = expiresAtIso,
        isEndToEndSealed = sealed,
    )

    private fun assemble(vararg bubbles: BubbleContent, complete: Boolean = true) =
        LivingSummaryProjection.assemble(bubbles.toList(), viewer, complete, ZoneOffset.UTC, now)

    @Test
    fun `a mention of the viewer waits for him and lights Bob's face`() {
        val summary = assemble(bubble("m1", text = "@meeshy tu viens ?"))
        assertThat(summary.digest.awaitingYou.map { it.kind })
            .containsExactly(AwaitingKind.MENTION, AwaitingKind.UNANSWERED_QUESTION)
        assertThat(summary.faceRamp.single().displayName).isEqualTo("Bob")
        assertThat(summary.faceRamp.single().evidenceMessageIds).contains("m1")
    }

    @Test
    fun `a protected message stays counted but its text never reaches a computation`() {
        val summary = assemble(
            bubble("m1", text = "@meeshy secret", viewOnce = true),
            bubble("m2", text = "@meeshy secret", blurred = true),
            bubble("m3", text = "@meeshy secret", expiresAtIso = "2026-10-27T13:00:00Z"),
            bubble("m4", text = "@meeshy secret", sealed = true),
        )
        assertThat(summary.digest.messageCount).isEqualTo(4)
        assertThat(summary.digest.awaitingYou).isEmpty()
        assertThat(summary.faceRamp).isEmpty()
    }

    @Test
    fun `the blur reveal spec protects a message as well`() {
        val spec = bubble("m1", text = "@meeshy secret").copy(blurReveal = BubbleBlurRevealSpec(isViewOnce = false))
        assertThat(assemble(spec).digest.awaitingYou).isEmpty()
    }

    @Test
    fun `a window that does not reach back to the unread says it is partial`() {
        assertThat(assemble(bubble("m1"), complete = false).digest.isComplete).isFalse()
        assertThat(assemble(bubble("m1"), complete = true).digest.isComplete).isTrue()
    }

    @Test
    fun `a bubble with no readable date is left out of the digest`() {
        assertThat(assemble(bubble("m1"), bubble("m2").copy(createdAtIso = null)).digest.messageCount).isEqualTo(1)
    }

    @Test
    fun `protection facts list only protected messages and carry the countdown`() {
        val facts = LivingSummaryProjection.protectionFacts(
            listOf(
                bubble("m1"),
                bubble("m2", viewOnce = true),
                bubble("m3", expiresAtIso = "2026-10-27T12:01:30Z"),
            ),
        )
        assertThat(facts.map { it.id }).containsExactly("m2", "m3").inOrder()
        val entries = me.meeshy.sdk.model.reading.summary.SummaryProtections.entries(facts, now)
        assertThat(entries.last().badges).containsExactly(SummaryProtectionBadge.Ephemeral(90.0))
    }
}
