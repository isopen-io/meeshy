package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareCardsTest {
    @Test
    fun `a story leaves as its composed sentence and carries its direct address and author`() {
        val card = ShareCards.story("s1", authorId = "u1", messageText = "🔗 Story de Léa : https://meeshy.me/story/s1")
        assertThat(card.kind).isEqualTo(ShareCardKind.STORY)
        assertThat(card.url).isEqualTo("https://meeshy.me/story/s1")
        assertThat(card.messageText).isEqualTo("🔗 Story de Léa : https://meeshy.me/story/s1")
        assertThat(card.authorId).isEqualTo("u1")
    }

    @Test
    fun `a post and a reel leave as the post link, the single address law of the feed`() {
        assertThat(ShareCards.post("p1", "Mon post").messageText).isEqualTo("https://meeshy.me/feeds/post/p1")
        assertThat(ShareCards.reel("r1", "Mon réel").url).isEqualTo("https://meeshy.me/feeds/post/r1")
        assertThat(ShareCards.reel("r1", "Mon réel").kind).isEqualTo(ShareCardKind.REEL)
    }

    @Test
    fun `an identifier is encoded in the story address`() {
        assertThat(ShareCards.storyUrl("a b/c")).isEqualTo("https://meeshy.me/story/a+b%2Fc")
    }

    @Test
    fun `a card plans with its kind offers and travels as one text message with the caption`() {
        val card = ShareCards.profile("u1", "Léa", "https://meeshy.me/u/lea", "Profil de Léa : https://meeshy.me/u/lea")
        val built = ShareOutgoingBuilder.build(ShareSubject.Card(card), emptySet(), caption = "à suivre", chosenDurationSeconds = null)
        assertThat((built as ShareOutgoingResult.Ready).messages.map { it.content })
            .containsExactly("à suivre\nProfil de Léa : https://meeshy.me/u/lea")
    }
}
