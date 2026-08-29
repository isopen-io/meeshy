package me.meeshy.sdk.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le SDK pose la route ; la base ne porte que la clé (#4324).
 *
 * Ces témoins gardent la propriété qui manquait aux QUATRE jumelles que ce
 * fichier remplace : pour une clé de stockage, elles rendaient `base + "/" + clé`
 * et perdaient le segment de service.
 */
class MediaUrlResolverTest {

    private val base = "https://gate.meeshy.me/api/v1"

    @Test
    fun `une cle de stockage recoit la route du service`() {
        assertThat(resolveMediaUrl("2025/10/68c07400/photo.png", base))
            .isEqualTo("https://gate.meeshy.me/api/v1/attachments/file/2025/10/68c07400/photo.png")
    }

    @Test
    fun `la route SUIT le prefixe configure — la version n est pas ecrite ici`() {
        assertThat(resolveMediaUrl("2025/10/id/photo.png", "https://gate.meeshy.me/api/v2"))
            .isEqualTo("https://gate.meeshy.me/api/v2/attachments/file/2025/10/id/photo.png")
    }

    @Test
    fun `une barre finale sur la base ne se double pas`() {
        assertThat(resolveMediaUrl("2025/10/id/photo.png", "https://gate.meeshy.me/api/v1/"))
            .isEqualTo("https://gate.meeshy.me/api/v1/attachments/file/2025/10/id/photo.png")
    }

    @Test
    fun `les espaces sont encodes, les barres obliques ne le sont PAS`() {
        assertThat(resolveMediaUrl("2025/10/id/Rapport final.pdf", base))
            .isEqualTo("https://gate.meeshy.me/api/v1/attachments/file/2025/10/id/Rapport%20final.pdf")
    }

    @Test
    fun `une URL complete est rendue telle quelle`() {
        val url = "https://cdn.meeshy.me/api/v1/attachments/file/x.png"
        assertThat(resolveMediaUrl(url, base)).isEqualTo(url)
    }

    @Test
    fun `un chemin absolu se raccroche a l ORIGINE, pas a la base d API`() {
        // Sinon `/api/v1/x` deviendrait `/api/v1/api/v1/x`.
        assertThat(resolveMediaUrl("/api/v1/attachments/file/x.png", base))
            .isEqualTo("https://gate.meeshy.me/api/v1/attachments/file/x.png")
        assertThat(resolveMediaUrl("/thumbs/a1.jpg", base))
            .isEqualTo("https://gate.meeshy.me/thumbs/a1.jpg")
    }

    @Test
    fun `une chaine portant deja le segment ne recoit pas une SECONDE route`() {
        assertThat(resolveMediaUrl("api/v1/attachments/file/abc123", base))
            .isEqualTo("https://gate.meeshy.me/api/v1/attachments/file/abc123")
    }

    @Test
    fun `sans base configuree, la valeur est rendue telle quelle`() {
        assertThat(resolveMediaUrl("2025/10/id/photo.png", null))
            .isEqualTo("2025/10/id/photo.png")
    }

    @Test
    fun `une chaine vide ne designe aucun media et ne recoit pas de route`() {
        assertThat(resolveMediaUrl("", base)).isEqualTo("https://gate.meeshy.me/")
    }
}
