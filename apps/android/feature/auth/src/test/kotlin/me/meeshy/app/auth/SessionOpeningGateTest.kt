package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SessionOpeningGateTest {

    @Test
    fun `sans feuille affichee l'ouverture est immediate`() {
        var opened = 0

        SessionOpeningGate().open { opened += 1 }

        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `l'ouverture est retenue tant qu'une feuille est affichee puis executee a sa fermeture`() {
        val gate = SessionOpeningGate().apply { presentationBegan() }
        var opened = 0

        gate.openWhenDismissed { opened += 1 }
        assertThat(opened).isEqualTo(0)
        assertThat(gate.dismissalRequested.value).isFalse()

        gate.presentationEnded()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `une preuve par lien demande la fermeture de la feuille affichee`() {
        val gate = SessionOpeningGate().apply { presentationBegan() }
        var opened = 0

        gate.open { opened += 1 }

        assertThat(gate.dismissalRequested.value).isTrue()
        assertThat(opened).isEqualTo(0)

        gate.presentationEnded()
        assertThat(opened).isEqualTo(1)
        assertThat(gate.dismissalRequested.value).isFalse()
    }

    @Test
    fun `l'ouverture n'est executee qu'une seule fois`() {
        val gate = SessionOpeningGate().apply { presentationBegan() }
        var opened = 0
        gate.open { opened += 1 }

        gate.presentationEnded()
        gate.presentationBegan()
        gate.presentationEnded()

        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `la derniere ouverture demandee remplace la precedente`() {
        val gate = SessionOpeningGate().apply { presentationBegan() }
        val order = mutableListOf<String>()
        gate.open { order += "first" }
        gate.open { order += "second" }

        gate.presentationEnded()

        assertThat(order).containsExactly("second")
    }
}
