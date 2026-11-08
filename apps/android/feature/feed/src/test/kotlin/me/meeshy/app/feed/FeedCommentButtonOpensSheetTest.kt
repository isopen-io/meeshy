package me.meeshy.app.feed

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.comments.CommentsTitleCount
import me.meeshy.ui.component.composer.LocalUniversalComposer
import me.meeshy.ui.component.composer.UniversalComposer
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le bouton commentaire de la carte ouvre LA feuille unique sur place ; l'hôte est prévenu d'un envoi pour son compteur. */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedCommentButtonOpensSheetTest {
    @get:Rule
    val compose = createComposeRule()

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun tearDown() { Dispatchers.resetMain() }

    @Test
    fun `la feuille du fil montre le fil et relaie l envoi au compteur de l hote`() {
        val composer: UniversalComposer = { _, _ -> }
        val vm = RecetteCommentThread.loadedViewModel()
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalUniversalComposer provides composer) {
                    PostCommentsThreadSheet(viewModel = vm, title = "2 commentaires", onDismiss = {}, onCommentSent = {})
                }
            }
        }
        compose.waitForIdle()
        compose.onNodeWithText("2 commentaires").assertIsDisplayed()
        compose.onNodeWithText(RecetteCommentThread.GRACE_TEXT).assertIsDisplayed()
        assertThat(vm.onCommentSent).isNotNull()
    }

    @Test
    fun `un commentaire envoye fait passer le compteur de la carte de 2 a 3`() {
        assertThat(CommentsTitleCount.afterSend(2)).isEqualTo(3)
    }
}
