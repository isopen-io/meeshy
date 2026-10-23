package me.meeshy.sdk.model.account

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.auth.PhonePlausibility
import org.junit.Test

class PhoneChangeFlowTest {

    private val valid = "+33612345678"

    @Test
    fun `un flux neuf est au repos`() {
        val flow = PhoneChangeFlow()
        assertThat(flow.stage).isEqualTo(PhoneChangeStage.IDLE)
        assertThat(flow.isEditing).isFalse()
        assertThat(flow.isCodeSent).isFalse()
    }

    @Test
    fun `modifier ouvre la saisie amorcee par le numero courant`() {
        val flow = PhoneChangeFlow().beginEdit(current = "+33600000000")
        assertThat(flow.stage).isEqualTo(PhoneChangeStage.EDIT)
        assertThat(flow.number).isEqualTo("+33600000000")
    }

    @Test
    fun `le code envoye fait passer de EDIT a CODE_ENVOYE puis la verification a VERIFIE`() {
        val edited = PhoneChangeFlow().beginEdit(valid)
        val sent = edited.codeSent()
        assertThat(sent.stage).isEqualTo(PhoneChangeStage.CODE_ENVOYE)
        assertThat(sent.isCodeSent).isTrue()
        assertThat(sent.isEditing).isFalse()

        val verified = sent.onCodeChange("123456").verified()
        assertThat(verified.stage).isEqualTo(PhoneChangeStage.VERIFIE)
        assertThat(verified.isEditing).isFalse()
        assertThat(verified.isCodeSent).isFalse()
        assertThat(verified.number).isEmpty()
        assertThat(verified.code).isEmpty()
    }

    @Test
    fun `le code est limite a six chiffres et ne garde que les chiffres`() {
        val flow = PhoneChangeFlow().beginEdit(valid).codeSent()
        assertThat(flow.onCodeChange("12ab34567890").code).isEqualTo("123456")
    }

    @Test
    fun `verifier n est possible qu avec six chiffres`() {
        val sent = PhoneChangeFlow().beginEdit(valid).codeSent()
        assertThat(sent.onCodeChange("12345").canVerify).isFalse()
        assertThat(sent.onCodeChange("123456").canVerify).isTrue()
        assertThat(PhoneChangeFlow().onCodeChange("123456").canVerify).isFalse()
    }

    @Test
    fun `envoyer le code exige un numero valide`() {
        assertThat(PhoneChangeFlow().beginEdit("abc").canSendCode).isFalse()
        assertThat(PhoneChangeFlow().beginEdit(valid).canSendCode).isTrue()
    }

    @Test
    fun `un numero implausible ne peut pas etre envoye et dit pourquoi`() {
        val short = PhoneChangeFlow().beginEdit("12345678")
        assertThat(short.canSendCode).isFalse()
        assertThat(short.numberRefusal).isEqualTo(PhonePlausibility.Refusal.TOO_SHORT)
        val filler = PhoneChangeFlow().beginEdit("1111100000")
        assertThat(filler.canSendCode).isFalse()
        assertThat(filler.numberRefusal).isEqualTo(PhonePlausibility.Refusal.IDENTICAL_RUN)
        assertThat(PhoneChangeFlow().beginEdit(valid).numberRefusal).isNull()
    }

    @Test
    fun `retour arriere depuis le code revient a la saisie en gardant le numero`() {
        val back = PhoneChangeFlow().beginEdit(valid).codeSent().onCodeChange("123").back()
        assertThat(back.stage).isEqualTo(PhoneChangeStage.EDIT)
        assertThat(back.number).isEqualTo(valid)
        assertThat(back.code).isEmpty()
    }

    @Test
    fun `retour arriere depuis la saisie revient au repos`() {
        assertThat(PhoneChangeFlow().beginEdit(valid).back()).isEqualTo(PhoneChangeFlow())
    }

    @Test
    fun `annuler efface tout`() {
        assertThat(PhoneChangeFlow().beginEdit(valid).codeSent().onCodeChange("12").cancel())
            .isEqualTo(PhoneChangeFlow())
    }

    @Test
    fun `modifier le numero ne touche pas au code`() {
        val flow = PhoneChangeFlow().beginEdit(valid).onNumberChange("+1555")
        assertThat(flow.number).isEqualTo("+1555")
    }
}
