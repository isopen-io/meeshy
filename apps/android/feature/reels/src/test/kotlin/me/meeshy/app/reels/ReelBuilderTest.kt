package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import org.junit.Test

class ReelBuilderTest {

    private fun videoPost(
        id: String,
        isBookmarkedByMe: Boolean? = null,
        bookmarkCount: Int? = null,
        type: String? = "REEL",
    ) = ApiPost(
        id = id,
        type = type,
        isBookmarkedByMe = isBookmarkedByMe,
        bookmarkCount = bookmarkCount,
        media = listOf(ApiPostMedia(id = "m-$id", mimeType = "video/mp4", fileUrl = "https://cdn.test/$id.mp4")),
    )

    // MARK: - build: bookmark projection

    @Test
    fun `build carries the viewer's own bookmark state and count`() {
        val reels = ReelBuilder.build(
            listOf(videoPost("r1", isBookmarkedByMe = true, bookmarkCount = 5)),
            mediaBaseUrl = null,
        )

        assertThat(reels.single().isBookmarked).isTrue()
        assertThat(reels.single().bookmarkCount).isEqualTo(5)
    }

    @Test
    fun `build defaults an absent bookmark state to unbookmarked with a zero count`() {
        val reels = ReelBuilder.build(listOf(videoPost("r1")), mediaBaseUrl = null)

        assertThat(reels.single().isBookmarked).isFalse()
        assertThat(reels.single().bookmarkCount).isEqualTo(0)
    }

    // MARK: - build: REEL-only membership

    @Test
    fun `build keeps only posts typed REEL, even when an ordinary POST carries a video`() {
        val reels = ReelBuilder.build(
            listOf(
                videoPost("reel-1", type = "REEL"),
                videoPost("post-with-video", type = "POST"),
            ),
            mediaBaseUrl = null,
        )

        assertThat(reels.map { it.id }).containsExactly("reel-1")
    }

    @Test
    fun `build drops a video post with no type at all`() {
        val reels = ReelBuilder.build(listOf(videoPost("untyped", type = null)), mediaBaseUrl = null)

        assertThat(reels).isEmpty()
    }

    @Test
    fun `build matches the REEL type case-insensitively`() {
        val reels = ReelBuilder.build(listOf(videoPost("r1", type = "reel")), mediaBaseUrl = null)

        assertThat(reels.map { it.id }).containsExactly("r1")
    }

    // MARK: - withSeedFirst

    @Test
    fun `withSeedFirst moves the seed reel to the front`() {
        val reels = ReelBuilder.build(listOf(videoPost("r1"), videoPost("r2"), videoPost("r3")), mediaBaseUrl = null)

        val seeded = ReelBuilder.withSeedFirst(reels, "r3")

        assertThat(seeded.map { it.id }).containsExactly("r3", "r1", "r2").inOrder()
    }

    @Test
    fun `withSeedFirst leaves the list untouched when the seed is already first`() {
        val reels = ReelBuilder.build(listOf(videoPost("r1"), videoPost("r2")), mediaBaseUrl = null)

        val seeded = ReelBuilder.withSeedFirst(reels, "r1")

        assertThat(seeded).isEqualTo(reels)
    }

    @Test
    fun `withSeedFirst leaves the list untouched when the seed is absent`() {
        val reels = ReelBuilder.build(listOf(videoPost("r1"), videoPost("r2")), mediaBaseUrl = null)

        val seeded = ReelBuilder.withSeedFirst(reels, "not-in-thread")

        assertThat(seeded).isEqualTo(reels)
    }

    @Test
    fun `withSeedFirst leaves the list untouched when the seed is blank or null`() {
        val reels = ReelBuilder.build(listOf(videoPost("r1"), videoPost("r2")), mediaBaseUrl = null)

        assertThat(ReelBuilder.withSeedFirst(reels, null)).isEqualTo(reels)
        assertThat(ReelBuilder.withSeedFirst(reels, "")).isEqualTo(reels)
    }
}
