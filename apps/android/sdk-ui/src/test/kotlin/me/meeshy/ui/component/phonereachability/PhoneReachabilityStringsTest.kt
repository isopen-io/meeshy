package me.meeshy.ui.component.phonereachability

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Test
import org.w3c.dom.Element

/**
 * Les libellés du téléphone injoignable (#18737) existent dans les sept langues, avec les mêmes clés et les mêmes
 * arguments, et chaque clé est réservée android-only au manifeste i18n.
 */
class PhoneReachabilityStringsTest {
    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")
    private val placeholder = Regex("%\\d\\$[sd]")

    private fun strings(folder: String): Map<String, String> {
        val file = File("src/main/res/$folder/strings_telephone_injoignable.xml")
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
        assertThat(fr.getValue("phone_reachability_pill_unreachable")).isEqualTo("Le téléphone de %1\$s est injoignable depuis %2\$s")
        assertThat(fr.getValue("phone_reachability_pill_reachable")).isEqualTo("Le téléphone de %1\$s répond de nouveau")
        assertThat(fr.getValue("phone_reachability_someone")).isEqualTo("un proche")
        assertThat(fr.getValue("phone_reachability_card_since")).isEqualTo("Téléphone injoignable depuis %1\$s")
        assertThat(fr.getValue("phone_reachability_cause_battery")).isEqualTo("Batterie vide, probablement")
        assertThat(fr.getValue("phone_reachability_cause_network")).isEqualTo("Sans réseau ou en mode avion, probablement")
        assertThat(fr.getValue("phone_reachability_share_person")).isEqualTo("Prévenir %1\$s si mon téléphone est injoignable")
        assertThat(fr.getValue("phone_reachability_share_global_title")).isEqualTo("Prévenir mes Proches si mon téléphone est injoignable")
    }

    @Test
    fun `chaque cle est reservee android-only au manifeste`() {
        val manifest = File("../i18n/manifest/sdk-ui.d/telephone-injoignable-18737.json").readText()
        strings("values").keys.forEach { name ->
            assertWithMessage(name).that(manifest).contains("\"androidName\": \"$name\"")
        }
    }
}
