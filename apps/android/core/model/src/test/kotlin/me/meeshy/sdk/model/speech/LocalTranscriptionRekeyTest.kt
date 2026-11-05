package me.meeshy.sdk.model.speech

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.TusTranscription
import org.junit.Test

class LocalTranscriptionRekeyTest {
    private fun tus(text: String = "bonjour") = TusTranscription(text = text, language = "fr")

    @Test
    fun `les segments suivent l'id local vers l'id serveur`() {
        val withSegments = LocalTranscriptionMapping.toTus(
            OnDeviceTranscription(
                text = "bonjour tout le monde", language = "fr-FR", confidence = 0.8,
                segments = listOf(OnDeviceTranscriptionSegment("bonjour tout le monde", 0, 2_500, 0.8)),
            ),
            languageCode = "fr", durationMs = 2_500,
        )!!
        val rekeyed = LocalTranscriptionResults.Empty.with("local-1", withSegments).rekeyed("local-1", "srv-9")
        assertThat(rekeyed["local-1"]).isNull()
        assertThat(rekeyed["srv-9"]).isEqualTo(withSegments)
        assertThat(rekeyed["srv-9"]!!.segments!!.single().endMs).isEqualTo(2_500)
    }

    @Test
    fun `la langue posee est celle du composeur et un texte vide n'est pas une transcription`() {
        val heard = OnDeviceTranscription("salut", "fr-FR", 0.9)
        assertThat(LocalTranscriptionMapping.toTus(heard, "fr", 1_000)!!.language).isEqualTo("fr")
        assertThat(LocalTranscriptionMapping.toTus(OnDeviceTranscription("  ", "fr-FR", 0.0), "fr", 1_000)).isNull()
    }

    @Test
    fun `huit resultats au plus sont retenus, le plus ancien cede`() {
        val full = (1..9).fold(LocalTranscriptionResults.Empty) { acc, i -> acc.with("a$i", tus("t$i")) }
        assertThat(full.entries.keys).containsExactlyElementsIn((2..9).map { "a$it" }).inOrder()
    }

    @Test
    fun `rekeyer un id inconnu ne change rien`() {
        val one = LocalTranscriptionResults.Empty.with("a", tus())
        assertThat(one.rekeyed("zzz", "srv")).isSameInstanceAs(one)
    }
}
