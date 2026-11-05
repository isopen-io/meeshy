package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TranslationRequestBufferTest {

    private fun request(id: String, language: String = "fr", at: Long = 0L) = PendingTranslationRequest(id, language, at)

    @Test
    fun `le tampon est borne a 50 demandes et perd les plus anciennes`() {
        val full = (1..55).fold(TranslationRequestBuffer()) { buffer, n -> buffer.enqueue(request("m$n", at = n.toLong())) }
        assertThat(full.pending).hasSize(50)
        assertThat(full.pending.first().messageId).isEqualTo("m6")
        assertThat(full.pending.last().messageId).isEqualTo("m55")
    }

    @Test
    fun `la meme paire message et langue est dedoublonnee et rafraichie`() {
        val buffer = TranslationRequestBuffer().enqueue(request("m1", at = 1)).enqueue(request("m2", at = 2)).enqueue(request("m1", at = 9))
        assertThat(buffer.pending.map { it.messageId }).containsExactly("m2", "m1").inOrder()
        assertThat(buffer.pending.last().queuedAtMillis).isEqualTo(9L)
    }

    @Test
    fun `deux langues du meme message restent deux demandes`() {
        val buffer = TranslationRequestBuffer().enqueue(request("m1", "fr")).enqueue(request("m1", "es"))
        assertThat(buffer.pending).hasSize(2)
    }

    @Test
    fun `le vidage rend les demandes de moins de 60 secondes et vide le tampon`() {
        val buffer = TranslationRequestBuffer().enqueue(request("old", at = 0)).enqueue(request("fresh", at = 50_000))
        val (fresh, emptied) = buffer.drainFresh(nowMillis = 70_000)
        assertThat(fresh.map { it.messageId }).containsExactly("fresh")
        assertThat(emptied.pending).isEmpty()
    }

    @Test
    fun `une demande a exactement 60 secondes est encore rejouee`() {
        val (fresh, _) = TranslationRequestBuffer().enqueue(request("edge", at = 10_000)).drainFresh(nowMillis = 70_000)
        assertThat(fresh).hasSize(1)
    }
}
