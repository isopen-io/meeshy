package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for [BubbleRenderKind.resolve] — the pure decision behind the
 * `content.kind` dispatch of iOS `ThemedMessageBubble.body`:
 *
 * - a server-side deleted message is a [BubbleRenderKind.Kind.Deleted] tombstone,
 *   checked BEFORE the ephemeral arm (iOS `case .deleted:` precedes the
 *   ephemeral-expired default arm), so a deleted-and-expired message stays Deleted.
 * - an un-deleted message whose ephemeral (self-destruct) countdown has reached
 *   [EphemeralLifecycle.State.Expired] collapses to [BubbleRenderKind.Kind.EphemeralExpired]
 *   (iOS renders `EmptyView` — the bubble disappears).
 * - every other ephemeral state ([EphemeralLifecycle.State.Running] /
 *   [EphemeralLifecycle.State.None]) leaves a [BubbleRenderKind.Kind.Standard] bubble.
 */
class BubbleRenderKindTest {

    private fun resolve(isDeleted: Boolean, ephemeral: EphemeralLifecycle.State) =
        BubbleRenderKind.resolve(isDeleted = isDeleted, ephemeral = ephemeral)

    // MARK: - Standard (the message renders its content)

    @Test
    fun resolve_liveMessageWithNoExpiry_isStandard() {
        assertThat(resolve(isDeleted = false, ephemeral = EphemeralLifecycle.State.None))
            .isEqualTo(BubbleRenderKind.Kind.Standard)
    }

    @Test
    fun resolve_liveMessageStillCountingDown_isStandard() {
        assertThat(resolve(isDeleted = false, ephemeral = EphemeralLifecycle.State.Running(30.0)))
            .isEqualTo(BubbleRenderKind.Kind.Standard)
    }

    @Test
    fun resolve_liveMessageWithFractionalRemaining_isStandard() {
        assertThat(resolve(isDeleted = false, ephemeral = EphemeralLifecycle.State.Running(0.5)))
            .isEqualTo(BubbleRenderKind.Kind.Standard)
    }

    // MARK: - EphemeralExpired (the un-deleted self-destruct timer elapsed → collapse)

    @Test
    fun resolve_liveMessageExpired_isEphemeralExpired() {
        assertThat(resolve(isDeleted = false, ephemeral = EphemeralLifecycle.State.Expired))
            .isEqualTo(BubbleRenderKind.Kind.EphemeralExpired)
    }

    // MARK: - Deleted wins over every ephemeral state (server authority)

    @Test
    fun resolve_deletedMessageWithNoExpiry_isDeleted() {
        assertThat(resolve(isDeleted = true, ephemeral = EphemeralLifecycle.State.None))
            .isEqualTo(BubbleRenderKind.Kind.Deleted)
    }

    @Test
    fun resolve_deletedMessageStillCountingDown_isDeleted() {
        assertThat(resolve(isDeleted = true, ephemeral = EphemeralLifecycle.State.Running(30.0)))
            .isEqualTo(BubbleRenderKind.Kind.Deleted)
    }

    @Test
    fun resolve_deletedAndExpired_staysDeleted() {
        // Precedence guard: a tombstone is authoritative, so an expired-but-deleted
        // message must NOT collapse to EphemeralExpired — it shows "Message deleted".
        assertThat(resolve(isDeleted = true, ephemeral = EphemeralLifecycle.State.Expired))
            .isEqualTo(BubbleRenderKind.Kind.Deleted)
    }

    // MARK: - Convenience predicate

    @Test
    fun isEphemeralExpired_trueOnlyForEphemeralExpiredKind() {
        assertThat(BubbleRenderKind.Kind.EphemeralExpired.isEphemeralExpired).isTrue()
        assertThat(BubbleRenderKind.Kind.Standard.isEphemeralExpired).isFalse()
        assertThat(BubbleRenderKind.Kind.Deleted.isEphemeralExpired).isFalse()
    }
}
