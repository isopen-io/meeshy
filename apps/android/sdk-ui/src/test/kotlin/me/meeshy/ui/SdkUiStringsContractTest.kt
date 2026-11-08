package me.meeshy.ui

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Test
import org.w3c.dom.Element

/**
 * Contrat des libellés de :sdk-ui : ce que le catalogue iOS fournit est généré (jamais réécrit à la
 * main), les compteurs sont de vrais pluriels CLDR dans les sept langues, et les libellés `bubble_*`
 * n'existent qu'une fois, dans ce module.
 */
class SdkUiStringsContractTest {

    private val locales = mapOf(
        "values" to setOf("one", "other"),
        "values-fr" to setOf("one", "many", "other"),
        "values-es" to setOf("one", "many", "other"),
        "values-pt" to setOf("one", "many", "other"),
        "values-de" to setOf("one", "other"),
        "values-it" to setOf("one", "many", "other"),
        "values-ar" to setOf("zero", "one", "two", "few", "many", "other"),
    )

    private val resDir = File("src/main/res")

    private fun xmlFiles(dir: File): List<File> =
        dir.listFiles { f -> f.extension == "xml" }.orEmpty().sortedBy { it.name }

    private fun elements(file: File, tag: String): List<Element> {
        val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
        val nodes = document.getElementsByTagName(tag)
        return (0 until nodes.length).map { nodes.item(it) as Element }
    }

    private fun quantities(folder: String, plural: String): Set<String> =
        xmlFiles(File(resDir, folder)).flatMap { elements(it, "plurals") }
            .filter { it.getAttribute("name") == plural }
            .flatMap { element ->
                val items = element.getElementsByTagName("item")
                (0 until items.length).map { (items.item(it) as Element).getAttribute("quantity") }
            }
            .toSet()

    private fun adoptedNames(): Set<String> {
        val manifests = File("../i18n/manifest").walkTopDown()
            .filter { it.isFile && it.extension == "json" && (it.name == "sdk-ui.json" || it.parentFile.name == "sdk-ui.d") }
            .toList()
        val entry = Regex("\\{[^{}]*\\}")
        return manifests.flatMap { file ->
            entry.findAll(file.readText()).map { it.value }
                .filter { "\"status\": \"adopted\"" in it }
                .map { block ->
                    Regex("\"androidName\":\\s*\"([^\"]+)\"").find(block)?.groupValues?.get(1)
                        ?: Regex("\"iosKey\":\\s*\"([^\"]+)\"").find(block)!!.groupValues[1].replace('.', '_').replace('-', '_')
                }
                .toList()
        }.toSet()
    }

    @Test
    fun `every locale folder of the seven languages exists and carries generated strings`() {
        locales.keys.forEach { folder ->
            assertWithMessage(folder).that(File(resDir, "$folder/strings_generated.xml").isFile).isTrue()
        }
    }

    @Test
    fun `an adopted name is never written by hand in a strings file`() {
        val adopted = adoptedNames()
        assertThat(adopted).isNotEmpty()
        val handWritten = locales.keys.flatMap { folder ->
            xmlFiles(File(resDir, folder)).filter { it.name != "strings_generated.xml" }.flatMap { file ->
                listOf("string", "plurals").flatMap { tag -> elements(file, tag) }
                    .map { it.getAttribute("name") }
                    .filter { it in adopted }
                    .map { "$folder/${file.name}: $it" }
            }
        }
        assertThat(handWritten).isEmpty()
    }

    @Test
    fun `the six counters are plurals with the CLDR quantities of every language`() {
        PLURALS.forEach { plural ->
            locales.forEach { (folder, required) ->
                assertWithMessage("$folder $plural").that(quantities(folder, plural)).containsAtLeastElementsIn(required)
            }
        }
    }

    @Test
    fun `a counter is never also a plain string`() {
        val offenders = locales.keys.flatMap { folder ->
            xmlFiles(File(resDir, folder)).flatMap { file -> elements(file, "string") }
                .map { it.getAttribute("name") }
                .filter { it in PLURALS }
                .map { "$folder: $it" }
        }
        assertThat(offenders).isEmpty()
    }

    @Test
    fun `the logo and the recording pill are announced from resources in every language`() {
        RESOURCE_DESCRIPTIONS.forEach { name ->
            locales.keys.forEach { folder ->
                val names = xmlFiles(File(resDir, folder)).flatMap { elements(it, "string") }.map { it.getAttribute("name") }
                assertWithMessage("$folder $name").that(names).contains(name)
            }
        }
    }

    @Test
    fun `a bubble label exists once, in sdk-ui, and no feature declares it again`() {
        val bubbleNames = { files: List<File> ->
            files.flatMap { file -> listOf("string", "plurals").flatMap { elements(file, it) } }
                .map { it.getAttribute("name") }
                .filter { it.startsWith("bubble_") }
                .toSet()
        }
        val own = bubbleNames(xmlFiles(File(resDir, "values")))
        val repeated = File("../feature").listFiles { f -> f.isDirectory }.orEmpty().flatMap { feature ->
            bubbleNames(xmlFiles(File(feature, "src/main/res/values"))).filter { it in own }.map { "${feature.name}: $it" }
        }
        assertThat(own).isNotEmpty()
        assertThat(repeated).isEmpty()
    }

    private companion object {
        val PLURALS = listOf(
            "bubble_story_reactions",
            "bubble_story_comments",
            "bubble_story_shares",
            "bubble_hidden_images",
            "bubble_a11y_images",
            "bubble_a11y_audios",
        )
        val RESOURCE_DESCRIPTIONS = listOf(
            "brand_logo_description",
            "composer_recording_cancel",
            "composer_recording_stop_and_attach",
            "composer_recording_send",
        )
    }
}
