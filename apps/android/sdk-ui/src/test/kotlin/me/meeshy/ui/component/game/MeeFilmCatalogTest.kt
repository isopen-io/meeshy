package me.meeshy.ui.component.game

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

class MeeFilmCatalogTest {
    private val assets = File("src/main/assets")

    @Test
    fun `les identifiants du jeu resolvent un asset embarque et existant`() {
        MeeFilmCatalog.gameFilmIds.forEach { id ->
            val path = MeeFilmCatalog.assetPath(id)
            assertThat(path).isNotNull()
            assertThat(File(assets, path!!).length()).isGreaterThan(0L)
        }
    }

    @Test
    fun `mee-sourire resolve vers le film du pack`() {
        assertThat(MeeFilmCatalog.assetPath("mee-sourire")).isEqualTo("mee_stickers/mee.mee-sourire.lottie")
    }

    @Test
    fun `un identifiant inconnu ne resout rien et ne leve pas`() {
        assertThat(MeeFilmCatalog.assetPath("inconnu")).isNull()
        assertThat(MeeFilmCatalog.isAnimated("inconnu")).isFalse()
    }

    @Test
    fun `un Instant de Mee resout son film embarque et dit s'il bouge`() {
        val path = MeeFilmCatalog.assetPath("instant-bonjour")
        assertThat(path).isEqualTo("mee_stickers/mee.instant-bonjour.lottie")
        assertThat(File(assets, path!!).length()).isGreaterThan(0L)
        assertThat(MeeFilmCatalog.isAnimated("instant-bonjour")).isTrue()
        assertThat(MeeFilmCatalog.isAnimated("instant-printemps")).isFalse()
    }
}
