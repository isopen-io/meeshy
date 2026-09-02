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

    // ── Magasin statique (#4625) ────────────────────────────────────────────
    //
    // 272 avatars de staging portaient leur adresse absolue et ne s'affichaient
    // QUE pour cette raison : reduits a leur cle, ils partaient se chercher sur
    // la passerelle, ou ils ne sont pas. Ces temoins sont le pendant Kotlin de
    // `packages/shared/api/__tests__/media-ref.test.ts` et de
    // `MeeshyConfigTests` (iOS).

    @Test
    fun `une cle statique va sur l hote STATIQUE, jamais sur la passerelle`() {
        assertThat(resolveMediaUrl("static:u/i/2025/11/avatar_1763143871947_o0.jpg", base))
            .isEqualTo("https://static.meeshy.me/u/i/2025/11/avatar_1763143871947_o0.jpg")
    }

    @Test
    fun `l hote statique se derive du domaine web, pas de la passerelle`() {
        assertThat(resolveMediaUrl("static:u/i/a.jpg", "https://gate.staging.meeshy.me/api/v1"))
            .isEqualTo("https://static.staging.meeshy.me/u/i/a.jpg")
    }

    @Test
    fun `en developpement la cle statique suit le PORT du web, pas celui de l API`() {
        assertThat(resolveMediaUrl("static:u/i/a.jpg", "http://localhost:3000/api/v1"))
            .isEqualTo("http://localhost:3100/u/i/a.jpg")
    }

    @Test
    fun `deux cles qu aucune FORME ne distinguait vont a deux magasins`() {
        // Le temoin decisif : ni `u/i/2025/11/a.jpg` ni `avatars/user/<id>.jpg`
        // ne ressemble a une cle datee, et les deux partaient au meme hote.
        assertThat(resolveMediaUrl("static:u/i/2025/11/a.jpg", base))
            .isEqualTo("https://static.meeshy.me/u/i/2025/11/a.jpg")
        assertThat(resolveMediaUrl("avatars/user/68f2a814.jpg", base))
            .isEqualTo("https://gate.meeshy.me/api/v1/attachments/file/avatars/user/68f2a814.jpg")
    }

    @Test
    fun `une cle statique encode ce qu une URL ne porte pas tel quel`() {
        assertThat(resolveMediaUrl("static:u/i/2025/11/Photo de profil.jpg", base))
            .isEqualTo("https://static.meeshy.me/u/i/2025/11/Photo%20de%20profil.jpg")
    }

    @Test
    fun `sans base configuree, une cle statique est rendue telle quelle`() {
        // Meme contrat que pour une cle de passerelle : rendre une adresse
        // inventee echouerait plus loin, sans dire pourquoi.
        assertThat(resolveMediaUrl("static:u/i/a.jpg", null)).isEqualTo("static:u/i/a.jpg")
    }

    @Test
    fun `un schema sans cle n est pas recompose`() {
        assertThat(resolveMediaUrl("static:", base)).isEqualTo("static:")
        assertThat(resolveMediaUrl("static:/", base)).isEqualTo("static:/")
    }

}
