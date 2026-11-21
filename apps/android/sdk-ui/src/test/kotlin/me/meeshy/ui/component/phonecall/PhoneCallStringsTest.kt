package me.meeshy.ui.component.phonecall

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Test
import org.w3c.dom.Element

/**
 * Les libellés d'« en appel » (#18753) existent dans les sept langues, avec les mêmes clés et les mêmes arguments,
 * chaque clé est réservée android-only au manifeste i18n, et aucun ne nomme un interlocuteur.
 */
class PhoneCallStringsTest {
    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")
    private val placeholder = Regex("%\\d\\$[sd]")

    private fun strings(folder: String): Map<String, String> {
        val file = File("src/main/res/$folder/strings_en_appel.xml")
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
        val fr = strings("values-fr")
        assertThat(fr.getValue("phone_call_pill_started")).isEqualTo("%1\$s est en appel")
        assertThat(fr.getValue("phone_call_pill_ended")).isEqualTo("%1\$s a raccroché")
        assertThat(fr.getValue("phone_call_since_minutes")).isEqualTo("En appel depuis %1\$d min")
        assertThat(fr.getValue("phone_call_since_clock")).isEqualTo("En appel depuis %1\$s")
        assertThat(fr.getValue("phone_call_share_global_title")).isEqualTo("Montrer à mes Sangs que je suis en appel")
    }

    @Test
    fun `chaque cle est reservee android-only au manifeste`() {
        val manifest = File("../i18n/manifest/sdk-ui.d/en-appel-18753.json").readText()
        strings("values").keys.forEach { name ->
            assertWithMessage(name).that(manifest).contains("\"androidName\": \"$name\"")
        }
    }
}
