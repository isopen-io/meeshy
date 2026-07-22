package me.meeshy.sdk.model.auth

/**
 * The outcome of skipping the current registration step
 * ([RegistrationStepNavigator.skip]).
 *
 * @property target the step to navigate to, or `null` when the current step is the
 *   last one (an inert no-op — nothing to skip to).
 * @property clearPhone `true` only when the skipped step is [RegistrationStep.PHONE],
 *   signalling the caller to mark the phone as skipped and clear the entered number
 *   (iOS `skipCurrentStep()` sets `skipPhone = true; phoneNumber = ""`). The pure
 *   core surfaces the *decision*; the app-side ViewModel performs the field mutation.
 */
data class SkipOutcome(val target: RegistrationStep?, val clearPhone: Boolean)

/**
 * Pure step-transition decisions behind the 8-step gamified registration wizard's
 * bottom-bar navigation.
 *
 * Faithful port of iOS `RegistrationViewModel`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`):
 * `nextStep()` (gated on `canProceed`), `previousStep()`, `skipCurrentStep()` and
 * the private `nextStepForced()` all resolve an ordinal move over
 * `RegistrationStep.allCases` and mutate `currentStep`.
 *
 * SOTA note: iOS recomputes `allSteps.firstIndex(of:)` inline in each of those four
 * methods and folds the gate, the first/last bounds and the phone-skip side effect
 * into the mutation. Android lifts every branch into this framework-free SSOT that
 * returns the *target* step (or `null` for an inert transition), leaving the
 * ViewModel a thin caller that only applies the resulting state. Advancement is
 * expressed through [RegistrationStep.fromIndex], so the last-step bound is a single
 * source of truth rather than an open-coded `idx < count - 1` in every method.
 */
object RegistrationStepNavigator {

    /** True when [step] is the wizard's first step (iOS `idx > 0` guard's boundary). */
    fun isFirst(step: RegistrationStep): Boolean = step == RegistrationStep.ordered.first()

    /** True when [step] is the wizard's last step (iOS `idx < count - 1` guard's boundary). */
    fun isLast(step: RegistrationStep): Boolean = step == RegistrationStep.ordered.last()

    /** The ordinal successor of [current], or `null` when [current] is the last step. */
    fun next(current: RegistrationStep): RegistrationStep? =
        RegistrationStep.fromIndex(current.index + 1)

    /**
     * The ordinal predecessor of [current], or `null` when [current] is the first
     * step (iOS `previousStep()`).
     */
    fun previous(current: RegistrationStep): RegistrationStep? =
        RegistrationStep.fromIndex(current.index - 1)

    /**
     * The step to move to for iOS `nextStep()`: the [next] step when [canProceed],
     * otherwise `null` — the caller stays on [current]. Still `null` at the last
     * step even when [canProceed], since there is nowhere further to go.
     */
    fun advance(current: RegistrationStep, canProceed: Boolean): RegistrationStep? =
        if (canProceed) next(current) else null

    /**
     * The outcome of iOS `skipCurrentStep()`: a forced advance (ignoring the proceed
     * gate) paired with whether the phone field must be cleared (only on the phone
     * step). At the last step the target is `null` — an inert no-op.
     */
    fun skip(current: RegistrationStep): SkipOutcome =
        SkipOutcome(target = next(current), clearPhone = current == RegistrationStep.PHONE)
}
