package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversationLastMessage
import org.junit.Test

/**
 * Pure classifier — port of iOS `MeeshyConversation.lastMessageSummaryKind(now:)`
 * (SSOT: `packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift`).
 *
 * Priority order — first match wins — mirrors iOS exactly:
 *   1. `expiresAt <= now`   → EXPIRED (an expired ephemeral outranks every kind — the
 *                             content is gone, no matter what other flags the message
 *                             happens to carry).
 *   2. `isBlurred`           → HIDDEN (moderation/blur wins over an active ephemeral —
 *                             the row must not expose blurred content).
 *   3. `isViewOnce`          → VIEW_ONCE.
 *   4. `expiresAt` in future → EPHEMERAL_ACTIVE.
 *   5. otherwise             → STANDARD.
 *
 * Every arm and every boundary (`==`, `<`, `>`) is exercised so a swap of `<=` for `<`
 * (or the reverse) fails a specific test.
 */
class MessageSummaryKindTest {

    private val now = 1_700_000_000_000L
    private val isoNow = "2023-11-14T22:13:20Z"

    private fun message(
        content: String = "hi",
        isBlurred: Boolean = false,
        isViewOnce: Boolean = false,
        expiresAt: String? = null,
    ) = ApiConversationLastMessage(
        id = "m1",
        content = content,
        isBlurred = isBlurred,
        isViewOnce = isViewOnce,
        expiresAt = expiresAt,
    )

    @Test
    fun `null message resolves to standard`() {
        assertThat(MessageSummaryKind.of(message = null, nowMillis = now))
            .isEqualTo(MessageSummaryKind.STANDARD)
    }

    @Test
    fun `plain text message is standard`() {
        assertThat(MessageSummaryKind.of(message(), nowMillis = now))
            .isEqualTo(MessageSummaryKind.STANDARD)
    }

    @Test
    fun `future expiresAt classifies as ephemeral active`() {
        val expiresLater = "2023-11-14T22:14:00Z" // 40s after now
        assertThat(MessageSummaryKind.of(message(expiresAt = expiresLater), nowMillis = now))
            .isEqualTo(MessageSummaryKind.EPHEMERAL_ACTIVE)
    }

    @Test
    fun `expiresAt strictly before now classifies as expired`() {
        val expiresEarlier = "2023-11-14T22:13:19Z" // 1s before now
        assertThat(MessageSummaryKind.of(message(expiresAt = expiresEarlier), nowMillis = now))
            .isEqualTo(MessageSummaryKind.EXPIRED)
    }

    @Test
    fun `expiresAt equal to now classifies as expired (inclusive boundary)`() {
        assertThat(MessageSummaryKind.of(message(expiresAt = isoNow), nowMillis = now))
            .isEqualTo(MessageSummaryKind.EXPIRED)
    }

    @Test
    fun `blurred without expiresAt classifies as hidden`() {
        assertThat(MessageSummaryKind.of(message(isBlurred = true), nowMillis = now))
            .isEqualTo(MessageSummaryKind.HIDDEN)
    }

    @Test
    fun `view-once without expiresAt classifies as view-once`() {
        assertThat(MessageSummaryKind.of(message(isViewOnce = true), nowMillis = now))
            .isEqualTo(MessageSummaryKind.VIEW_ONCE)
    }

    @Test
    fun `expired outranks blurred (an expired blurred message is still expired)`() {
        val expiresEarlier = "2023-11-14T22:00:00Z"
        assertThat(
            MessageSummaryKind.of(
                message(isBlurred = true, expiresAt = expiresEarlier),
                nowMillis = now,
            )
        ).isEqualTo(MessageSummaryKind.EXPIRED)
    }

    @Test
    fun `expired outranks view-once`() {
        val expiresEarlier = "2023-11-14T22:00:00Z"
        assertThat(
            MessageSummaryKind.of(
                message(isViewOnce = true, expiresAt = expiresEarlier),
                nowMillis = now,
            )
        ).isEqualTo(MessageSummaryKind.EXPIRED)
    }

    @Test
    fun `blurred outranks view-once (both flags set → HIDDEN)`() {
        assertThat(
            MessageSummaryKind.of(
                message(isBlurred = true, isViewOnce = true),
                nowMillis = now,
            )
        ).isEqualTo(MessageSummaryKind.HIDDEN)
    }

    @Test
    fun `blurred outranks a live ephemeral (blurred content stays hidden even if ephemeral)`() {
        val expiresLater = "2023-11-14T22:20:00Z"
        assertThat(
            MessageSummaryKind.of(
                message(isBlurred = true, expiresAt = expiresLater),
                nowMillis = now,
            )
        ).isEqualTo(MessageSummaryKind.HIDDEN)
    }

    @Test
    fun `view-once outranks a live ephemeral`() {
        val expiresLater = "2023-11-14T22:20:00Z"
        assertThat(
            MessageSummaryKind.of(
                message(isViewOnce = true, expiresAt = expiresLater),
                nowMillis = now,
            )
        ).isEqualTo(MessageSummaryKind.VIEW_ONCE)
    }

    @Test
    fun `malformed expiresAt does not classify as ephemeral (falls through the ISO parser)`() {
        assertThat(MessageSummaryKind.of(message(expiresAt = "not-a-date"), nowMillis = now))
            .isEqualTo(MessageSummaryKind.STANDARD)
    }

    @Test
    fun `blank expiresAt does not classify as ephemeral`() {
        assertThat(MessageSummaryKind.of(message(expiresAt = "   "), nowMillis = now))
            .isEqualTo(MessageSummaryKind.STANDARD)
    }

    @Test
    fun `defaults on ApiConversationLastMessage are non-ephemeral non-blurred non-view-once`() {
        val bare = ApiConversationLastMessage(id = "m1", content = "hi")
        assertThat(bare.isBlurred).isFalse()
        assertThat(bare.isViewOnce).isFalse()
        assertThat(bare.expiresAt).isNull()
        assertThat(MessageSummaryKind.of(bare, nowMillis = now))
            .isEqualTo(MessageSummaryKind.STANDARD)
    }
}
