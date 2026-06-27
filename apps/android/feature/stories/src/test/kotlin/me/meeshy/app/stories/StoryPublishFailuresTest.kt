package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.story.FailedStoryPublish
import org.junit.Test

class StoryPublishFailuresTest {

    private fun failed(
        cmid: String,
        content: String = "oops",
        failedAtMillis: Long = 0L,
    ) = FailedStoryPublish(
        cmid = cmid,
        tempId = "pending_$cmid",
        content = content,
        visibility = "PUBLIC",
        originalLanguage = "fr",
        createdAtMillis = 0L,
        failedAtMillis = failedAtMillis,
    )

    @Test
    fun `no failures map to no items`() {
        assertThat(StoryPublishFailures.from(emptyList())).isEmpty()
    }

    @Test
    fun `a failure becomes an item keyed by its cmid`() {
        val items = StoryPublishFailures.from(listOf(failed("c1", content = "hello world")))

        val item = items.single()
        assertThat(item.cmid).isEqualTo("c1")
        assertThat(item.preview).isEqualTo("hello world")
        assertThat(item.failedAtMillis).isEqualTo(0L)
    }

    @Test
    fun `failures are ordered most-recently-failed first`() {
        val items = StoryPublishFailures.from(
            listOf(
                failed("old", failedAtMillis = 100L),
                failed("new", failedAtMillis = 300L),
                failed("mid", failedAtMillis = 200L),
            ),
        )

        assertThat(items.map { it.cmid }).containsExactly("new", "mid", "old").inOrder()
    }

    @Test
    fun `failures with the same timestamp keep their input order`() {
        val items = StoryPublishFailures.from(
            listOf(
                failed("a", failedAtMillis = 50L),
                failed("b", failedAtMillis = 50L),
            ),
        )

        assertThat(items.map { it.cmid }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `a multi-line story collapses to a single-line preview`() {
        val item = StoryPublishFailures.from(listOf(failed("c1", content = "line one\n\nline   two")))
            .single()

        assertThat(item.preview).isEqualTo("line one line two")
    }

    @Test
    fun `surrounding whitespace is trimmed from the preview`() {
        val item = StoryPublishFailures.from(listOf(failed("c1", content = "   spaced   ")))
            .single()

        assertThat(item.preview).isEqualTo("spaced")
    }

    @Test
    fun `a preview exactly at the cap is kept whole`() {
        val exact = "x".repeat(StoryPublishFailures.PREVIEW_MAX)

        val item = StoryPublishFailures.from(listOf(failed("c1", content = exact))).single()

        assertThat(item.preview).isEqualTo(exact)
        assertThat(item.preview).doesNotContain("…")
    }

    @Test
    fun `a preview over the cap is truncated with an ellipsis`() {
        val long = "x".repeat(StoryPublishFailures.PREVIEW_MAX + 10)

        val item = StoryPublishFailures.from(listOf(failed("c1", content = long))).single()

        assertThat(item.preview).hasLength(StoryPublishFailures.PREVIEW_MAX + 1)
        assertThat(item.preview).endsWith("…")
    }
}
