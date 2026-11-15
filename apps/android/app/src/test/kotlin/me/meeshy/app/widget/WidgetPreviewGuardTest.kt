package me.meeshy.app.widget

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

class WidgetPreviewGuardTest {

    private val res = File("src/main/res")
    private val infos = res.resolve("xml").listFiles { f -> f.name.endsWith("_widget_info.xml") }.orEmpty().sortedBy { it.name }

    private fun attr(text: String, name: String): String? =
        Regex("android:$name=\"@(?:drawable|layout)/([^\"]+)\"").find(text)?.groupValues?.get(1)

    @Test
    fun `the four widgets are covered`() {
        assertThat(infos.map { it.name }).containsExactly(
            "favorite_contacts_widget_info.xml",
            "quick_reply_widget_info.xml",
            "recent_conversations_widget_info.xml",
            "unread_count_widget_info.xml",
        )
    }

    @Test
    fun `every widget previews itself, never the launcher icon, with an existing resource`() {
        infos.forEach { info ->
            val text = info.readText()
            val image = attr(text, "previewImage")
            val layout = attr(text, "previewLayout")
            assertThat(image).isNotNull()
            assertThat(image).doesNotContain("ic_launcher")
            assertThat(res.resolve("drawable/$image.xml").exists()).isTrue()
            assertThat(layout).isNotNull()
            assertThat(res.resolve("layout/$layout.xml").exists()).isTrue()
        }
    }

    @Test
    fun `sizes follow the iOS families with a target cell grid`() {
        infos.forEach { info ->
            val text = info.readText()
            assertThat(text).contains("android:targetCellWidth")
            assertThat(text).contains("android:resizeMode=\"horizontal|vertical\"")
        }
        assertThat(res.resolve("xml/unread_count_widget_info.xml").readText()).contains("targetCellWidth=\"2\"")
        assertThat(res.resolve("xml/recent_conversations_widget_info.xml").readText()).contains("targetCellWidth=\"4\"")
    }
}
