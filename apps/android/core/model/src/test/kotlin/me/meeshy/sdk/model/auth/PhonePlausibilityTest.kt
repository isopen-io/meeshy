package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.auth.PhonePlausibility.Refusal
import org.junit.Test

class PhonePlausibilityTest {

    @Test
    fun `un numero ordinaire est plausible`() {
        assertThat(PhonePlausibility.refusal("06 12 34 56 78")).isNull()
        assertThat(PhonePlausibility.refusal("0642424242")).isNull()
        assertThat(PhonePlausibility.refusal("06 44 44 12 30")).isNull()
    }

    @Test
    fun `moins de neuf chiffres est trop court`() {
        assertThat(PhonePlausibility.refusal("0612345")).isEqualTo(Refusal.TOO_SHORT)
        assertThat(PhonePlausibility.refusal("12345678")).isEqualTo(Refusal.TOO_SHORT)
    }

    @Test
    fun `cinq chiffres identiques a la suite sont refuses`() {
        assertThat(PhonePlausibility.refusal("1111100000")).isEqualTo(Refusal.IDENTICAL_RUN)
    }

    @Test
    fun `un motif court repete sur toute la saisie est refuse`() {
        assertThat(PhonePlausibility.refusal("4242424242")).isEqualTo(Refusal.REPEATED_PATTERN)
        assertThat(PhonePlausibility.refusal("123123123")).isEqualTo(Refusal.REPEATED_PATTERN)
    }

    @Test
    fun `le vide est plausible pour la loi mais manquant pour l'ecran`() {
        assertThat(PhonePlausibility.refusal("")).isNull()
        assertThat(SignupPhoneRefusal.of(" ")).isEqualTo(SignupPhoneRefusal.Missing)
        assertThat(SignupPhoneRefusal.of("123"))
            .isEqualTo(SignupPhoneRefusal.Implausible(Refusal.TOO_SHORT))
        assertThat(SignupPhoneRefusal.of("0612345678")).isNull()
    }

    @Test
    fun `le refus ne se dit pas pendant la premiere frappe`() {
        val fresh = PhoneCheck()
        assertThat(fresh.isChecked).isFalse()
    }

    @Test
    fun `quitter le champ avec une saisie l'arme, le quitter vide non`() {
        assertThat(PhoneCheck().fieldLeft(hasPhone = false).isChecked).isFalse()
        assertThat(PhoneCheck().fieldLeft(hasPhone = true).isChecked).isTrue()
    }

    @Test
    fun `un envoi tente arme le refus`() {
        assertThat(PhoneCheck().submitAttempted().isChecked).isTrue()
    }
}

class PhonePlausibilityBoundsTest {
    @Test
    fun `424242424 et 123123123 sont des repetitions integrales`() {
        assertThat(PhonePlausibility.refusal("424242424")).isEqualTo(Refusal.REPEATED_PATTERN)
        assertThat(PhonePlausibility.refusal("123123123")).isEqualTo(Refusal.REPEATED_PATTERN)
    }

    @Test
    fun `bornes de longueur 8 et 9 chiffres`() {
        assertThat(PhonePlausibility.refusal("12345678")).isEqualTo(Refusal.TOO_SHORT)
        assertThat(PhonePlausibility.refusal("123456789")).isNull()
    }

    @Test
    fun `quatre identiques passent, cinq non`() {
        assertThat(PhonePlausibility.refusal("0644441230")).isNull()
        assertThat(PhonePlausibility.refusal("0655555230")).isEqualTo(Refusal.IDENTICAL_RUN)
    }

    @Test
    fun `seuls les chiffres comptent`() {
        assertThat(PhonePlausibility.refusal("+33 (0)6.12-34 56 78")).isNull()
        assertThat(PhonePlausibility.refusal("+1 111-110-0000")).isEqualTo(Refusal.IDENTICAL_RUN)
    }

    @Test
    fun `isSubmittable exige une saisie plausible`() {
        assertThat(PhonePlausibility.isSubmittable("")).isFalse()
        assertThat(PhonePlausibility.isSubmittable("0612345678")).isTrue()
    }
}
