package me.meeshy.sdk.model.auth

/**
 * The leading (top-left) navigation control of the registration wizard's top bar
 * (iOS `OnboardingFlowView.topBar`): [BACK] steps to the previous step on every step
 * but the first, where it is [CLOSE] (dismiss the wizard).
 */
enum class RegistrationLeadingAction { BACK, CLOSE }

/**
 * What the wizard's primary bottom-bar button does (iOS `bottomBar`'s `GlowingButton`
 * action): [REGISTER] submits the account on the final RECAP step, [ADVANCE] moves to
 * the next step on every other step.
 */
enum class RegistrationPrimaryAction { ADVANCE, REGISTER }

/**
 * The semantic label of the primary bottom-bar button (iOS `buttonTitle`): the UI
 * layer resolves each to its localized copy. [CREATE_ACCOUNT] on RECAP, [CONTINUE] on
 * the optional PROFILE step, [NEXT] otherwise.
 */
enum class RegistrationPrimaryLabel { NEXT, CONTINUE, CREATE_ACCOUNT }

/**
 * The semantic icon of the primary bottom-bar button (iOS `buttonIcon`): the UI layer
 * resolves each to a concrete glyph. [SPARKLES] on the account-creating RECAP step,
 * [FORWARD] otherwise.
 */
enum class RegistrationPrimaryIcon { FORWARD, SPARKLES }

/**
 * The value model the registration wizard's chrome (top bar + bottom bar) renders for
 * a given step and submit state — produced by [RegistrationNav.model].
 *
 * @property leading the top-left control (back vs close).
 * @property primaryLabel the semantic label of the primary button.
 * @property primaryIcon the semantic icon of the primary button.
 * @property primaryAction what the primary button does (advance vs register).
 * @property primaryEnabled whether the primary button is tappable
 *   (`canProceed && !isSubmitting`).
 * @property showSkip whether the secondary "skip this step" button is shown (PROFILE
 *   only — the PHONE step carries its own in-content skip affordance, mirroring iOS).
 * @property positionLabel the 1-based step counter, e.g. `"3/8"`.
 */
data class RegistrationNavModel(
    val leading: RegistrationLeadingAction,
    val primaryLabel: RegistrationPrimaryLabel,
    val primaryIcon: RegistrationPrimaryIcon,
    val primaryAction: RegistrationPrimaryAction,
    val primaryEnabled: Boolean,
    val showSkip: Boolean,
    val positionLabel: String,
)

/**
 * Pure projection of the registration wizard's navigation chrome.
 *
 * Faithful port of iOS `OnboardingFlowView`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingFlowView.swift`): the `topBar`
 * leading control (`currentStep != .pseudo ? Back : Close`), the `bottomBar` primary
 * `GlowingButton` (`isEnabled = canProceed && !isLoading`; action `register()` on
 * `.recap` else `nextStep()`), its `buttonTitle` / `buttonIcon`, the profile-only
 * secondary skip button, and the `"\(rawValue + 1)/\(totalSteps)"` position counter.
 *
 * SOTA note: iOS recomputes each of these by `switch`-ing on `currentStep` inside a
 * SwiftUI `View` body, so none of it is unit-testable without a UI host. Android folds
 * the whole chrome into this framework-free SSOT that returns a [RegistrationNavModel],
 * leaving the Compose wizard a dumb renderer — every branch is covered here on the JVM.
 */
object RegistrationNav {

    /** The chrome model for [current] under the given proceed gate and submit flag. */
    fun model(
        current: RegistrationStep,
        canProceed: Boolean,
        isSubmitting: Boolean,
    ): RegistrationNavModel = RegistrationNavModel(
        leading = if (current == RegistrationStep.PSEUDO) {
            RegistrationLeadingAction.CLOSE
        } else {
            RegistrationLeadingAction.BACK
        },
        primaryLabel = when (current) {
            RegistrationStep.RECAP -> RegistrationPrimaryLabel.CREATE_ACCOUNT
            RegistrationStep.PROFILE -> RegistrationPrimaryLabel.CONTINUE
            else -> RegistrationPrimaryLabel.NEXT
        },
        primaryIcon = when (current) {
            RegistrationStep.RECAP -> RegistrationPrimaryIcon.SPARKLES
            else -> RegistrationPrimaryIcon.FORWARD
        },
        primaryAction = if (current == RegistrationStep.RECAP) {
            RegistrationPrimaryAction.REGISTER
        } else {
            RegistrationPrimaryAction.ADVANCE
        },
        primaryEnabled = canProceed && !isSubmitting,
        showSkip = current == RegistrationStep.PROFILE,
        positionLabel = "${current.index + 1}/${RegistrationStep.total}",
    )
}
