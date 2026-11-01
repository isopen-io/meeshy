package me.meeshy.app.feed

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.composer.ComposerCapability
import me.meeshy.sdk.model.composer.ComposerConfiguration
import me.meeshy.ui.component.composer.LocalUniversalComposer
import me.meeshy.ui.component.composer.UniversalComposer
import me.meeshy.ui.component.composer.UniversalComposerSpec
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14313 — la feuille des commentaires d'un réel ou d'une story est LE fil des posts : le titre de l'hôte, les
 * commentaires servis, et le composeur universel en réglage commentaire, pièces jointes ouvertes (vocal, photo).
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostCommentsThreadSheetComposeTest {

    @get:Rule
    val compose = createComposeRule()

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun tearDown() { Dispatchers.resetMain() }

    @Test
    fun `la feuille montre le fil et monte le composeur universel avec ses pièces jointes`() {
        val mounted = mutableListOf<UniversalComposerSpec>()
        val composer: UniversalComposer = { spec, _ -> mounted += spec }
        val vm = RecetteCommentThread.loadedViewModel()
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalUniversalComposer provides composer) {
                    PostCommentsThreadSheet(viewModel = vm, title = "2 commentaires", onDismiss = {})
                }
            }
        }
        compose.waitForIdle()

        compose.onNodeWithText("2 commentaires").assertIsDisplayed()
        compose.onNodeWithText(RecetteCommentThread.GRACE_TEXT).assertIsDisplayed()
        val spec = mounted.last()
        assertThat(spec.configuration).isEqualTo(ComposerConfiguration.COMMENT)
        assertThat(spec.effectiveConfiguration.offers(ComposerCapability.PHOTO_LIBRARY)).isTrue()
        assertThat(spec.effectiveConfiguration.offers(ComposerCapability.VOICE)).isTrue()
    }
}
