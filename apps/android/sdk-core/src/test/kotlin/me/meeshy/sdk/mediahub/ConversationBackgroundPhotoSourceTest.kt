package me.meeshy.sdk.mediahub

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationBackgroundPhotoSourceTest {
    private fun photos() = ConversationBackgroundPhotos(ConversationMediaHubIndex(null))

    @Test
    fun `une pièce inconnue se lit par la route authentifiée qui vérifie l'appartenance`() {
        val source = photos().resolve("c1", "a1", "https://gate.example/api/v1/")
        assertThat(source.authenticated).isTrue()
        assertThat(source.fullUrl).isEqualTo("https://gate.example/api/v1/attachments/a1")
    }

    @Test
    fun `une pièce choisie ici est retenue et lue sans réseau d'identité`() {
        val photos = photos()
        photos.remember("a1", BackgroundPhotoSource("https://t", "https://f"))
        val source = photos.resolve("c1", "a1", "https://gate.example/api/v1")
        assertThat(source.authenticated).isFalse()
        assertThat(source.fullUrl).isEqualTo("https://f")
    }
}
