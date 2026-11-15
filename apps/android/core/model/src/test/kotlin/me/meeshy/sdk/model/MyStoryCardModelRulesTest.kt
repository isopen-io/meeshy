package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MyStoryCardModelRulesTest {

    private fun published(
        views: Int = 0,
        reactions: Int = 0,
        comments: Int = 0,
        cover: String? = null,
        url: String? = null,
        background: String? = null,
        expiresAt: Long? = null,
    ) = MyStoryCardRules.published(
        MyStoryCardRules.PublishedInput(
            id = "s1",
            thumbnailUrl = url,
            renderedCoverPath = cover,
            backgroundHex = background,
            createdAtEpochMillis = 1_000L,
            expiresAtEpochMillis = expiresAt,
            viewCount = views,
            reactionCount = reactions,
            commentCount = comments,
        ),
    )

    @Test
    fun `un compteur nul ou negatif est omis, jamais un 0 decoratif`() {
        val card = published(views = 0, reactions = -2, comments = 3)
        assertThat(card.counts).containsExactly(MyStoryGlyph.COMMENTS, 3)
    }

    @Test
    fun `une story publiee porte vues et reactions, reactions, commentaires puis plus`() {
        val card = published(views = 10, reactions = 4, comments = 1)
        assertThat(card.counts).containsExactly(
            MyStoryGlyph.VIEWS_AND_REACTIONS, 10,
            MyStoryGlyph.REACTIONS, 4,
            MyStoryGlyph.COMMENTS, 1,
        )
        assertThat(card.glyphs).containsExactly(
            MyStoryGlyph.VIEWS_AND_REACTIONS, MyStoryGlyph.REACTIONS, MyStoryGlyph.COMMENTS, MyStoryGlyph.MORE,
        ).inOrder()
    }

    @Test
    fun `un brouillon propose publier puis plus et n'a aucun compteur`() {
        val card = MyStoryCardRules.draft(
            MyStoryCardRules.DraftInput("d1", "Titre", null, null, "#112233", 5L),
        )
        assertThat(card.glyphs).containsExactly(MyStoryGlyph.PUBLISH, MyStoryGlyph.MORE).inOrder()
        assertThat(card.counts).isEmpty()
        assertThat(card.expiresAtEpochMillis).isNull()
        assertThat(card.title).isEqualTo("Titre")
    }

    @Test
    fun `la reaction est un indicateur non interactif`() {
        assertThat(MyStoryGlyph.REACTIONS.isInteractive).isFalse()
        assertThat(MyStoryGlyph.COMMENTS.isInteractive).isTrue()
    }

    @Test
    fun `une story expiree est voilee, une story encore vivante ou un brouillon non`() {
        assertThat(published(expiresAt = 100L).isExpired(nowEpochMillis = 100L)).isTrue()
        assertThat(published(expiresAt = 101L).isExpired(nowEpochMillis = 100L)).isFalse()
        assertThat(published(expiresAt = null).isExpired(nowEpochMillis = 100L)).isFalse()
    }

    @Test
    fun `la vignette replie de la couverture locale vers l'URL puis la couleur de fond`() {
        assertThat(published(cover = "/c.png", url = "https://u", background = "#fff").thumbnailSource)
            .isEqualTo(MyStoryThumbnailSource.LocalCover("/c.png"))
        assertThat(published(url = "https://u", background = "#fff").thumbnailSource)
            .isEqualTo(MyStoryThumbnailSource.RemoteUrl("https://u"))
        assertThat(published(cover = " ", background = "#fff").thumbnailSource)
            .isEqualTo(MyStoryThumbnailSource.Background("#fff"))
        assertThat(published().thumbnailSource).isEqualTo(MyStoryThumbnailSource.Placeholder)
    }

    @Test
    fun `la couverture rendue d'un brouillon gagne sur l'ancien repli`() {
        fun draft(rendered: String?, legacy: String?) = MyStoryCardRules.draft(
            MyStoryCardRules.DraftInput("d", null, rendered, legacy, null, 0L),
        )
        assertThat(draft("/r.png", "/l.png").localCoverPath).isEqualTo("/r.png")
        assertThat(draft(null, "/l.png").localCoverPath).isEqualTo("/l.png")
    }

    @Test
    fun `la pastille de selection n'existe pas hors mode selection`() {
        assertThat(MyStoryCardRules.selectionIndicator(false, true)).isEqualTo(MyStorySelectionIndicator.HIDDEN)
        assertThat(MyStoryCardRules.selectionIndicator(true, false)).isEqualTo(MyStorySelectionIndicator.UNSELECTED)
        assertThat(MyStoryCardRules.selectionIndicator(true, true)).isEqualTo(MyStorySelectionIndicator.SELECTED)
    }

    @Test
    fun `programmer reste derriere sa capacite`() {
        assertThat(MyStoryCardRules.moreActions(MyStoryCardKind.DRAFT))
            .containsExactly(MyStoryMoreAction.EDIT, MyStoryMoreAction.DELETE).inOrder()
        assertThat(MyStoryCardRules.moreActions(MyStoryCardKind.DRAFT, scheduling = true))
            .containsExactly(MyStoryMoreAction.EDIT, MyStoryMoreAction.SCHEDULE, MyStoryMoreAction.DELETE).inOrder()
        assertThat(MyStoryCardRules.moreActions(MyStoryCardKind.PUBLISHED))
            .containsExactly(MyStoryMoreAction.VIEWERS, MyStoryMoreAction.SHARE, MyStoryMoreAction.DELETE).inOrder()
    }
}
