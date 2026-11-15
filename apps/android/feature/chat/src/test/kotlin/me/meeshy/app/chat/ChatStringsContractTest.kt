package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Test
import org.w3c.dom.Element

/** #15079 — contrat des ressources de :feature:chat, lu sur l'arbre réel (les sept dossiers de langue). */
class ChatStringsContractTest {

    private val resDir: File = generateSequence(File("").absoluteFile) { it.parentFile }
        .flatMap { sequenceOf(File(it, "src/main/res"), File(it, "feature/chat/src/main/res")) }
        .first { File(it, "values/strings.xml").exists() }

    // Libellé iOS repris tel quel (« reaction(s) ») ; son pluriel revient à la fiche du message.
    private val IOS_REACTION_COUNT_A11Y = "message_detail_reactions_count_a11y"

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val pluralNames = listOf(
        "chat_forward_members",
        "chat_pinned_count",
        "chat_typing_many",
        "chat_header_members",
        "chat_clipboard_char_count",
        "conversation_members_title",
    )

    private val required = mapOf(
        "values" to setOf("one", "other"),
        "values-de" to setOf("one", "other"),
        "values-fr" to setOf("one", "many", "other"),
        "values-es" to setOf("one", "many", "other"),
        "values-pt" to setOf("one", "many", "other"),
        "values-it" to setOf("one", "many", "other"),
        "values-ar" to setOf("zero", "one", "two", "few", "many", "other"),
    )

    private fun elements(folder: String): List<Element> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            val nodes = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file).documentElement.childNodes
            (0 until nodes.length).mapNotNull { nodes.item(it) as? Element }
        }

    private fun plurals(folder: String): Map<String, Map<String, String>> =
        elements(folder).filter { it.tagName == "plurals" }.associate { plural ->
            val items = plural.getElementsByTagName("item")
            plural.getAttribute("name") to (0 until items.length).associate {
                val item = items.item(it) as Element
                item.getAttribute("quantity") to item.textContent
            }
        }

    @Test
    fun `the seven counters are plurals with their CLDR quantities in the seven locales`() {
        folders.forEach { folder ->
            val found = plurals(folder)
            pluralNames.forEach { name ->
                assertWithMessage("$folder $name").that(found.keys).contains(name)
                assertWithMessage("$folder $name").that(found.getValue(name).keys)
                    .containsAtLeastElementsIn(required.getValue(folder))
            }
        }
    }

    @Test
    fun `no string of the base locale keeps the parenthesised plural`() {
        elements("values").filter { it.getAttribute("name") != IOS_REACTION_COUNT_A11Y }.forEach {
            assertWithMessage(it.getAttribute("name")).that(it.textContent).doesNotContain("(s)")
        }
    }

    @Test
    fun `a string with two arguments or more is positional`() {
        val bare = Regex("%(?!\\d+\\$)[ds]")
        folders.forEach { folder ->
            elements(folder).filter { it.tagName == "string" }.forEach {
                val text = it.textContent
                if (Regex("%\\d*\\$?[ds]").findAll(text).count() >= 2) {
                    assertWithMessage("$folder ${it.getAttribute("name")}").that(bare.containsMatchIn(text)).isFalse()
                }
            }
        }
    }

    @Test
    fun `the module carries a values folder for every shipped locale`() {
        assertThat(folders.filter { File(resDir, it).isDirectory }).containsExactlyElementsIn(folders)
    }
}
