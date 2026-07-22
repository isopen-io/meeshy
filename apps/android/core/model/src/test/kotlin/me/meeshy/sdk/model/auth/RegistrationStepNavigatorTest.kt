package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure step-transition core [RegistrationStepNavigator]
 * backing the 8-step gamified registration wizard's bottom-bar navigation.
 *
 * Parity source: iOS `RegistrationViewModel`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`):
 *   - `nextStep()` — `guard canProceed`; if not last, advance one step;
 *   - `previousStep()` — if not first, step back one;
 *   - `skipCurrentStep()` — on the phone step, clear the phone + mark it skipped,
 *     then `nextStepForced()` (advance regardless of `canProceed`);
 *   - `nextStepForced()` — if not last, advance one step ignoring the gate.
 *
 * SOTA note: iOS scatters these ordinal transitions across four ViewModel methods
 * that each recompute `allSteps.firstIndex(of:)` inline and mutate `currentStep`.
 * Android lifts the whole first/last-aware next/previous partition, the
 * `canProceed` advance gate, and the phone-skip decision into one framework-free
 * SSOT so every branch is JVM-testable and the ViewModel stays a thin caller.
 *
 * Every assertion is on observable behaviour through the public API. Expectations
 * are hand-written literals, independent of how production derives them.
 */
class RegistrationStepNavigatorTest {

    // --- isFirst / isLast: the end-of-wizard boundaries (iOS idx > 0 / idx < count-1) ---

    @Test
    fun isFirst_isTrueOnlyForTheFirstStep() {
        RegistrationStep.ordered.forEach { step ->
            assertThat(RegistrationStepNavigator.isFirst(step))
                .isEqualTo(step == RegistrationStep.PSEUDO)
        }
    }

    @Test
    fun isLast_isTrueOnlyForTheLastStep() {
        RegistrationStep.ordered.forEach { step ->
            assertThat(RegistrationStepNavigator.isLast(step))
                .isEqualTo(step == RegistrationStep.RECAP)
        }
    }

    // --- next: the ungated ordinal successor (null at the last step) ---

    @Test
    fun next_fromTheFirstStep_isTheSecondStep() {
        assertThat(RegistrationStepNavigator.next(RegistrationStep.PSEUDO))
            .isEqualTo(RegistrationStep.PHONE)
    }

    @Test
    fun next_fromAnInteriorStep_isTheFollowingStep() {
        assertThat(RegistrationStepNavigator.next(RegistrationStep.EMAIL))
            .isEqualTo(RegistrationStep.IDENTITY)
    }

    @Test
    fun next_fromTheLastStep_isNull() {
        assertThat(RegistrationStepNavigator.next(RegistrationStep.RECAP)).isNull()
    }

    @Test
    fun next_walksEveryStepToItsIndexSuccessor() {
        RegistrationStep.ordered.forEach { step ->
            assertThat(RegistrationStepNavigator.next(step))
                .isEqualTo(RegistrationStep.fromIndex(step.index + 1))
        }
    }

    // --- previous: the ordinal predecessor (null at the first step) ---

    @Test
    fun previous_fromTheLastStep_isThePriorStep() {
        assertThat(RegistrationStepNavigator.previous(RegistrationStep.RECAP))
            .isEqualTo(RegistrationStep.PROFILE)
    }

    @Test
    fun previous_fromAnInteriorStep_isThePriorStep() {
        assertThat(RegistrationStepNavigator.previous(RegistrationStep.IDENTITY))
            .isEqualTo(RegistrationStep.EMAIL)
    }

    @Test
    fun previous_fromTheFirstStep_isNull() {
        assertThat(RegistrationStepNavigator.previous(RegistrationStep.PSEUDO)).isNull()
    }

    @Test
    fun previous_walksEveryStepToItsIndexPredecessor() {
        RegistrationStep.ordered.forEach { step ->
            assertThat(RegistrationStepNavigator.previous(step))
                .isEqualTo(RegistrationStep.fromIndex(step.index - 1))
        }
    }

    // --- advance: iOS `nextStep()` — next, but gated on canProceed ---

    @Test
    fun advance_whenCanProceed_movesToTheNextStep() {
        assertThat(RegistrationStepNavigator.advance(RegistrationStep.EMAIL, canProceed = true))
            .isEqualTo(RegistrationStep.IDENTITY)
    }

    @Test
    fun advance_whenBlocked_staysPut_returningNull() {
        assertThat(RegistrationStepNavigator.advance(RegistrationStep.EMAIL, canProceed = false))
            .isNull()
    }

    @Test
    fun advance_atTheLastStep_isNullEvenWhenCanProceed() {
        assertThat(RegistrationStepNavigator.advance(RegistrationStep.RECAP, canProceed = true))
            .isNull()
    }

    @Test
    fun advance_atTheFirstStepWhenBlocked_isNull() {
        assertThat(RegistrationStepNavigator.advance(RegistrationStep.PSEUDO, canProceed = false))
            .isNull()
    }

    // --- skip: iOS `skipCurrentStep()` — forced advance + phone-clear decision ---

    @Test
    fun skip_onThePhoneStep_advancesAndSignalsClearingThePhone() {
        assertThat(RegistrationStepNavigator.skip(RegistrationStep.PHONE))
            .isEqualTo(SkipOutcome(target = RegistrationStep.EMAIL, clearPhone = true))
    }

    @Test
    fun skip_onANonPhoneStep_advancesWithoutClearingThePhone() {
        assertThat(RegistrationStepNavigator.skip(RegistrationStep.EMAIL))
            .isEqualTo(SkipOutcome(target = RegistrationStep.IDENTITY, clearPhone = false))
    }

    @Test
    fun skip_ignoresTheProceedGate_advancingFromTheFirstStep() {
        assertThat(RegistrationStepNavigator.skip(RegistrationStep.PSEUDO))
            .isEqualTo(SkipOutcome(target = RegistrationStep.PHONE, clearPhone = false))
    }

    @Test
    fun skip_atTheLastStep_isAnInertNoOp() {
        assertThat(RegistrationStepNavigator.skip(RegistrationStep.RECAP))
            .isEqualTo(SkipOutcome(target = null, clearPhone = false))
    }
}
