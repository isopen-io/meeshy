package me.meeshy.sdk.model.auth

/**
 * The ordered steps of the 8-step gamified registration wizard.
 *
 * Faithful port of iOS `RegistrationStep`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`), which
 * is an `Int`-backed `CaseIterable` enum whose `rawValue` drives every ordering
 * comparison in the wizard (progress bar, `nextStep`/`previousStep`, the paged
 * `TabView` selection).
 *
 * Only the ordinal identity is modelled here: the per-step display metadata iOS
 * hangs off the enum (`funHeader`, `funSubtitle`, `iconName`, `accentColor`) is
 * i18n copy + design-system colour and belongs to the UI layer, not this
 * framework-free SSOT.
 */
enum class RegistrationStep(val index: Int) {
    PSEUDO(0),
    PHONE(1),
    EMAIL(2),
    IDENTITY(3),
    PASSWORD(4),
    LANGUAGE(5),
    PROFILE(6),
    RECAP(7),
    ;

    companion object {
        /** All steps in ascending [index] order (iOS `RegistrationStep.allCases`). */
        val ordered: List<RegistrationStep> = entries.sortedBy(RegistrationStep::index)

        /** Number of steps in the wizard (iOS `totalSteps`). */
        val total: Int = entries.size

        /** The step at [index], or `null` when the index is out of range. */
        fun fromIndex(index: Int): RegistrationStep? = entries.firstOrNull { it.index == index }
    }
}

/**
 * How a step renders in the progress bar relative to the current step
 * (iOS `InteractiveProgressBar.stepColor(for:)`): a step earlier than the current
 * one is [COMPLETED] (filled accent), the current one is [CURRENT] (dimmed accent
 * + stroke), a later one is [UPCOMING] (grey, disabled).
 */
enum class StepFill { COMPLETED, CURRENT, UPCOMING }

/**
 * Pure decisions behind the interactive registration progress bar.
 *
 * Faithful port of iOS `InteractiveProgressBar`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingAnimations.swift`) and the
 * `onStepTapped` gate in `OnboardingFlowView`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingFlowView.swift`): the bar
 * lets the user jump *back* to an already-completed step (or re-select the current
 * one) but never forward to an unreached one.
 *
 * SOTA note: iOS spreads these `rawValue` comparisons across a SwiftUI `View`
 * body (`stepColor`, `.disabled`) and a tap closure. Android lifts the whole
 * completed/current/upcoming partition and the jump-back gate into one
 * framework-free object so every branch is JVM-testable.
 */
object RegistrationProgressBar {

    /** The [StepFill] role of [step] when the wizard sits on [current]. */
    fun fill(step: RegistrationStep, current: RegistrationStep): StepFill = when {
        step.index < current.index -> StepFill.COMPLETED
        step == current -> StepFill.CURRENT
        else -> StepFill.UPCOMING
    }

    /**
     * True when tapping [step] is allowed from [current] — i.e. it is a completed
     * step or the current one (iOS `step.rawValue <= currentStep.rawValue`, the
     * inverse of the bar's `.disabled(step.rawValue > current)`).
     */
    fun canJumpTo(step: RegistrationStep, current: RegistrationStep): Boolean =
        step.index <= current.index

    /**
     * The step to navigate to when [tapped] is tapped from [current], or `null`
     * when the tap must be ignored (a forward jump). Mirrors iOS `onStepTapped`,
     * which only applies `currentStep = step` for a reachable step.
     */
    fun jumpTarget(tapped: RegistrationStep, current: RegistrationStep): RegistrationStep? =
        if (canJumpTo(tapped, current)) tapped else null
}
