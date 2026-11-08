package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PublicationTarget
import me.meeshy.sdk.model.share.ShareCards
import me.meeshy.sdk.model.share.TrackedShareCard
import org.junit.Test

class StoryRepostDestinationTest {

    @Test
    fun `each destination republishes under the wire type of its target`() {
        assertThat(StoryRepostDestination.entries.map { it.targetType }).containsExactly("STORY", "POST", "REEL").inOrder()
        assertThat(StoryRepostDestination.of(PublicationTarget.POST)).isEqualTo(StoryRepostDestination.POST)
        assertThat(StoryRepostDestination.of(PublicationTarget.REEL)).isEqualTo(StoryRepostDestination.REEL)
        assertThat(StoryRepostDestination.of(PublicationTarget.STORY)).isEqualTo(StoryRepostDestination.STORY)
    }

    @Test
    fun `a wire type that is not a destination is none`() {
        assertThat(StoryRepostDestination.fromTargetType("REEL")).isEqualTo(StoryRepostDestination.REEL)
        assertThat(StoryRepostDestination.fromTargetType("STATUS")).isNull()
        assertThat(StoryRepostDestination.fromTargetType(null)).isNull()
    }

    @Test
    fun `the gateway names its refusals the way iOS does`() {
        assertThat(StoryRepostFailure.classify(404)).isEqualTo(StoryRepostFailure.SOURCE_GONE)
        assertThat(StoryRepostFailure.classify(403)).isEqualTo(StoryRepostFailure.AUDIENCE_WIDENING)
        assertThat(StoryRepostFailure.classify(500)).isEqualTo(StoryRepostFailure.OTHER)
        assertThat(StoryRepostFailure.classify(null)).isEqualTo(StoryRepostFailure.OTHER)
    }

    @Test
    fun `only a refusal the same request would meet again is final`() {
        assertThat(StoryRepostFailure.isFinal(404)).isTrue()
        assertThat(StoryRepostFailure.isFinal(403)).isTrue()
        assertThat(StoryRepostFailure.isFinal(400)).isTrue()
        assertThat(StoryRepostFailure.isFinal(401)).isFalse()
        assertThat(StoryRepostFailure.isFinal(408)).isFalse()
        assertThat(StoryRepostFailure.isFinal(429)).isFalse()
        assertThat(StoryRepostFailure.isFinal(503)).isFalse()
        assertThat(StoryRepostFailure.isFinal(null)).isFalse()
    }

    @Test
    fun `only a transport failure waits for the network`() {
        assertThat(StoryRepostFailure.waitsForNetwork(null)).isTrue()
        assertThat(StoryRepostFailure.waitsForNetwork(500)).isFalse()
        assertThat(StoryRepostFailure.waitsForNetwork(404)).isFalse()
    }
}

/** Le lien d'une story : traçable pour une story publique seulement, l'URL brute sinon (iOS `ShareCard.mintsTrackedLink`). */
class StoryShareLinkTest {

    private fun story(isPublic: Boolean) = ShareCards.story("s1", authorId = "a1", messageText = "Story de Léa : ${ShareCards.storyUrl("s1")}", isPublic = isPublic)

    @Test
    fun `a public story takes the tracked link in its sentence`() {
        val card = story(isPublic = true)
        assertThat(TrackedShareCard.mints(card)).isTrue()
        val ready = TrackedShareCard.withLink(card, "https://meeshy.me/l/abc")
        assertThat(TrackedShareCard.outgoingText(ready)).isEqualTo("Story de Léa : https://meeshy.me/l/abc")
    }

    @Test
    fun `a story that is not public keeps its raw address, the link would widen its audience`() {
        val card = story(isPublic = false)
        assertThat(TrackedShareCard.mints(card)).isFalse()
        assertThat(TrackedShareCard.outgoingText(card)).isEqualTo("Story de Léa : ${ShareCards.storyUrl("s1")}")
    }

    @Test
    fun `a minting that fails falls back on the raw address`() {
        val card = story(isPublic = true)
        val target = me.meeshy.sdk.model.PostShareLinkLaw.resolve("s1", null)
        assertThat(target.tracked).isFalse()
        assertThat(TrackedShareCard.outgoingText(card)).contains(ShareCards.storyUrl("s1"))
    }
}
