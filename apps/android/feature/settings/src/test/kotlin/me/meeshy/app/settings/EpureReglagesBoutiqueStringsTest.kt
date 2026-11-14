package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.app.settings.SettingsResourceTree as Tree
import org.junit.Test

/**
 * Épure 2/3 des réglages Android (#17659, règle 7) : la boutique de packs dit au repos ce que sont les Meeshes
 * et ce que font les packs, sous le titre et avant le solde.
 */
class EpureReglagesBoutiqueStringsTest {

    private val allLocales: List<String?> = listOf<String?>(null) + Tree.locales

    private fun source(file: String): String = Tree.kotlinSources().first { it.name == file }.readText()

    @Test
    fun `the shop orientation names what Meeshes buy`() {
        val text = Tree.entriesOf("fr").getValue("settings_packs_orientation").text.replace("\\'", "'")
        assertThat(text).isEqualTo("Les Meeshes achètent des packs : fonds, contours d'avatar, bannières.")
    }

    @Test
    fun `the shop orientation exists translated in every language`() {
        val french = Tree.entriesOf("fr").getValue("settings_packs_orientation").text
        allLocales.forEach { locale ->
            val text = Tree.entriesOf(locale)["settings_packs_orientation"]?.text
            assertWithMessage("settings_packs_orientation en ${locale ?: "en"}").that(text).isNotEmpty()
            if (locale != "fr") assertWithMessage("traduit en ${locale ?: "en"}").that(text).isNotEqualTo(french)
        }
    }

    @Test
    fun `the shop screen shows the orientation at rest before the balance`() {
        val screen = source("PackShopScreen.kt")
        val orientation = screen.indexOf("SettingsOrientation(stringResource(R.string.settings_packs_orientation))")
        assertThat(orientation).isAtLeast(0)
        assertThat(orientation).isLessThan(screen.indexOf("ui.balance?.let { Balance(it) }"))
    }
}
