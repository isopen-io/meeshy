package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiRepostOf
import org.junit.Test

/**
 * #12234 — le bouton Repost d'une publication offre Repartager et Citer, chacun seulement si son écrivain existe
 * (iOS `RepostChoice.offered`), et « Citer » montre la RACINE d'une republication (iOS `ComposerQuotedPublication`).
 */
class RepostChoiceTest {

    @Test
    fun `a surface that can repost and quote offers both, repost first`() {
        assertThat(RepostChoice.offered(canRepost = true, canQuote = true))
            .containsExactly(RepostChoice.Repost, RepostChoice.Quote).inOrder()
    }

    @Test
    fun `a surface without a quote door never offers Quote`() {
        assertThat(RepostChoice.offered(canQuote = false)).containsExactly(RepostChoice.Repost)
    }

    @Test
    fun `a surface without a writer never offers Repost`() {
        assertThat(RepostChoice.offered(canRepost = false, canQuote = true)).containsExactly(RepostChoice.Quote)
    }

    @Test
    fun `a surface with neither writer offers nothing, so the button is not drawn`() {
        assertThat(RepostChoice.offeredBy(onRepost = null, onQuote = null)).isEmpty()
    }

    @Test
    fun `quoting an original post shows that post`() {
        val post = ApiPost(id = "p1", content = "  Bonjour  ", author = ApiAuthor(id = "a", username = "ana", displayName = "Ana"))

        val composer = QuoteComposerState.quoting(post)

        assertThat(composer).isEqualTo(QuoteComposerState(postId = "p1", sourceAuthorName = "Ana", sourceContentPreview = "Bonjour"))
    }

    @Test
    fun `quoting a repost shows its root, the publication the quote will point to`() {
        val share = ApiPost(
            id = "share",
            content = "",
            author = ApiAuthor(id = "b", displayName = "Bilal"),
            repostOf = ApiRepostOf(id = "root", content = "L'original", author = ApiAuthor(id = "c", username = "chloe")),
        )

        val composer = QuoteComposerState.quoting(share)

        assertThat(composer.postId).isEqualTo("share")
        assertThat(composer.sourceAuthorName).isEqualTo("chloe")
        assertThat(composer.sourceContentPreview).isEqualTo("L'original")
    }

    @Test
    fun `a blank author name is no name`() {
        val post = ApiPost(id = "p1", content = "x", author = ApiAuthor(id = "a", displayName = " ", username = null))

        assertThat(QuoteComposerState.quoting(post).sourceAuthorName).isNull()
    }
}
