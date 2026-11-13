package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** R1.4 (#17795) — la capsule de capture tient les enregistreurs PAR PERSONNE, comme iOS `CallCaptureLedger`. */
class CallScreenCaptureLedgerTest {

    private val none = CallScreenCaptureLedger()

    private fun CallScreenCaptureLedger.recording(who: String, on: Boolean = true) =
        applying(CallCaptureKind.RECORDING, isCapturing = on, capturerId = who)

    private fun CallScreenCaptureLedger.screenshot(who: String, on: Boolean = true) =
        applying(CallCaptureKind.SCREENSHOT, isCapturing = on, capturerId = who)

    @Test
    fun `rien ne capture au depart, la capsule n'a personne a nommer`() {
        assertThat(none.isShown).isFalse()
        assertThat(none.capturerId).isEmpty()
    }

    @Test
    fun `un enregistrement d'ecran allume la capsule et nomme son auteur`() {
        val ledger = none.recording("awa")

        assertThat(ledger.isShown).isTrue()
        assertThat(ledger.capturerId).isEqualTo("awa")
    }

    @Test
    fun `quand l'un de deux enregistreurs s'arrete, la capsule reste pour l'autre`() {
        val ledger = none.recording("awa").recording("karim").recording("awa", on = false)

        assertThat(ledger.isShown).isTrue()
        assertThat(ledger.capturerId).isEqualTo("karim")
    }

    @Test
    fun `la capsule part quand le dernier enregistreur s'arrete`() {
        val ledger = none.recording("awa").recording("karim").recording("awa", on = false).recording("karim", on = false)

        assertThat(ledger.isShown).isFalse()
    }

    @Test
    fun `le meme enregistreur qui repart ne compte qu'une fois et redevient le dernier`() {
        val ledger = none.recording("awa").recording("karim").recording("awa")

        assertThat(ledger.recorders).containsExactly("karim", "awa").inOrder()
        assertThat(ledger.capturerId).isEqualTo("awa")
    }

    @Test
    fun `l'arret de quelqu'un qui n'enregistrait pas ne touche pas les autres`() {
        val ledger = none.recording("awa").recording("karim", on = false)

        assertThat(ledger.recorders).containsExactly("awa")
    }

    @Test
    fun `le depart d'un participant qui enregistrait l'eteint, sans toucher l'autre`() {
        val ledger = none.recording("awa").recording("karim").participantLeft("awa")

        assertThat(ledger.recorders).containsExactly("karim")
        assertThat(ledger.participantLeft("karim").isShown).isFalse()
    }

    @Test
    fun `le depart de quelqu'un qui n'enregistrait pas ne change rien`() {
        val ledger = none.recording("awa")

        assertThat(ledger.participantLeft("inconnu")).isEqualTo(ledger)
    }

    @Test
    fun `une capture d'ecran ponctuelle nomme son auteur, puis la capsule revient a l'enregistreur`() {
        val ledger = none.recording("awa").screenshot("karim")
        assertThat(ledger.isShown).isTrue()
        assertThat(ledger.capturerId).isEqualTo("karim")

        val after = ledger.screenshotCleared()
        assertThat(after.isShown).isTrue()
        assertThat(after.capturerId).isEqualTo("awa")
    }

    @Test
    fun `une capture d'ecran seule disparait avec sa fenetre`() {
        assertThat(none.screenshot("karim").screenshotCleared().isShown).isFalse()
    }

    @Test
    fun `la fin d'une capture ponctuelle, relayee pour les anciens clients, n'eteint pas un enregistrement`() {
        val ledger = none.recording("awa").screenshot("karim", on = false)

        assertThat(ledger).isEqualTo(none.recording("awa"))
    }
}
