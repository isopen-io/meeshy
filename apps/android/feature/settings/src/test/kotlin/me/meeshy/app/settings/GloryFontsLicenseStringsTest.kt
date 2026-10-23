package me.meeshy.app.settings

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

class GloryFontsLicenseStringsTest {

    private val locales = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    @Test
    fun `la section des polices des cadres existe dans les sept locales`() {
        locales.forEach { folder ->
            val file = File("src/main/res/$folder/strings_polices_gloire.xml")
            assertWithMessage("$folder sans section des polices").that(file.isFile).isTrue()
            val xml = file.readText()
            assertWithMessage(folder).that(xml).contains("licenses_glory_fonts_title")
            assertWithMessage(folder).that(xml).contains("licenses_glory_fonts_row_description")
        }
    }

    @Test
    fun `l ecran des licences affiche la section des polices`() {
        val screen = File("src/main/kotlin/me/meeshy/app/settings/LicensesScreen.kt").readText()
        assertWithMessage("section absente").that(screen).contains("GloryFrameFontCredits.CREDITS")
    }
}
