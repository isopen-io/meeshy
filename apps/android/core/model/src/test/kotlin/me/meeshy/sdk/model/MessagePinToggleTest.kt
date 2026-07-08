package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessagePinToggleTest {

    @Test
    fun `a null pinnedAt is not pinned`() {
        assertThat(MessagePinToggle.isPinned(null)).isFalse()
    }

    @Test
    fun `an empty pinnedAt is not pinned`() {
        assertThat(MessagePinToggle.isPinned("")).isFalse()
    }

    @Test
    fun `a whitespace-only pinnedAt is not pinned`() {
        assertThat(MessagePinToggle.isPinned("   ")).isFalse()
    }

    @Test
    fun `a non-blank pinnedAt is pinned`() {
        assertThat(MessagePinToggle.isPinned("2026-07-08T10:00:00Z")).isTrue()
    }

    @Test
    fun `a live not-yet-pinned message resolves to Pin`() {
        assertThat(MessagePinToggle.resolve(isDeleted = false, pinnedAtIso = null))
            .isEqualTo(PinAction.Pin)
    }

    @Test
    fun `a live message whose pinnedAt is blank resolves to Pin`() {
        assertThat(MessagePinToggle.resolve(isDeleted = false, pinnedAtIso = "  "))
            .isEqualTo(PinAction.Pin)
    }

    @Test
    fun `a live already-pinned message resolves to Unpin`() {
        assertThat(MessagePinToggle.resolve(isDeleted = false, pinnedAtIso = "2026-07-08T10:00:00Z"))
            .isEqualTo(PinAction.Unpin)
    }

    @Test
    fun `a deleted unpinned message exposes no pin action`() {
        assertThat(MessagePinToggle.resolve(isDeleted = true, pinnedAtIso = null))
            .isEqualTo(PinAction.Unavailable)
    }

    @Test
    fun `a deleted message stays Unavailable even if it carries a pin instant`() {
        assertThat(MessagePinToggle.resolve(isDeleted = true, pinnedAtIso = "2026-07-08T10:00:00Z"))
            .isEqualTo(PinAction.Unavailable)
    }
}
