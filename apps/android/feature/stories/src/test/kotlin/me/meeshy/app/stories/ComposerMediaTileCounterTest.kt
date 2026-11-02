package me.meeshy.app.stories

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import me.meeshy.sdk.model.composer.ComposerBandState
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le panneau Média ne compte pas les médias tant que le plafond n'est pas atteint (#13838) : pas de « (2/10) » sur
 * la tuile d'ajout ; le plafond se dit au geste qui l'atteint, par `rememberGuardedAddition`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerMediaTileCounterTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the add tile of a slide that already carries media shows no count and no cap`() {
        compose.setContent {
            MeeshyTheme {
                ComposerToolPanel(
                    band = ComposerBandState.Hidden.tapTool(StoryToolMode.MEDIA),
                    selectedFilter = null,
                    filterIntensity = 1f,
                    selectedBackground = null,
                    canAddText = true,
                    isUploadingMedia = false,
                    uploadingMedia = emptyList(),
                    isMediaFull = false,
                    onDismiss = {},
                    onAddText = {},
                    onPickMedia = {},
                    onEnterDrawing = {},
                    onSelectFilter = {},
                    onFilterIntensityChange = {},
                    onSelectBackground = {},
                )
            }
        }

        compose.onNodeWithText("/${StoryComposerDraft.MAX_MEDIA}", substring = true).assertDoesNotExist()
        compose.onNodeWithText("Add photo or video").assertExists()
    }
}
