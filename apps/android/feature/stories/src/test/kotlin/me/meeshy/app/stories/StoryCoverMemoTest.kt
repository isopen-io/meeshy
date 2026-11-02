package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import org.junit.Test

class StoryCoverMemoTest {

    private fun group(
        thumb: String? = null,
        url: String? = null,
        type: FeedMediaType = FeedMediaType.IMAGE,
        avatar: String? = "avatar",
    ) = StoryGroup(
        id = "u1",
        avatarURL = avatar,
        stories = listOf(
            StoryItem(id = "s0"),
            StoryItem(id = "s1", media = listOf(FeedMedia(id = "m", type = type, url = url, thumbnailUrl = thumb))),
        ),
    )

    private class Probe(val answers: Map<String, String?> = emptyMap()) {
        val calls = mutableListOf<String>()
        fun call(storyId: String): String? = answers[storyId].also { calls += storyId }
    }

    @Test
    fun `la sonde n'est appelee qu'une fois par story, absence comprise`() {
        val memo = StoryCoverMemo()
        val probe = Probe()
        repeat(3) { memo.coverUrl(group(), "me", probe::call) }
        assertThat(probe.calls).containsExactly("s1")
    }

    @Test
    fun `un changement de compte vide la memoire`() {
        val memo = StoryCoverMemo()
        val probe = Probe()
        memo.coverUrl(group(), "a", probe::call)
        memo.coverUrl(group(), "b", probe::call)
        assertThat(probe.calls).hasSize(2)
    }

    @Test
    fun `une cover ecrite apres coup est vue apres bumpGeneration`() {
        val memo = StoryCoverMemo()
        assertThat(memo.coverUrl(group(), "me") { null }).isEqualTo("avatar")
        assertThat(memo.coverUrl(group(), "me") { "/disk/s1.jpg" }).isEqualTo("avatar")
        memo.bumpGeneration()
        assertThat(memo.coverUrl(group(), "me") { "/disk/s1.jpg" }).isEqualTo("/disk/s1.jpg")
    }

    @Test
    fun `cascade cover locale puis miniature serveur puis image puis avatar`() {
        val memo = StoryCoverMemo()
        assertThat(memo.coverUrl(group(thumb = "t", url = "u"), "x") { "/l" }).isEqualTo("/l")
        memo.reset()
        assertThat(memo.coverUrl(group(thumb = "t", url = "u"), "x") { null }).isEqualTo("t")
        memo.reset()
        assertThat(memo.coverUrl(group(url = "u"), "x") { null }).isEqualTo("u")
        memo.reset()
        assertThat(memo.coverUrl(group(url = "u", type = FeedMediaType.VIDEO), "x") { null }).isEqualTo("avatar")
    }

    @Test
    fun `un groupe sans story rend l'avatar sans sonder`() {
        val probe = Probe()
        val empty = StoryGroup(id = "u", avatarURL = "a")
        assertThat(StoryCoverMemo().coverUrl(empty, "x", probe::call)).isEqualTo("a")
        assertThat(probe.calls).isEmpty()
    }
}
