package me.meeshy.app.feed

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Test
import org.w3c.dom.Element

/**
 * #14749 — les libellés pluriels des statistiques du fil (« 1 j'aime », « 3 commentaires », « 2 republications », « 5 réponses »)
 * existent dans les sept langues avec les quantités CLDR de chacune : l'accord est celui du catalogue, jamais du code.
 */
class FeedStringLocalizationParityTest {

    private val required = mapOf(
        "values" to setOf("one", "other"),
        "values-fr" to setOf("one", "many", "other"),
        "values-es" to setOf("one", "many", "other"),
        "values-pt" to setOf("one", "many", "other"),
        "values-de" to setOf("one", "other"),
        "values-it" to setOf("one", "many", "other"),
        "values-ar" to setOf("zero", "one", "two", "few", "many", "other"),
    )

    private val plurals = listOf("feed_post_stat_likes", "feed_post_stat_comments", "feed_post_stat_reposts", "feed_post_stat_replies")
    private val strings = listOf("feed_bookmark_success", "feed_post_stat_saves", "feed_post_stat_shares", "feed_action_cancel")

    private fun elements(folder: String, tag: String): List<Element> =
        File("src/main/res/$folder").listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            val nodes = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file).getElementsByTagName(tag)
            (0 until nodes.length).map { nodes.item(it) as Element }
        }

    @Test
    fun `every stat plural carries the CLDR quantities of its language`() {
        plurals.forEach { name ->
            required.forEach { (folder, quantities) ->
                val declared = elements(folder, "plurals").filter { it.getAttribute("name") == name }
                    .flatMap { e -> (0 until e.getElementsByTagName("item").length).map { (e.getElementsByTagName("item").item(it) as Element).getAttribute("quantity") } }
                    .toSet()
                assertWithMessage("$folder $name").that(declared).containsAtLeastElementsIn(quantities)
            }
        }
    }

    @Test
    fun `every engagement label is translated in the seven languages`() {
        strings.forEach { name ->
            required.keys.forEach { folder ->
                val found = elements(folder, "string").any { it.getAttribute("name") == name }
                assertWithMessage("$folder $name").that(found).isTrue()
            }
        }
    }
}
