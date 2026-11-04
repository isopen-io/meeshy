package me.meeshy.app.feed

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le réel republié : une bande compacte (poster ou note), l'auteur d'origine, la légende, les j'aime — comme iOS. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ReelRepostEmbedCellTest {

    @get:Rule
    val compose = createComposeRule()

    private fun reel(cover: ReelCover, likes: Int = 3) = RepostEmbedPresentation(
        id = "reel-1",
        authorName = "Origen",
        authorAvatarUrl = null,
        createdAtIso = null,
        content = "Ma légende",
        isTranslated = false,
        previewImageUrl = null,
        extraMediaCount = 0,
        likeCount = likes,
        moodEmoji = null,
        isQuote = false,
        isStory = false,
        isReel = true,
        authorId = "u9",
        authorUsername = "orig",
        reelCover = cover,
    )

    private val videoPoster = ReelCover.Poster(url = "https://cdn/p.jpg", thumbHash = null, tintHex = "6366F1", isVideo = true)
    private val audioBackdrop = ReelCover.Backdrop(isVideo = false)

    @Test
    fun `une bande video montre l attribution, l auteur, la legende et les likes`() {
        compose.setContent { MeeshyTheme { ReelRepostEmbedCell(embed = reel(videoPoster), containingPostId = "outer", onOpen = {}) } }
        compose.onNodeWithText("Reposted from @orig").assertIsDisplayed()
        compose.onNodeWithText("@orig").assertIsDisplayed()
        compose.onNodeWithText("Ma légende").assertIsDisplayed()
        compose.onNodeWithContentDescription("3 likes").assertIsDisplayed()
    }

    @Test
    fun `une bande audio porte le libelle TalkBack du reel`() {
        compose.setContent { MeeshyTheme { ReelRepostEmbedCell(embed = reel(audioBackdrop), containingPostId = "outer", onOpen = {}) } }
        compose.onNodeWithContentDescription("Reel by Origen").assertIsDisplayed()
    }

    @Test
    fun `un appui sur la bande ouvre le reel cite`() {
        var opened = 0
        compose.setContent { MeeshyTheme { ReelRepostEmbedCell(embed = reel(videoPoster), containingPostId = "outer", onOpen = { opened++ }) } }
        compose.onNodeWithContentDescription("Reel by Origen").performClick()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `un appui sur la legende ouvre aussi le reel`() {
        var opened = 0
        compose.setContent { MeeshyTheme { ReelRepostEmbedCell(embed = reel(videoPoster), containingPostId = null, onOpen = { opened++ }) } }
        compose.onNodeWithText("Ma légende").performClick()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `sans surface de lecture ni election le bouton de son n existe pas`() {
        compose.setContent { MeeshyTheme { ReelRepostEmbedCell(embed = reel(videoPoster), containingPostId = "outer", onOpen = {}) } }
        compose.onNodeWithContentDescription("Turn the sound back on").assertDoesNotExist()
    }
}
