package me.meeshy.ui.sticker

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.sticker.MeeInstantCatalog
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import org.junit.Test

/**
 * Garde de dérive : les films .lottie sont synchronisés par `apps/android/scripts/sync-mee-assets.sh` depuis la
 * ressource iOS ; un catalogue sans film, ou un film sans catalogue, fait échouer la CI.
 */
class MeeStickerAssetsGuardTest {
    private val assets: File = File("src/main/assets/${MeeStickerCatalog.ASSET_DIRECTORY}")
    private val files: Set<String> = assets.listFiles().orEmpty().map { it.name }.toSet()
    private val catalogued: List<String> =
        MeeStickerCatalog.all.map { MeeStickerCatalog.assetFileName(it.id) } + MeeInstantCatalog.all.map { it.assetFileName }

    @Test
    fun `les 264 films sont presents dans les assets`() {
        assertThat(files).hasSize(264)
        assertThat(files.all { it.endsWith(".${MeeStickerCatalog.FILM_EXTENSION}") }).isTrue()
    }

    @Test
    fun `le nombre d'assets egale le nombre d'entrees des deux catalogues`() {
        assertThat(catalogued).hasSize(MeeStickerCatalog.all.size + MeeInstantCatalog.all.size)
        assertThat(files.size).isEqualTo(catalogued.size)
    }

    @Test
    fun `chaque entree des catalogues pointe vers un fichier existant et non vide`() {
        val missing = catalogued.filter { name -> File(assets, name).let { !it.isFile || it.length() == 0L } }
        assertThat(missing).isEmpty()
    }

    @Test
    fun `aucun film n'est orphelin du catalogue`() {
        assertThat(files - catalogued.toSet()).isEmpty()
    }
}
