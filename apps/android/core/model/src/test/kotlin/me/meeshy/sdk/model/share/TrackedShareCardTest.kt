package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TrackedShareCardTest {
    private val story = ShareCards.story("s1", authorId = "a1", messageText = "Story de Léa : ${ShareCards.storyUrl("s1")}", isPublic = true)
    private val post = ShareCards.post("p1", title = "Bonjour")

    @Test
    fun `a post, a reel and a public story mint a tracked link, a friends story and a profile keep their address`() {
        assertThat(TrackedShareCard.mints(story)).isTrue()
        assertThat(TrackedShareCard.mints(story.copy(isPublicStory = false))).isFalse()
        assertThat(TrackedShareCard.mints(post)).isTrue()
        assertThat(TrackedShareCard.mints(ShareCards.reel("r1", title = ""))).isTrue()
        assertThat(TrackedShareCard.mints(ShareCards.profile("u1", "Léa", "https://meeshy.me/u/lea", "Profil"))).isFalse()
    }

    @Test
    fun `the tracked link replaces the direct address in the link and in the sentence`() {
        val tracked = TrackedShareCard.withLink(story, "https://meeshy.me/l/abc")

        assertThat(tracked.url).isEqualTo("https://meeshy.me/l/abc")
        assertThat(tracked.messageText).isEqualTo("Story de Léa : https://meeshy.me/l/abc")
        assertThat(tracked.contentId).isEqualTo("s1")
    }

    @Test
    fun `the system share carries the sentence, else the link`() {
        assertThat(TrackedShareCard.outgoingText(story)).isEqualTo("Story de Léa : ${ShareCards.storyUrl("s1")}")
        assertThat(TrackedShareCard.outgoingText(post.copy(messageText = null))).isEqualTo(post.url)
    }

    @Test
    fun `the two gestures are measured apart`() {
        assertThat(TrackedShareCard.Gesture.SEND.platform).isEqualTo("meeshy")
        assertThat(TrackedShareCard.Gesture.SHARE_OUT.platform).isEqualTo("system")
    }
}
