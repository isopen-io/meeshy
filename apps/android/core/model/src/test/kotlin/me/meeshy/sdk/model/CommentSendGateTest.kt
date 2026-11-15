package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentSendGateTest {
    private fun ready(id: String) = CommentSendGate.Piece(id, isReady = true)
    private fun loading(id: String) = CommentSendGate.Piece(id, isReady = false)

    @Test fun `tout est prêt le commentaire part avec ses pièces dans l'ordre`() {
        val decision = CommentSendGate.decide("Salut", listOf(ready("a"), ready("b")), hasPlace = false)
        assertThat(decision).isEqualTo(CommentSendGate.Decision.Send(listOf("a", "b")))
    }

    @Test fun `une pièce qui se prépare garde le composeur intact même sans texte`() {
        val decision = CommentSendGate.decide("", listOf(ready("a"), loading("b"), loading("c")), hasPlace = true)
        assertThat(decision).isEqualTo(CommentSendGate.Decision.KeepWhilePreparing(loading = 2))
    }

    @Test fun `rien à envoyer ne fait rien`() {
        assertThat(CommentSendGate.decide("   \n", emptyList(), hasPlace = false)).isEqualTo(CommentSendGate.Decision.DoNothing)
    }

    @Test fun `un lieu seul suffit à envoyer`() {
        assertThat(CommentSendGate.decide("", emptyList(), hasPlace = true)).isEqualTo(CommentSendGate.Decision.Send(emptyList()))
    }

    @Test fun `une pièce prête sans texte suffit à envoyer`() {
        assertThat(CommentSendGate.decide("", listOf(ready("a")), hasPlace = false)).isEqualTo(CommentSendGate.Decision.Send(listOf("a")))
    }
}
