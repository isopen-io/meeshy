package me.meeshy.sdk.model.voice

import com.google.common.truth.Truth.assertThat
import java.time.LocalDate
import me.meeshy.sdk.model.VoiceProfile
import org.junit.Test

class VoiceWizardStepTest {

    private val today = LocalDate.of(2026, 11, 3)

    @Test
    fun `the five steps follow the iOS order`() {
        assertThat(VoiceWizardStep.entries).containsExactly(
            VoiceWizardStep.CONSENT,
            VoiceWizardStep.AGE_VERIFICATION,
            VoiceWizardStep.RECORDING,
            VoiceWizardStep.PROCESSING,
            VoiceWizardStep.COMPLETE,
        ).inOrder()
    }

    @Test
    fun `a segment is filled up to and including the current step`() {
        val reached = VoiceWizardStep.entries.map { it.isReached(VoiceWizardStep.RECORDING) }
        assertThat(reached).containsExactly(true, true, true, false, false).inOrder()
    }

    @Test
    fun `the consent step cannot continue until the toggle is on`() {
        assertThat(VoiceWizardState().canContinueFromConsent).isFalse()
        assertThat(VoiceWizardState(consentGiven = true).canContinueFromConsent).isTrue()
    }

    @Test
    fun `continuing without consent stays on the consent step`() {
        assertThat(VoiceWizardState().continueFromConsent().step).isEqualTo(VoiceWizardStep.CONSENT)
        assertThat(VoiceWizardState(consentGiven = true).continueFromConsent().step).isEqualTo(VoiceWizardStep.AGE_VERIFICATION)
    }

    @Test
    fun `eighteen years old today is an adult and the day before is not`() {
        assertThat(VoiceWizardRules.isAdult(LocalDate.of(2008, 11, 3), today)).isTrue()
        assertThat(VoiceWizardRules.isAdult(LocalDate.of(2008, 11, 4), today)).isFalse()
    }

    @Test
    fun `a leap day birthday turns eighteen on the first of March in a common year`() {
        assertThat(VoiceWizardRules.isAdult(LocalDate.of(2008, 2, 29), LocalDate.of(2026, 2, 28))).isFalse()
        assertThat(VoiceWizardRules.isAdult(LocalDate.of(2008, 2, 29), LocalDate.of(2026, 3, 1))).isTrue()
    }

    @Test
    fun `the voice cloning limit is today minus eighteen calendar years`() {
        assertThat(VoiceWizardRules.voiceCloningBirthDateLimit(today)).isEqualTo(LocalDate.of(2008, 11, 3))
    }

    @Test
    fun `on a leap day the voice cloning limit falls back to the twenty eighth of February`() {
        assertThat(VoiceWizardRules.voiceCloningBirthDateLimit(LocalDate.of(2028, 2, 29))).isEqualTo(LocalDate.of(2010, 2, 28))
    }

    @Test
    fun `the picker only offers days up to the voice cloning limit`() {
        assertThat(VoiceWizardRules.isSelectableBirthDate(LocalDate.of(2008, 11, 3), today)).isTrue()
        assertThat(VoiceWizardRules.isSelectableBirthDate(LocalDate.of(2008, 11, 4), today)).isFalse()
        assertThat(VoiceWizardRules.isSelectableBirthDate(today, today)).isFalse()
    }

    @Test
    fun `the default birth date is twenty years back so the picker opens on an adult`() {
        assertThat(VoiceWizardRules.isAdult(VoiceWizardRules.defaultBirthDate(today), today)).isTrue()
    }

    @Test
    fun `the birth date is sent as a strict calendar day`() {
        assertThat(VoiceWizardRules.wireBirthDate(LocalDate.of(1990, 3, 7))).isEqualTo("1990-03-07")
    }

    @Test
    fun `the picker's UTC midnight keeps the day the user chose`() {
        val utcMidnight = LocalDate.of(1990, 3, 7).atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli()
        assertThat(VoiceWizardRules.dayFromPicker(utcMidnight)).isEqualTo(LocalDate.of(1990, 3, 7))
    }

    @Test
    fun `an under age birth date is refused with the age error and stays on the age step`() {
        val state = VoiceWizardState(step = VoiceWizardStep.AGE_VERIFICATION, birthDate = LocalDate.of(2015, 1, 1))
        val refused = state.submitAge(today) as VoiceWizardState.AgeSubmission.Refused
        assertThat(refused.state.error).isEqualTo(VoiceWizardError.UNDER_AGE)
        assertThat(refused.state.step).isEqualTo(VoiceWizardStep.AGE_VERIFICATION)
        assertThat(refused.state.isLoading).isFalse()
    }

    @Test
    fun `an adult birth date starts the consent call with the wire day to send`() {
        val state = VoiceWizardState(step = VoiceWizardStep.AGE_VERIFICATION, birthDate = LocalDate.of(1990, 3, 7), error = VoiceWizardError.UNDER_AGE)
        val accepted = state.submitAge(today) as VoiceWizardState.AgeSubmission.Accepted
        assertThat(accepted.wireBirthDate).isEqualTo("1990-03-07")
        assertThat(accepted.state.isLoading).isTrue()
        assertThat(accepted.state.error).isNull()
    }

    @Test
    fun `a granted consent moves to recording and a failed one raises the consent error in place`() {
        val age = VoiceWizardState(step = VoiceWizardStep.AGE_VERIFICATION, isLoading = true)
        assertThat(age.consentGranted().step).isEqualTo(VoiceWizardStep.RECORDING)
        assertThat(age.consentGranted().isLoading).isFalse()
        val failed = age.consentFailed()
        assertThat(failed.step).isEqualTo(VoiceWizardStep.AGE_VERIFICATION)
        assertThat(failed.error).isEqualTo(VoiceWizardError.CONSENT)
        assertThat(failed.isLoading).isFalse()
    }

    @Test
    fun `uploading counts n over N then completes with the profile`() {
        var state = VoiceWizardState(step = VoiceWizardStep.RECORDING).uploadStarted(total = 3)
        assertThat(state.step).isEqualTo(VoiceWizardStep.PROCESSING)
        assertThat(state.totalToUpload).isEqualTo(3)
        assertThat(state.uploadFraction).isEqualTo(0f)
        state = state.sampleUploaded().sampleUploaded()
        assertThat(state.uploadedCount).isEqualTo(2)
        assertThat(state.uploadFraction).isWithin(0.001f).of(2f / 3f)
        val profile = VoiceProfile(id = "p1", sampleCount = 3)
        val done = state.uploadCompleted(profile)
        assertThat(done.step).isEqualTo(VoiceWizardStep.COMPLETE)
        assertThat(done.profile).isEqualTo(profile)
    }

    @Test
    fun `an upload failure returns to recording with the upload error`() {
        val failed = VoiceWizardState(step = VoiceWizardStep.PROCESSING, totalToUpload = 3, uploadedCount = 1).uploadFailed()
        assertThat(failed.step).isEqualTo(VoiceWizardStep.RECORDING)
        assertThat(failed.error).isEqualTo(VoiceWizardError.UPLOAD)
    }

    @Test
    fun `dismissing the alert clears the error`() {
        assertThat(VoiceWizardState(error = VoiceWizardError.UPLOAD).errorDismissed().error).isNull()
    }

    @Test
    fun `the fraction is zero when there is nothing to upload`() {
        assertThat(VoiceWizardState().uploadFraction).isEqualTo(0f)
    }
}
