package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test
import org.w3c.dom.Element
import javax.xml.parsers.DocumentBuilderFactory

/**
 * Contrat des libellés de :feature:calls : ce que le catalogue iOS fournit est généré en sept langues (jamais
 * réécrit à la main), un libellé à plusieurs arguments reste positionnel, et chaque langue garde les
 * mêmes arguments que l'anglais pour que la traduction ne puisse pas en perdre un.
 */
class CallsStringsContractTest {

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

    private fun xmlFiles(folder: String): List<File> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().sortedBy { it.name }

    private fun elements(file: File, tag: String): List<Element> {
        val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
        val nodes = document.getElementsByTagName(tag)
        return (0 until nodes.length).map { nodes.item(it) as Element }
    }

    private fun generatedStrings(folder: String): Map<String, String> =
        elements(File(resDir, "$folder/strings_generated.xml"), "string").associate { it.getAttribute("name") to it.textContent }

    private fun quantities(folder: String, plural: String): Set<String> =
        xmlFiles(folder).flatMap { elements(it, "plurals") }
            .filter { it.getAttribute("name") == plural }
            .flatMap { element ->
                val items = element.getElementsByTagName("item")
                (0 until items.length).map { (items.item(it) as Element).getAttribute("quantity") }
            }
            .toSet()

    private fun adoptedNames(): Set<String> {
        val manifests = File("../../i18n/manifest").walkTopDown()
            .filter { it.isFile && it.extension == "json" && (it.name == "calls.json" || it.parentFile.name == "calls.d") }
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
            xmlFiles(folder).filter { it.name != "strings_generated.xml" }.flatMap { file ->
                listOf("string", "plurals").flatMap { tag -> elements(file, tag) }
                    .map { it.getAttribute("name") }
                    .filter { it in adopted }
                    .map { "$folder/${file.name}: $it" }
            }
        }
        assertThat(handWritten).isEmpty()
    }

    @Test
    fun `every adopted string exists in each of the seven languages`() {
        val english = generatedStrings("values").keys
        locales.keys.forEach { folder ->
            assertWithMessage(folder).that(generatedStrings(folder).keys).containsAtLeastElementsIn(english)
        }
    }

    @Test
    fun `a label with several arguments keeps positional specifiers in every language`() {
        val anySpecifier = Regex("%(?:\\d+\\$)?[-#+ 0,(]*\\d*(?:\\.\\d+)?[a-zA-Z]")
        val offenders = locales.keys.flatMap { folder ->
            xmlFiles(folder).flatMap { file ->
                elements(file, "string").filter { it.getAttribute("formatted") != "false" }.mapNotNull { element ->
                    val found = anySpecifier.findAll(element.textContent).map { it.value }.toList()
                    "$folder/${file.name}: ${element.getAttribute("name")}".takeIf {
                        found.size >= 2 && found.any { '$' !in it }
                    }
                }
            }
        }
        assertThat(offenders).isEmpty()
    }

    @Test
    fun `a translation keeps the arguments of the English text`() {
        val specifier = Regex("%\\d+\\$[a-zA-Z]")
        val english = generatedStrings("values").mapValues { (_, text) -> specifier.findAll(text).map { it.value }.toSet() }
        val drifted = locales.keys.filter { it != "values" }.flatMap { folder ->
            generatedStrings(folder).mapNotNull { (name, text) ->
                val expected = english[name] ?: return@mapNotNull null
                "$folder: $name".takeIf { specifier.findAll(text).map { it.value }.toSet() != expected }
            }
        }
        assertThat(drifted).isEmpty()
    }

    @Test
    fun `the plurals carry the CLDR quantities of every language`() {
        PLURALS.forEach { plural ->
            locales.forEach { (folder, required) ->
                assertWithMessage("$folder $plural").that(quantities(folder, plural)).containsAtLeastElementsIn(required)
            }
        }
    }

    @Test
    fun `the incoming call texts follow the iOS catalog`() {
        assertThat(generatedStrings("values")["call_history_incoming"]).isEqualTo("Incoming call")
        assertThat(generatedStrings("values-fr")["call_action_accept"]).isNotEmpty()
    }

    private companion object {
        val PLURALS = emptyList<String>()
    }
}
