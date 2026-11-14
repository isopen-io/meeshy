package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Test
import org.w3c.dom.Element

/**
 * Épure #18090 : les commentaires d'un réel passent par le fil partagé (titre « Comments », état vide
 * du fil), donc l'ancien état vide et ses libellés voisins n'ont plus aucun lecteur et quittent les
 * sept langues.
 */
class EpureReelsCommentsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")
    private val resDir = File("src/main/res")

    private val orphans = listOf(
        "reels_comments_empty_title", "reels_comments_empty_subtitle", "reels_comments_loading",
        "reels_comments_error", "reels_comments_failed", "reels_comments_input_hint",
        "reels_comments_composer_hint", "reels_comments_send",
    )

    private fun names(folder: String): Set<String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
            listOf("string", "plurals").flatMap { tag ->
                val nodes = document.getElementsByTagName(tag)
                (0 until nodes.length).map { (nodes.item(it) as Element).getAttribute("name") }
            }
        }.toSet()

    @Test
    fun `no orphan comment label of the old empty state stays in any language`() {
        folders.forEach { folder ->
            assertWithMessage(folder).that(names(folder).intersect(orphans.toSet())).isEmpty()
        }
    }

    @Test
    fun `the labels the thread still reads stay in every language`() {
        folders.forEach { folder ->
            assertWithMessage(folder).that(names(folder))
                .containsAtLeast("reels_comments_title", "reels_comments_count", "reels_comments_view_post")
        }
    }

    @Test
    fun `the manifest no longer declares the orphan labels`() {
        val declared = File("../../i18n/manifest").walkTopDown()
            .filter { it.isFile && it.extension == "json" && (it.name == "reels.json" || it.parentFile.name == "reels.d") }
            .joinToString("\n") { it.readText() }
        orphans.forEach { assertThat(declared).doesNotContain("\"$it\"") }
    }
}
