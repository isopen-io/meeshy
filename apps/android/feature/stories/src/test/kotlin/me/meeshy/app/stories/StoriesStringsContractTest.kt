package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test
import org.w3c.dom.Element
import javax.xml.parsers.DocumentBuilderFactory

/**
 * Contrat des libellés du module :feature:stories : ce que le catalogue iOS fournit est généré (jamais
 * réécrit à la main), les pluriels portent les quantités CLDR de chacune des sept langues, et un
 * libellé à plusieurs arguments reste positionnel pour qu'une traduction puisse le réordonner.
 */
class StoriesStringsContractTest {

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
            .filter { it.isFile && it.extension == "json" && (it.name == "stories.json" || it.parentFile.name == "stories.d") }
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
    fun `the counters are plurals with the CLDR quantities of every language`() {
        PLURALS.forEach { plural ->
            locales.forEach { (folder, required) ->
                assertWithMessage("$folder $plural").that(quantities(folder, plural)).containsAtLeastElementsIn(required)
            }
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

    private companion object {
        val PLURALS = listOf("stories_viewers_count", "stories_comments_count", "story_send_members")
    }
}
