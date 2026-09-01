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

    private fun resolve(
        isDeleted: Boolean,
        ephemeral: EphemeralLifecycle.State = EphemeralLifecycle.State.None,
        isViewOnce: Boolean = false,
        viewOnceCount: Int = 0,
        isSystem: Boolean = false,
    ) = BubbleRenderKind.resolve(
        isSystem = isSystem,
        isDeleted = isDeleted,
        ephemeral = ephemeral,
        isViewOnce = isViewOnce,
        viewOnceCount = viewOnceCount,
    )

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

    // MARK: - Burned (a consumed view-once message → "Seen and deleted" tombstone)

    @Test
    fun resolve_viewOnceConsumedOnce_isBurned() {
        // iOS gate: `message.isViewOnce && message.viewOnceCount > 0`.
        assertThat(resolve(isDeleted = false, isViewOnce = true, viewOnceCount = 1))
            .isEqualTo(BubbleRenderKind.Kind.Burned)
    }

    @Test
    fun resolve_viewOnceConsumedMultipleTimes_isBurned() {
        // Boundary above the > 0 threshold — a multi-view-once already opened stays burned.
        assertThat(resolve(isDeleted = false, isViewOnce = true, viewOnceCount = 2))
            .isEqualTo(BubbleRenderKind.Kind.Burned)
    }

    @Test
    fun resolve_viewOnceNotYetConsumed_isStandard() {
        // A view-once message nobody has opened yet (count == 0) still shows its content.
        assertThat(resolve(isDeleted = false, isViewOnce = true, viewOnceCount = 0))
            .isEqualTo(BubbleRenderKind.Kind.Standard)
    }

    @Test
    fun resolve_positiveCountButNotViewOnce_isStandard() {
        // Guard: a stray positive count on a non-view-once message must NOT burn it.
        assertThat(resolve(isDeleted = false, isViewOnce = false, viewOnceCount = 3))
            .isEqualTo(BubbleRenderKind.Kind.Standard)
    }

    // MARK: - Burned precedence

    @Test
    fun resolve_deletedAndViewOnceConsumed_staysDeleted() {
        // Server deletion wins over the burned tombstone (iOS checks `.deleted` first).
        assertThat(
            resolve(isDeleted = true, isViewOnce = true, viewOnceCount = 1),
        ).isEqualTo(BubbleRenderKind.Kind.Deleted)
    }

    @Test
    fun resolve_burnedWinsOverEphemeralExpired() {
        // A consumed view-once message shows the persistent tombstone instead of
        // collapsing, even once its ephemeral timer has also elapsed.
        assertThat(
            resolve(
                isDeleted = false,
                ephemeral = EphemeralLifecycle.State.Expired,
                isViewOnce = true,
                viewOnceCount = 1,
            ),
        ).isEqualTo(BubbleRenderKind.Kind.Burned)
    }

    @Test
    fun resolve_burnedIndependentOfRunningCountdown_isBurned() {
        // The burned decision does not depend on the ephemeral countdown still running.
        assertThat(
            resolve(
                isDeleted = false,
                ephemeral = EphemeralLifecycle.State.Running(30.0),
                isViewOnce = true,
                viewOnceCount = 1,
            ),
        ).isEqualTo(BubbleRenderKind.Kind.Burned)
    }

    // MARK: - System (a conversation notice — join/leave/legacy summary — renders centered)

    @Test
    fun resolve_systemMessage_isSystem() {
        // A system message (messageSource == "system") renders a centered notice, not a
        // signed chat bubble — iOS `BubbleContentBuilder` sets `.kind = .system`.
        assertThat(resolve(isDeleted = false, isSystem = true))
            .isEqualTo(BubbleRenderKind.Kind.System)
    }

    @Test
    fun resolve_systemWinsOverDeleted() {
        // iOS checks `messageSource == .system` BEFORE `.deleted`: a deleted system
        // message still renders as a system notice, never a deletion tombstone.
        assertThat(resolve(isDeleted = true, isSystem = true))
            .isEqualTo(BubbleRenderKind.Kind.System)
    }

    @Test
    fun resolve_systemWinsOverBurned() {
        // System precedence sits above the burned tombstone too — a stray view-once
        // count on a system row must not turn it into "Seen and deleted".
        assertThat(resolve(isDeleted = false, isSystem = true, isViewOnce = true, viewOnceCount = 1))
            .isEqualTo(BubbleRenderKind.Kind.System)
    }

    @Test
    fun resolve_systemWinsOverEphemeralExpired() {
        // A notice never self-destructs into an empty collapse: system beats the
        // ephemeral-expired arm regardless of any (nonsensical) expiry on a notice.
        assertThat(resolve(isDeleted = false, isSystem = true, ephemeral = EphemeralLifecycle.State.Expired))
            .isEqualTo(BubbleRenderKind.Kind.System)
    }

    @Test
    fun resolve_notSystem_neverSystem() {
        // Guard: the System arm fires ONLY on the flag, never as a fallback.
        assertThat(resolve(isDeleted = false, isSystem = false))
            .isEqualTo(BubbleRenderKind.Kind.Standard)
    }

    // MARK: - Convenience predicates

    @Test
    fun isEphemeralExpired_trueOnlyForEphemeralExpiredKind() {
        assertThat(BubbleRenderKind.Kind.EphemeralExpired.isEphemeralExpired).isTrue()
        assertThat(BubbleRenderKind.Kind.Standard.isEphemeralExpired).isFalse()
        assertThat(BubbleRenderKind.Kind.Deleted.isEphemeralExpired).isFalse()
        assertThat(BubbleRenderKind.Kind.Burned.isEphemeralExpired).isFalse()
        assertThat(BubbleRenderKind.Kind.System.isEphemeralExpired).isFalse()
    }

    @Test
    fun isBurned_trueOnlyForBurnedKind() {
        assertThat(BubbleRenderKind.Kind.Burned.isBurned).isTrue()
        assertThat(BubbleRenderKind.Kind.Standard.isBurned).isFalse()
        assertThat(BubbleRenderKind.Kind.Deleted.isBurned).isFalse()
        assertThat(BubbleRenderKind.Kind.EphemeralExpired.isBurned).isFalse()
        assertThat(BubbleRenderKind.Kind.System.isBurned).isFalse()
    }

    @Test
    fun isSystem_trueOnlyForSystemKind() {
        assertThat(BubbleRenderKind.Kind.System.isSystem).isTrue()
        assertThat(BubbleRenderKind.Kind.Standard.isSystem).isFalse()
        assertThat(BubbleRenderKind.Kind.Deleted.isSystem).isFalse()
        assertThat(BubbleRenderKind.Kind.Burned.isSystem).isFalse()
        assertThat(BubbleRenderKind.Kind.EphemeralExpired.isSystem).isFalse()
    }
}
