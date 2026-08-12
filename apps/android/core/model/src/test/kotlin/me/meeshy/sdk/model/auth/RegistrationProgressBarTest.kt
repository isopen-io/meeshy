package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure interactive-progress-bar core
 * ([RegistrationStep] + [RegistrationProgressBar]) backing the 8-step gamified
 * registration wizard's tappable step indicator.
 *
 * Parity source: iOS `InteractiveProgressBar`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingAnimations.swift`) and the
 * `onStepTapped` closure in `OnboardingFlowView`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingFlowView.swift`):
 *   - `stepColor(for:)` renders `step.rawValue < current` filled (completed),
 *     `step == current` accent-at-0.6 (current), else grey (upcoming);
 *   - the bar `.disabled(step.rawValue > current)` and the tap handler only
 *     applies `currentStep = step` when `step.rawValue <= current` — i.e. you may
 *     jump *back* to a completed step or re-select the current one, never forward.
 *
 * SOTA note: iOS scatters these ordering comparisons across a SwiftUI `View`'s
 * body and a tap closure. Android lifts the whole partition (completed / current /
 * upcoming) and the jump-back gate into a framework-free SSOT so every branch is
 * JVM-testable and any onboarding surface reuses the same decision.
 *
 * Every assertion is on observable behaviour through the public API. Expectations
 * are hand-written literals, independent of how production derives them.
 */
class RegistrationProgressBarTest {

    // --- RegistrationStep enum: the wizard's step set / order / count ---

    @Test
    fun ordered_listsAllEightStepsInIndexOrder() {
        assertThat(RegistrationStep.ordered).containsExactly(
            RegistrationStep.PSEUDO,
            RegistrationStep.PHONE,
            RegistrationStep.EMAIL,
            RegistrationStep.IDENTITY,
            RegistrationStep.PASSWORD,
            RegistrationStep.LANGUAGE,
            RegistrationStep.PROFILE,
            RegistrationStep.RECAP,
        ).inOrder()
    }

    @Test
    fun total_isEight() {
        assertThat(RegistrationStep.total).isEqualTo(8)
    }

    @Test
    fun index_matchesPositionInOrderedList() {
        RegistrationStep.ordered.forEachIndexed { position, step ->
            assertThat(step.index).isEqualTo(position)
        }
    }

    @Test
    fun fromIndex_returnsTheStepForTheFirstAndLastValidIndex() {
        assertThat(RegistrationStep.fromIndex(0)).isEqualTo(RegistrationStep.PSEUDO)
        assertThat(RegistrationStep.fromIndex(7)).isEqualTo(RegistrationStep.RECAP)
    }

    @Test
    fun fromIndex_returnsTheStepForAnInteriorIndex() {
        assertThat(RegistrationStep.fromIndex(4)).isEqualTo(RegistrationStep.PASSWORD)
    }

    @Test
    fun fromIndex_isNullForANegativeIndex() {
        assertThat(RegistrationStep.fromIndex(-1)).isNull()
    }

    @Test
    fun fromIndex_isNullForAnIndexAtOrBeyondTheCount() {
        assertThat(RegistrationStep.fromIndex(8)).isNull()
        assertThat(RegistrationStep.fromIndex(99)).isNull()
    }

    // --- fill: the completed / current / upcoming partition (iOS stepColor) ---

    @Test
    fun fill_stepBeforeCurrent_isCompleted() {
        assertThat(RegistrationProgressBar.fill(RegistrationStep.PSEUDO, RegistrationStep.EMAIL))
            .isEqualTo(StepFill.COMPLETED)
    }

    @Test
    fun fill_currentStep_isCurrent() {
        assertThat(RegistrationProgressBar.fill(RegistrationStep.EMAIL, RegistrationStep.EMAIL))
            .isEqualTo(StepFill.CURRENT)
    }

    @Test
    fun fill_stepAfterCurrent_isUpcoming() {
        assertThat(RegistrationProgressBar.fill(RegistrationStep.RECAP, RegistrationStep.EMAIL))
            .isEqualTo(StepFill.UPCOMING)
    }

    @Test
    fun fill_atFirstStep_currentIsCurrentAndEveryOtherIsUpcoming() {
        val current = RegistrationStep.PSEUDO
        RegistrationStep.ordered.forEach { step ->
            val expected = if (step == current) StepFill.CURRENT else StepFill.UPCOMING
            assertThat(RegistrationProgressBar.fill(step, current)).isEqualTo(expected)
        }
    }

    @Test
    fun fill_atLastStep_currentIsCurrentAndEveryPriorIsCompleted() {
        val current = RegistrationStep.RECAP
        RegistrationStep.ordered.forEach { step ->
            val expected = if (step == current) StepFill.CURRENT else StepFill.COMPLETED
            assertThat(RegistrationProgressBar.fill(step, current)).isEqualTo(expected)
        }
    }

    // --- canJumpTo: the jump-back gate (iOS `.disabled` inverse + tap guard) ---

    @Test
    fun canJumpTo_aCompletedStep_isTrue() {
        assertThat(RegistrationProgressBar.canJumpTo(RegistrationStep.PSEUDO, RegistrationStep.PASSWORD))
            .isTrue()
    }

    @Test
    fun canJumpTo_theCurrentStep_isTrue() {
        assertThat(RegistrationProgressBar.canJumpTo(RegistrationStep.PASSWORD, RegistrationStep.PASSWORD))
            .isTrue()
    }

    @Test
    fun canJumpTo_anUpcomingStep_isFalse() {
        assertThat(RegistrationProgressBar.canJumpTo(RegistrationStep.RECAP, RegistrationStep.PASSWORD))
            .isFalse()
    }

    @Test
    fun canJumpTo_theImmediatelyNextStep_isFalse() {
        assertThat(RegistrationProgressBar.canJumpTo(RegistrationStep.LANGUAGE, RegistrationStep.PASSWORD))
            .isFalse()
    }

    @Test
    fun canJumpTo_atFirstStep_onlyTheFirstStepIsReachable() {
        val current = RegistrationStep.PSEUDO
        RegistrationStep.ordered.forEach { step ->
            assertThat(RegistrationProgressBar.canJumpTo(step, current))
                .isEqualTo(step == RegistrationStep.PSEUDO)
        }
    }

    @Test
    fun canJumpTo_atLastStep_everyStepIsReachable() {
        val current = RegistrationStep.RECAP
        RegistrationStep.ordered.forEach { step ->
            assertThat(RegistrationProgressBar.canJumpTo(step, current)).isTrue()
        }
    }

    // --- jumpTarget: the tap → navigation resolution (iOS onStepTapped) ---

    @Test
    fun jumpTarget_forACompletedStep_returnsThatStep() {
        assertThat(RegistrationProgressBar.jumpTarget(RegistrationStep.EMAIL, RegistrationStep.PROFILE))
            .isEqualTo(RegistrationStep.EMAIL)
    }

    @Test
    fun jumpTarget_forTheCurrentStep_returnsTheCurrentStep() {
        assertThat(RegistrationProgressBar.jumpTarget(RegistrationStep.PROFILE, RegistrationStep.PROFILE))
            .isEqualTo(RegistrationStep.PROFILE)
    }

    @Test
    fun jumpTarget_forAnUpcomingStep_isNull_soTheBarNeverJumpsForward() {
        assertThat(RegistrationProgressBar.jumpTarget(RegistrationStep.RECAP, RegistrationStep.PROFILE))
            .isNull()
    }

    @Test
    fun jumpTarget_forTheImmediatelyNextStep_isNull() {
        assertThat(RegistrationProgressBar.jumpTarget(RegistrationStep.PASSWORD, RegistrationStep.IDENTITY))
            .isNull()
    }
}
