package me.meeshy.sdk.model.auth

/**
 * Which [RegistrationStep]s have real field UI wired in the Compose registration
 * wizard (`RegistrationScreen`, `:feature:auth`) versus an inert "coming soon"
 * placeholder body.
 *
 * The wizard's chrome (top bar, progress bar, bottom bar) and every decision core
 * it drives ([RegistrationStepGate], [RegistrationStepNavigator],
 * [RegistrationProgressBar], [RegistrationNav]) already support all 8 steps —
 * only the per-step field UI ships incrementally, one slice at a time (see
 * `auth-onboarding-shell`, `feature-parity.md` §A). This is the single place
 * that decision lives, so the Compose container's body-switch and any future
 * per-step slice stay in lockstep instead of drifting apart.
 */
object RegistrationStepContent {

    private val implemented: Set<RegistrationStep> =
        setOf(
            RegistrationStep.PSEUDO,
            RegistrationStep.PHONE,
            RegistrationStep.EMAIL,
            RegistrationStep.IDENTITY,
            RegistrationStep.PASSWORD,
            RegistrationStep.LANGUAGE,
            RegistrationStep.PROFILE,
            RegistrationStep.RECAP,
        )

    /** True when [step] renders real field UI (vs. an inert placeholder). */
    fun isImplemented(step: RegistrationStep): Boolean = step in implemented
}
