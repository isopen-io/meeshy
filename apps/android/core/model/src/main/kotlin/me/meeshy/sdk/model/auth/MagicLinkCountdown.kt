package me.meeshy.sdk.model.auth

/**
 * Strict email gate for passwordless magic-link login — faithful port of the
 * `isValidEmail` regex in iOS `MagicLinkView`
 * (`apps/ios/Meeshy/Features/Main/Views/MagicLinkView.swift`).
 *
 * This is deliberately stricter than the signup wizard's loose `@`+`.` gate
 * ([SignupFieldValidation.isEmailValidLocally]): the magic-link flow validates a
 * full RFC-lite shape (local part, domain, ≥2-char TLD) because the address is the
 * sole login identifier — there is no username/password to fall back on. Kept as a
 * distinct SSOT rather than folded into the signup gate so neither surface drifts.
 *
 * Mirrors iOS `email.wholeMatch(of:)` — the whole string must match, so leading or
 * trailing whitespace is rejected (iOS binds the raw `$email`, no trim).
 */
object MagicLinkEmail {

    private val pattern = Regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")

    /** True when [email] matches the magic-link address shape in full. */
    fun isValid(email: String): Boolean = pattern.matches(email)
}

/**
 * Pure waiting-step countdown for magic-link login — port of the `startCountdown`
 * loop + `linkExpired` / `formattedCountdown` / resend-gate logic in iOS
 * `MagicLinkView`.
 *
 * iOS drives a stateful `Task` that decrements `countdownRemaining` once a second
 * and flips `linkExpired` when the loop drains. Android lifts the whole transition
 * into an immutable value with pure [start]/[tick] transitions so every branch is
 * JVM-testable and a Compose screen can re-derive the display each second off a
 * plain 1 s clock. [expired] is a genuine state — distinct from `remaining == 0` —
 * because a resend re-[start]s the countdown and clears the warning (iOS
 * `linkExpired = false`) while the just-drained state still reads zero.
 *
 * @property remaining whole seconds left before the link expires (never negative).
 * @property expired whether the countdown has drained to zero (drives the
 *   "link expired, resend" warning).
 */
data class MagicLinkCountdown(
    val remaining: Int,
    val expired: Boolean,
) {

    /** Whether the live "m:ss" countdown should render (iOS `else` branch, `countdownRemaining > 0`). */
    val showCountdown: Boolean
        get() = !expired && remaining > 0

    /** Whether the "link expired, resend a new one" warning should render (iOS `if linkExpired`). */
    val showExpiredWarning: Boolean
        get() = expired

    /** The `"m:ss"` clock (iOS `formattedCountdown`), minutes un-padded, seconds zero-padded. */
    val formatted: String
        get() = "%d:%02d".format(remaining / 60, remaining % 60)

    /**
     * Whether the resend button is enabled — mirrors iOS
     * `.disabled(countdownRemaining > 0 || isLoading)`: only once the countdown has
     * drained AND no request is in flight.
     */
    fun canResend(isLoading: Boolean): Boolean = remaining == 0 && !isLoading

    /**
     * One-second decrement + expiry transition (the body + exit of iOS's `while`
     * loop): while above zero, drop a second and expire exactly on reaching zero;
     * at zero it is idempotently expired.
     */
    fun tick(): MagicLinkCountdown =
        if (remaining > 0) {
            val next = remaining - 1
            copy(remaining = next, expired = next == 0)
        } else {
            copy(remaining = 0, expired = true)
        }

    companion object {
        /**
         * Seeds a fresh countdown from the server's `expiresInSeconds`, clearing any
         * expiry warning (iOS `startCountdown`: `countdownRemaining = seconds;
         * linkExpired = false`). A negative reading clamps to zero. Re-calling this is
         * exactly the resend transition.
         */
        fun start(expiresInSeconds: Int): MagicLinkCountdown =
            MagicLinkCountdown(remaining = expiresInSeconds.coerceAtLeast(0), expired = false)
    }
}
