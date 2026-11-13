package me.meeshy.feature.kit

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

/** L'argument de lancement ouvre l'entrée demandée, et une clé inconnue ou non livrée laisse la liste. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class KitCatalogLaunchTest {

    private val entries = listOf(
        MeeshyKitCatalogEntry("K01", "MeeshyGlassTone"),
        MeeshyKitCatalogEntry("K02", "MeeshyGlassButton", listOf(MeeshyKitCatalogState("repos"))),
    )

    @Test
    fun `une cle livree ouvre son detail, casse ignoree`() {
        assertThat(KitCatalogLaunch.initialKey("k02", entries)).isEqualTo("K02")
        assertThat(KitCatalogLaunch.initialKey("K02", entries)).isEqualTo("K02")
    }

    @Test
    fun `une cle inconnue ou non livree laisse la liste`() {
        assertThat(KitCatalogLaunch.initialKey("K99", entries)).isNull()
        assertThat(KitCatalogLaunch.initialKey("K01", entries)).isNull()
        assertThat(KitCatalogLaunch.initialKey("", entries)).isNull()
        assertThat(KitCatalogLaunch.initialKey(requested = null, entries = entries)).isNull()
    }

    @Test
    fun `l'extra kit de l'intention est la cle demandee`() {
        val intent = Intent().putExtra(KitCatalogLaunch.EXTRA_KIT, "K02")

        assertThat(KitCatalogLaunch.initialKey(intent, entries)).isEqualTo("K02")
        assertThat(KitCatalogLaunch.initialKey(Intent(), entries)).isNull()
    }

    @Test
    fun `le catalogue reel n'ouvre rien tant qu'aucun composant n'est livre`() {
        assertThat(MeeshyKitCatalog.listedEntries.all { it.isDelivered }).isTrue()
        assertThat(KitCatalogLaunch.initialKey("K99")).isNull()
    }
}
