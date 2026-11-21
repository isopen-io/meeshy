package me.meeshy.ui.component.inactivity

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Test
import org.w3c.dom.Element

/**
 * Les libellés de la vérification d'inactivité (#18738) existent dans les sept langues, avec les mêmes clés et les
 * mêmes arguments, et chaque clé est réservée android-only au manifeste i18n.
 */
class InactivityStringsTest {
    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")
    private val placeholder = Regex("%\\d\\$[sd]")

    private fun strings(folder: String): Map<String, String> {
        val file = File("src/main/res/$folder/strings_verification_inactivite.xml")
        val nodes = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file).getElementsByTagName("string")
        return (0 until nodes.length).map { nodes.item(it) as Element }.associate { it.getAttribute("name") to it.textContent }
    }

    @Test
    fun `les sept langues portent les memes cles et les memes arguments`() {
        val reference = strings("values")
        assertThat(reference).isNotEmpty()
        folders.forEach { folder ->
            val localized = strings(folder)
            assertWithMessage(folder).that(localized.keys).isEqualTo(reference.keys)
            reference.forEach { (name, text) ->
                assertWithMessage("$folder $name").that(placeholder.findAll(localized.getValue(name)).map { it.value }.toSet())
                    .isEqualTo(placeholder.findAll(text).map { it.value }.toSet())
                assertWithMessage("$folder $name").that(localized.getValue(name).trim()).isNotEmpty()
            }
        }
    }

    @Test
    fun `le francais dit les mots du produit`() {
        val fr = strings("values-fr").mapValues { it.value.replace("\\'", "'") }
        assertThat(fr.getValue("inactivity_pill_alert")).isEqualTo("%1\$s n'a pas répondu à « Tout va bien ? »")
        assertThat(fr.getValue("inactivity_pill_responded")).isEqualTo("%1\$s va bien")
        assertThat(fr.getValue("inactivity_card_since")).isEqualTo("Aucune activité depuis %1\$s")
        assertThat(fr.getValue("inactivity_battery")).isEqualTo("Batterie %1\$d %%")
        assertThat(fr.getValue("inactivity_share_person")).isEqualTo("Prévenir %1\$s si je ne réponds pas")
        assertThat(fr.getValue("inactivity_delay_title")).isEqualTo("Vérification d'inactivité")
        assertThat(fr.getValue("inactivity_delay_off")).isEqualTo("Désactivée")
        assertThat(fr.getValue("inactivity_wellness_ok")).isEqualTo("Je vais bien")
    }

    @Test
    fun `chaque cle est reservee android-only au manifeste`() {
        val manifest = File("../i18n/manifest/sdk-ui.d/verification-inactivite-18738.json").readText()
        strings("values").keys.forEach { name ->
            assertWithMessage(name).that(manifest).contains("\"androidName\": \"$name\"")
        }
    }
}
