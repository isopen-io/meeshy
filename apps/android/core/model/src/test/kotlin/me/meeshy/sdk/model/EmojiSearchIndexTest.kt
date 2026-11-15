package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EmojiSearchIndexTest {

    private val index = EmojiSearchIndex.build()

    @Test
    fun `a blank query finds nothing`() {
        assertThat(index.search("")).isEmpty()
        assertThat(index.search("   ")).isEmpty()
    }

    @Test
    fun `case does not matter`() {
        assertThat(index.search("HEART")).isEqualTo(index.search("heart"))
        assertThat(index.search("HeArT")).contains("❤️")
    }

    @Test
    fun `accents do not matter on either side`() {
        assertThat(index.search("colere")).contains("😠")
        assertThat(index.search("colère")).contains("😠")
        assertThat(index.search("COLÈRE")).contains("😠")
        assertThat(index.search("corazon")).contains("❤️")
        assertThat(index.search("corazón")).contains("❤️")
        assertThat(index.search("coeur")).contains("❤️")
        assertThat(index.search("cœur")).contains("❤️")
        assertThat(index.search("lachen")).contains("😂")
        assertThat(index.search("lächeln")).contains("😀")
    }

    @Test
    fun `keywords in the seven app languages find the same emoji`() {
        listOf("heart", "coeur", "corazon", "coracao", "herz", "cuore", "قلب").forEach { word ->
            assertThat(index.search(word)).contains("❤️")
        }
    }

    @Test
    fun `a typed prefix finds the keyword it starts`() {
        assertThat(index.search("hear")).contains("❤️")
        assertThat(index.search("pleu")).contains("😭")
    }

    @Test
    fun `a single letter only matches whole keywords, not every prefix`() {
        assertThat(index.search("h")).isEmpty()
    }

    @Test
    fun `an emoji typed in the field finds itself`() {
        assertThat(index.search("🔥")).containsExactly("🔥")
    }

    @Test
    fun `exact keyword matches come before prefix matches`() {
        val results = index.search("sun")
        assertThat(results.first()).isEqualTo("☀️")
    }

    @Test
    fun `results are unique, deterministic and capped at sixty`() {
        val results = index.search("heart")
        assertThat(results.toSet()).hasSize(results.size)
        assertThat(index.search("heart")).isEqualTo(results)
        assertThat(index.search("ca").size).isAtMost(EmojiSearchIndex.MAX_RESULTS)
    }

    @Test
    fun `an unknown word finds nothing`() {
        assertThat(index.search("zzzzqqqq")).isEmpty()
    }

    @Test
    fun `search never offers an emoji the grid does not show`() {
        val grid = EmojiCatalog.searchableCategories.flatMap { it.emojis }.toSet()
        EmojiKeywords.entries.flatMap { it.words }.forEach { word ->
            assertThat(grid).containsAtLeastElementsIn(index.search(word))
        }
    }

    @Test
    fun `every emoji named by a keyword exists in the catalog`() {
        val grid = EmojiCatalog.searchableCategories.flatMap { it.emojis }.toSet()
        EmojiKeywords.entries.forEach { entry ->
            assertThat(grid).containsAtLeastElementsIn(entry.emojis)
        }
    }

    @Test
    fun `folding drops accents and case and keeps ligatures readable`() {
        assertThat(EmojiSearchIndex.fold("  CRÈME Brûlée ")).isEqualTo("creme brulee")
        assertThat(EmojiSearchIndex.fold("Cœur")).isEqualTo("coeur")
        assertThat(EmojiSearchIndex.fold("Straße")).isEqualTo("strasse")
    }
}
