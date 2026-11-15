package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TwoFactorSetupFlowTest {

    private fun atQr() = TwoFactorSetupFlow().setupLoaded()
    private fun atCode() = atQr().next()

    @Test
    fun `le flux démarre par le chargement`() {
        assertThat(TwoFactorSetupFlow().step).isEqualTo(TwoFactorSetupStep.LOADING)
    }

    @Test
    fun `chargement puis QR puis saisie puis succès`() {
        val flow = TwoFactorSetupFlow()
        assertThat(flow.setupLoaded().step).isEqualTo(TwoFactorSetupStep.QR)
        assertThat(atQr().next().step).isEqualTo(TwoFactorSetupStep.CODE)
        assertThat(atCode().verified().step).isEqualTo(TwoFactorSetupStep.SUCCESS)
    }

    @Test
    fun `retour au QR depuis la saisie efface l'erreur de code`() {
        val back = atCode().codeInvalid().backToQr()
        assertThat(back.step).isEqualTo(TwoFactorSetupStep.QR)
        assertThat(back.codeRejected).isFalse()
    }

    @Test
    fun `un échec de chargement mène à l'erreur et réessayer recharge`() {
        val failed = TwoFactorSetupFlow().setupFailed()
        assertThat(failed.step).isEqualTo(TwoFactorSetupStep.ERROR)
        assertThat(failed.started().step).isEqualTo(TwoFactorSetupStep.LOADING)
    }

    @Test
    fun `un code invalide reste sur la saisie avec l'erreur puis la ressaisie l'efface`() {
        val rejected = atCode().codeInvalid()
        assertThat(rejected.step).isEqualTo(TwoFactorSetupStep.CODE)
        assertThat(rejected.codeRejected).isTrue()
        assertThat(rejected.codeEdited().codeRejected).isFalse()
    }

    @Test
    fun `les transitions illégales sont ignorées`() {
        assertThat(TwoFactorSetupFlow().next().step).isEqualTo(TwoFactorSetupStep.LOADING)
        assertThat(atQr().verified().step).isEqualTo(TwoFactorSetupStep.QR)
        assertThat(atQr().backToQr().step).isEqualTo(TwoFactorSetupStep.QR)
        assertThat(atCode().setupLoaded().step).isEqualTo(TwoFactorSetupStep.CODE)
        assertThat(atCode().verified().next().step).isEqualTo(TwoFactorSetupStep.SUCCESS)
    }
}
