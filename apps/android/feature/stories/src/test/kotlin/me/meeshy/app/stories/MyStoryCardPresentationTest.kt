package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MyStoryCardKind
import me.meeshy.sdk.model.MyStoryCardRules
import me.meeshy.sdk.model.MyStoryGlyph
import me.meeshy.sdk.model.MyStorySelectionIndicator
import me.meeshy.sdk.model.MyStoryThumbnailSource
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MyStoryCardPresentationTest {

    private val now = 1_800_000_000_000L
    private val hour = 3_600_000L

    private fun published(
        expiresAt: Long? = now + hour,
        views: Int = 0,
        reactions: Int = 0,
        comments: Int = 0,
        thumbnail: String? = "https://cdn/t.jpg",
    ) = MyStoryCardRules.published(
        MyStoryCardRules.PublishedInput(
            id = "s1", thumbnailUrl = thumbnail, renderedCoverPath = null, backgroundHex = null,
            createdAtEpochMillis = now - 2 * hour, expiresAtEpochMillis = expiresAt,
            viewCount = views, reactionCount = reactions, commentCount = comments,
        ),
    )

    private fun present(card: me.meeshy.sdk.model.MyStoryCardModel, selecting: Boolean = false, selected: Boolean = false) =
        MyStoryCardPresentation.of(card, now, Locale.FRANCE, selecting, selected)

    @Test
    fun `une story active montre la bande complete avec des compteurs seulement positifs`() {
        val presentation = present(published(views = 12, reactions = 0, comments = 3))

        assertThat(presentation.isVeiled).isFalse()
        assertThat(presentation.glyphs.map { it.glyph }).containsExactly(
            MyStoryGlyph.VIEWS_AND_REACTIONS, MyStoryGlyph.REACTIONS, MyStoryGlyph.COMMENTS, MyStoryGlyph.MORE,
        ).inOrder()
        assertThat(presentation.glyphs.map { it.count }).containsExactly(12, null, 3, null).inOrder()
        assertThat(presentation.thumbnail).isEqualTo(MyStoryThumbnailSource.RemoteUrl("https://cdn/t.jpg"))
    }

    @Test
    fun `une story expiree est voilee mais garde sa bande d'engagement`() {
        val presentation = present(published(expiresAt = now - 1, views = 5))

        assertThat(presentation.isVeiled).isTrue()
        assertThat(presentation.glyphs.first().count).isEqualTo(5)
    }

    @Test
    fun `la selection suit le mode et le choix`() {
        assertThat(present(published()).selection).isEqualTo(MyStorySelectionIndicator.HIDDEN)
        assertThat(present(published(), selecting = true).selection).isEqualTo(MyStorySelectionIndicator.UNSELECTED)
        assertThat(present(published(), selecting = true, selected = true).selection).isEqualTo(MyStorySelectionIndicator.SELECTED)
    }

    @Test
    fun `un brouillon propose publier et le menu, sans compteur ni voile`() {
        val draft = MyStoryCardRules.draft(
            MyStoryCardRules.DraftInput("d", "Titre", null, null, "6366F1", now - hour),
        )
        val presentation = present(draft)

        assertThat(presentation.kind).isEqualTo(MyStoryCardKind.DRAFT)
        assertThat(presentation.isVeiled).isFalse()
        assertThat(presentation.glyphs.map { it.glyph }).containsExactly(MyStoryGlyph.PUBLISH, MyStoryGlyph.MORE).inOrder()
        assertThat(presentation.glyphs.all { it.count == null }).isTrue()
        assertThat(presentation.title).isEqualTo("Titre")
        assertThat(presentation.thumbnail).isEqualTo(MyStoryThumbnailSource.Background("6366F1"))
    }
}
