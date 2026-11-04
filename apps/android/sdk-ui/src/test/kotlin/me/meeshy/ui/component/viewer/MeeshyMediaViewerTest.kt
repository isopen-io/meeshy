package me.meeshy.ui.component.viewer

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.GalleryAttribution
import me.meeshy.sdk.model.GalleryPage
import me.meeshy.sdk.model.GalleryPageKind
import me.meeshy.sdk.model.SocialMediaGallery
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyMediaViewerTest {

    @get:Rule
    val compose = createComposeRule()

    private fun page(id: String, kind: GalleryPageKind, caption: String? = null, author: String = "Ana", postMediaId: String? = id) =
        GalleryPage(
            id = id, kind = kind, url = "https://m/$id", thumbnailUrl = "https://m/$id-t", caption = caption, alt = null,
            attribution = GalleryAttribution(name = author, avatarUrl = null, createdAtIso = null),
            postMediaId = postMediaId,
        )

    private val gallery = SocialMediaGallery(
        listOf(
            page("a", GalleryPageKind.IMAGE),
            page("scene:p#0", GalleryPageKind.SCENE, caption = "Ouverture", postMediaId = "a"),
            page("m", GalleryPageKind.VIDEO, author = "Bob", postMediaId = null),
        ),
    )

    @Test
    fun `la pellicule liste toutes les pages et souligne la page active`() {
        compose.setContent {
            MeeshyTheme { MediaFilmstrip(pages = gallery.pages, current = 1, accent = MeeshyPalette.White, onSelect = {}) }
        }
        compose.onNodeWithContentDescription("Media 2 of 3").assertIsSelected()
        compose.onNodeWithContentDescription("Media 1 of 3").assertIsNotSelected()
        compose.onNodeWithContentDescription("Media 3 of 3").assertIsNotSelected()
    }

    @Test
    fun `une page scene monte l'emplacement branchable avec sa legende et son auteur`() {
        compose.setContent {
            MeeshyTheme {
                MediaViewerContent(
                    gallery = gallery,
                    initialIndex = 1,
                    accent = MeeshyPalette.White,
                    onDismiss = {},
                    scenePage = { _, _ -> Box(Modifier.fillMaxSize().testTag("scene-slot")) },
                )
            }
        }
        compose.onNodeWithTag("scene-slot").assertIsDisplayed()
        compose.onNodeWithText("Ouverture").assertIsDisplayed()
        compose.onNodeWithText("Ana", substring = true).assertIsDisplayed()
    }

    @Test
    fun `le bouton commenter ce media emet la page seulement quand elle se cite`() {
        val emitted = mutableListOf<String?>()
        compose.setContent {
            MeeshyTheme {
                MediaViewerContent(
                    gallery = gallery,
                    initialIndex = 0,
                    accent = MeeshyPalette.White,
                    onDismiss = {},
                    canCommentMedia = { it.postMediaId != null },
                    onCommentMedia = { emitted += it.postMediaId },
                )
            }
        }
        compose.onNodeWithContentDescription("Reply").performClick()
        assertThat(emitted).containsExactly("a")
    }

    @Test
    fun `sans receveur, aucun bouton commenter`() {
        compose.setContent {
            MeeshyTheme { MediaViewerContent(gallery = gallery, initialIndex = 0, accent = MeeshyPalette.White, onDismiss = {}) }
        }
        compose.onNodeWithContentDescription("Reply").assertDoesNotExist()
    }
}
