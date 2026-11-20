package me.meeshy.ui.component.fall

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Test
import org.w3c.dom.Element

/**
 * Les libellés de la chute détectée (#18748) existent dans les sept langues, avec les mêmes clés et les
 * mêmes arguments, et chaque clé est réservée android-only au manifeste i18n.
 */
class FallStringsTest {
    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")
    private val placeholder = Regex("%\\d\\$[sd]")

    private fun strings(folder: String): Map<String, String> {
        val file = File("src/main/res/$folder/strings_chute_detectee.xml")
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
        assertThat(fr.getValue("fall_pill_detected")).isEqualTo("Une chute a été détectée sur la montre de %1\$s")
        assertThat(fr.getValue("fall_pill_responded")).isEqualTo("%1\$s va bien")
        assertThat(fr.getValue("fall_card_at")).isEqualTo("Chute détectée à %1\$s")
        assertThat(fr.getValue("fall_share_person")).isEqualTo("Prévenir %1\$s si ma montre détecte une chute")
        assertThat(fr.getValue("fall_me_unavailable")).isEqualTo("Indisponible sur Android : elle vient d'une Apple Watch, réglée depuis l'app iPhone.")
    }

    @Test
    fun `chaque cle est reservee android-only au manifeste`() {
        val manifest = File("../i18n/manifest/sdk-ui.d/chute-detectee-18748.json").readText()
        strings("values").keys.forEach { name ->
            assertWithMessage(name).that(manifest).contains("\"androidName\": \"$name\"")
        }
    }
}
