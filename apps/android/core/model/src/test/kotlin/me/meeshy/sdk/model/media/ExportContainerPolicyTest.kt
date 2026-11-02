package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le fichier qu'un export écrit (#14567) : une vidéo commence sur une IMAGE (sinon le lecteur d'iOS montre du noir
 * tant que le son devance la première image, androidx/media #829), un fichier publié se lit en flux, et aucun export
 * ne rapporte de diagnostic à la plateforme tant que le porteur n'a pas tranché.
 */
class ExportContainerPolicyTest {

    @Test
    fun `une video publiee commence sur une image, se lit en flux et ne rapporte rien`() {
        assertThat(ExportContainerPolicy.of(hasVideo = true, publishes = true))
            .isEqualTo(ExportContainerPolicy(ensureStartsOnVideoFrame = true, platformDiagnostics = false, streamable = true))
    }

    @Test
    fun `un son seul n attend aucune image`() {
        assertThat(ExportContainerPolicy.of(hasVideo = false, publishes = true).ensureStartsOnVideoFrame).isFalse()
        assertThat(ExportContainerPolicy.of(hasVideo = false, publishes = false).ensureStartsOnVideoFrame).isFalse()
    }

    @Test
    fun `un fichier qui reste sur l appareil n a pas a se lire en flux`() {
        assertThat(ExportContainerPolicy.of(hasVideo = true, publishes = false).streamable).isFalse()
        assertThat(ExportContainerPolicy.of(hasVideo = true, publishes = false).ensureStartsOnVideoFrame).isTrue()
    }

    @Test
    fun `aucun export ne rapporte de diagnostic a la plateforme tant que la decision n est pas rendue`() {
        val every = listOf(true, false).flatMap { video -> listOf(true, false).map { publishes -> ExportContainerPolicy.of(video, publishes) } }
        assertThat(every.map { it.platformDiagnostics }.distinct()).containsExactly(false)
    }
}
