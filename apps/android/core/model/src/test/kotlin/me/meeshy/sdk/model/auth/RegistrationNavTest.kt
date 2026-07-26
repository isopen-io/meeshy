package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure navigation-chrome core [RegistrationNav] backing the
 * 8-step gamified registration wizard's top bar + bottom bar.
 *
 * Parity source: iOS `OnboardingFlowView`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingFlowView.swift`):
 *   - `topBar` — a leading control that is **Back** (`previousStep`) on every step
 *     except the first (`.pseudo`), where it is **Close** (`dismiss`); a decorative
 *     step icon; and a `"\(rawValue + 1)/\(totalSteps)"` position counter.
 *   - `bottomBar` — a primary `GlowingButton` whose `isEnabled` is
 *     `canProceed && !isLoading`, whose action is `register()` on `.recap` and
 *     `nextStep()` otherwise; `buttonTitle` is *create-account* on `.recap`,
 *     *continue* on `.profile`, *next* otherwise; `buttonIcon` is *sparkles* on
 *     `.recap` and *forward* otherwise; and a secondary **Skip** button rendered
 *     only on `.profile`.
 *
 * SOTA note: iOS spreads these decisions across three computed `View` properties
 * (`topBar`, `bottomBar`, `buttonTitle`/`buttonIcon`) that each re-`switch` on
 * `currentStep` inside a SwiftUI body. Android lifts the whole chrome projection into
 * one framework-free object returning a value model, so every arm (leading control,
 * primary label/icon/action, enabled gate, skip visibility, position label) is
 * JVM-testable and the Compose wizard stays a dumb renderer of the model.
 *
 * Every assertion is on observable behaviour through the public API. Expectations are
 * hand-written literals, independent of how production derives them.
 */
class RegistrationNavTest {

    // --- leading control: Close only on the first step, Back everywhere else ---

    @Test
    fun leading_onTheFirstStep_isClose() {
        assertThat(model(RegistrationStep.PSEUDO).leading)
            .isEqualTo(RegistrationLeadingAction.CLOSE)
    }

    @Test
    fun leading_onEveryOtherStep_isBack() {
        RegistrationStep.ordered
            .filter { it != RegistrationStep.PSEUDO }
            .forEach { step ->
                assertThat(model(step).leading).isEqualTo(RegistrationLeadingAction.BACK)
            }
    }

    // --- primary action: Register only on the last (RECAP) step, Advance otherwise ---

    @Test
    fun primaryAction_onTheRecapStep_isRegister() {
        assertThat(model(RegistrationStep.RECAP).primaryAction)
            .isEqualTo(RegistrationPrimaryAction.REGISTER)
    }

    @Test
    fun primaryAction_onEveryOtherStep_isAdvance() {
        RegistrationStep.ordered
            .filter { it != RegistrationStep.RECAP }
            .forEach { step ->
                assertThat(model(step).primaryAction).isEqualTo(RegistrationPrimaryAction.ADVANCE)
            }
    }

    // --- primary label: create-account on RECAP, continue on PROFILE, next otherwise ---

    @Test
    fun primaryLabel_onTheRecapStep_isCreateAccount() {
        assertThat(model(RegistrationStep.RECAP).primaryLabel)
            .isEqualTo(RegistrationPrimaryLabel.CREATE_ACCOUNT)
    }

    @Test
    fun primaryLabel_onTheProfileStep_isContinue() {
        assertThat(model(RegistrationStep.PROFILE).primaryLabel)
            .isEqualTo(RegistrationPrimaryLabel.CONTINUE)
    }

    @Test
    fun primaryLabel_onEveryOtherStep_isNext() {
        RegistrationStep.ordered
            .filter { it != RegistrationStep.RECAP && it != RegistrationStep.PROFILE }
            .forEach { step ->
                assertThat(model(step).primaryLabel).isEqualTo(RegistrationPrimaryLabel.NEXT)
            }
    }

    // --- primary icon: sparkles on RECAP, forward otherwise (incl. PROFILE) ---

    @Test
    fun primaryIcon_onTheRecapStep_isSparkles() {
        assertThat(model(RegistrationStep.RECAP).primaryIcon)
            .isEqualTo(RegistrationPrimaryIcon.SPARKLES)
    }

    @Test
    fun primaryIcon_onEveryOtherStep_isForward() {
        RegistrationStep.ordered
            .filter { it != RegistrationStep.RECAP }
            .forEach { step ->
                assertThat(model(step).primaryIcon).isEqualTo(RegistrationPrimaryIcon.FORWARD)
            }
    }

    // --- primary enabled: canProceed && !isSubmitting (iOS canProceed && !isLoading) ---

    @Test
    fun primaryEnabled_whenCanProceedAndNotSubmitting_isTrue() {
        assertThat(model(RegistrationStep.EMAIL, canProceed = true, isSubmitting = false).primaryEnabled)
            .isTrue()
    }

    @Test
    fun primaryEnabled_whenBlocked_isFalse() {
        assertThat(model(RegistrationStep.EMAIL, canProceed = false, isSubmitting = false).primaryEnabled)
            .isFalse()
    }

    @Test
    fun primaryEnabled_whileSubmitting_isFalseEvenWhenCanProceed() {
        assertThat(model(RegistrationStep.RECAP, canProceed = true, isSubmitting = true).primaryEnabled)
            .isFalse()
    }

    // --- skip visibility: only the PROFILE step shows the bottom-bar Skip ---

    @Test
    fun showSkip_isTrueOnlyOnTheProfileStep() {
        RegistrationStep.ordered.forEach { step ->
            assertThat(model(step).showSkip).isEqualTo(step == RegistrationStep.PROFILE)
        }
    }

    // --- position label: "n/total", 1-based (iOS "\(rawValue + 1)/\(totalSteps)") ---

    @Test
    fun positionLabel_onTheFirstStep_isOneOverTotal() {
        assertThat(model(RegistrationStep.PSEUDO).positionLabel).isEqualTo("1/8")
    }

    @Test
    fun positionLabel_onTheLastStep_isTotalOverTotal() {
        assertThat(model(RegistrationStep.RECAP).positionLabel).isEqualTo("8/8")
    }

    @Test
    fun positionLabel_walksEveryStepToItsOneBasedIndex() {
        RegistrationStep.ordered.forEach { step ->
            assertThat(model(step).positionLabel)
                .isEqualTo("${step.index + 1}/${RegistrationStep.total}")
        }
    }

    private fun model(
        step: RegistrationStep,
        canProceed: Boolean = true,
        isSubmitting: Boolean = false,
    ): RegistrationNavModel = RegistrationNav.model(step, canProceed = canProceed, isSubmitting = isSubmitting)
}
