package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SharedTranslationFilterTest {
    private fun oid(n: Int): String = n.toString(16).padStart(24, '0')

    @Test
    fun `les ids non ObjectId, blancs et doublons sont ecartes dans l'ordre`() {
        val result = SharedTranslationFilter.messageIds(
            listOf(" ${oid(1)} ", "nope", "", oid(2), oid(1), "${oid(3)}z"),
        )
        assertThat(result).containsExactly(oid(1), oid(2)).inOrder()
    }

    @Test
    fun `les langues invalides sont ecartees et au plus huit gardees dans l'ordre du prisme`() {
        val result = SharedTranslationFilter.languages(
            listOf("fr", "x", "pt-BR", "fr", "en_US", "es", "de", "it", "ar", "ja", "ko", "123"),
        )
        assertThat(result).containsExactly("fr", "pt-BR", "en_US", "es", "de", "it", "ar", "ja").inOrder()
    }

    @Test
    fun `les ids partent par paquets de cent`() {
        val chunks = SharedTranslationFilter.messageIdChunks((1..250).map(::oid))
        assertThat(chunks.map { it.size }).containsExactly(100, 100, 50).inOrder()
    }

    @Test
    fun `aucun id valide ne produit aucun paquet`() {
        assertThat(SharedTranslationFilter.messageIdChunks(listOf("x", " "))).isEmpty()
    }
}
