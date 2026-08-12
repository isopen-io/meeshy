package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [MagicLinkCountdown] and [MagicLinkEmail], the pure
 * waiting-step state machine + strict email gate backing passwordless
 * magic-link login.
 *
 * Parity source: iOS `MagicLinkView` (`apps/ios/Meeshy/Features/Main/Views/MagicLinkView.swift`):
 * the `isValidEmail` regex, the `startCountdown` / per-second tick loop that flips
 * `linkExpired` at zero, `formattedCountdown` (`"m:ss"`), and the resend button's
 * `.disabled(countdownRemaining > 0 || isLoading)` gate.
 *
 * Every assertion is on observable behaviour through the public API — the resolved
 * remaining/expired state, the formatted clock, the display flags, and the resend
 * gate — never on internal shape. Expectations are hand-written literals,
 * independent of how production derives them (not tautological).
 */
class MagicLinkCountdownTest {

    // --- MagicLinkEmail.isValid ---

    @Test
    fun email_acceptsSimpleAddress() {
        assertThat(MagicLinkEmail.isValid("a@b.co")).isTrue()
    }

    @Test
    fun email_acceptsRichLocalAndSubdomain() {
        assertThat(MagicLinkEmail.isValid("john.doe+tag_1%x-y@sub.example.com")).isTrue()
    }

    @Test
    fun email_acceptsUppercase() {
        assertThat(MagicLinkEmail.isValid("A@B.CO")).isTrue()
    }

    @Test
    fun email_acceptsHyphenatedDomain() {
        assertThat(MagicLinkEmail.isValid("a@b-c.io")).isTrue()
    }

    @Test
    fun email_rejectsMissingAtSign() {
        assertThat(MagicLinkEmail.isValid("abc.com")).isFalse()
    }

    @Test
    fun email_rejectsMissingDomainDot() {
        assertThat(MagicLinkEmail.isValid("a@bcom")).isFalse()
    }

    @Test
    fun email_rejectsSingleCharTld() {
        assertThat(MagicLinkEmail.isValid("a@b.c")).isFalse()
    }

    @Test
    fun email_rejectsEmptyLocalPart() {
        assertThat(MagicLinkEmail.isValid("@b.co")).isFalse()
    }

    @Test
    fun email_rejectsMultipleAtSigns() {
        assertThat(MagicLinkEmail.isValid("a@b@c.co")).isFalse()
    }

    @Test
    fun email_rejectsInteriorSpace() {
        assertThat(MagicLinkEmail.isValid("a b@c.co")).isFalse()
    }

    @Test
    fun email_rejectsLeadingOrTrailingWhitespace() {
        assertThat(MagicLinkEmail.isValid(" a@b.co")).isFalse()
        assertThat(MagicLinkEmail.isValid("a@b.co ")).isFalse()
    }

    @Test
    fun email_rejectsEmpty() {
        assertThat(MagicLinkEmail.isValid("")).isFalse()
    }

    // --- MagicLinkCountdown.start ---

    @Test
    fun start_seedsRemainingAndClearsExpiry() {
        val state = MagicLinkCountdown.start(900)
        assertThat(state.remaining).isEqualTo(900)
        assertThat(state.expired).isFalse()
    }

    @Test
    fun start_withZeroIsNotYetExpired() {
        val state = MagicLinkCountdown.start(0)
        assertThat(state.remaining).isEqualTo(0)
        assertThat(state.expired).isFalse()
    }

    @Test
    fun start_clampsNegativeToZero() {
        val state = MagicLinkCountdown.start(-5)
        assertThat(state.remaining).isEqualTo(0)
        assertThat(state.expired).isFalse()
    }

    // --- MagicLinkCountdown.tick ---

    @Test
    fun tick_decrementsWhileAboveZero() {
        val state = MagicLinkCountdown.start(3).tick()
        assertThat(state.remaining).isEqualTo(2)
        assertThat(state.expired).isFalse()
    }

    @Test
    fun tick_atOneReachesExpiry() {
        val state = MagicLinkCountdown(remaining = 1, expired = false).tick()
        assertThat(state.remaining).isEqualTo(0)
        assertThat(state.expired).isTrue()
    }

    @Test
    fun tick_atZeroIsIdempotentAndExpired() {
        val state = MagicLinkCountdown(remaining = 0, expired = true).tick()
        assertThat(state.remaining).isEqualTo(0)
        assertThat(state.expired).isTrue()
    }

    @Test
    fun tick_foldedToZeroReachesExpiry() {
        var state = MagicLinkCountdown.start(3)
        repeat(3) { state = state.tick() }
        assertThat(state.remaining).isEqualTo(0)
        assertThat(state.expired).isTrue()
    }

    // --- resend re-start clears an expired warning ---

    @Test
    fun start_afterExpiryClearsExpiredWarning() {
        val expired = MagicLinkCountdown(remaining = 0, expired = true)
        val resent = MagicLinkCountdown.start(600)
        assertThat(expired.expired).isTrue()
        assertThat(resent.expired).isFalse()
        assertThat(resent.remaining).isEqualTo(600)
    }

    // --- formatted clock (m:ss) ---

    @Test
    fun formatted_rendersMinutesAndZeroPaddedSeconds() {
        assertThat(MagicLinkCountdown(remaining = 900, expired = false).formatted).isEqualTo("15:00")
        assertThat(MagicLinkCountdown(remaining = 65, expired = false).formatted).isEqualTo("1:05")
        assertThat(MagicLinkCountdown(remaining = 5, expired = false).formatted).isEqualTo("0:05")
        assertThat(MagicLinkCountdown(remaining = 0, expired = true).formatted).isEqualTo("0:00")
        assertThat(MagicLinkCountdown(remaining = 600, expired = false).formatted).isEqualTo("10:00")
    }

    // --- display flags ---

    @Test
    fun showCountdown_trueOnlyWhileCountingDown() {
        assertThat(MagicLinkCountdown(remaining = 30, expired = false).showCountdown).isTrue()
        assertThat(MagicLinkCountdown(remaining = 0, expired = false).showCountdown).isFalse()
        assertThat(MagicLinkCountdown(remaining = 0, expired = true).showCountdown).isFalse()
    }

    @Test
    fun showExpiredWarning_tracksExpiredFlag() {
        assertThat(MagicLinkCountdown(remaining = 0, expired = true).showExpiredWarning).isTrue()
        assertThat(MagicLinkCountdown(remaining = 30, expired = false).showExpiredWarning).isFalse()
    }

    // --- resend gate ---

    @Test
    fun canResend_blockedWhileCounting() {
        assertThat(MagicLinkCountdown(remaining = 30, expired = false).canResend(isLoading = false)).isFalse()
    }

    @Test
    fun canResend_allowedWhenExhaustedAndIdle() {
        assertThat(MagicLinkCountdown(remaining = 0, expired = true).canResend(isLoading = false)).isTrue()
    }

    @Test
    fun canResend_blockedWhileLoadingEvenWhenExhausted() {
        assertThat(MagicLinkCountdown(remaining = 0, expired = true).canResend(isLoading = true)).isFalse()
    }
}
