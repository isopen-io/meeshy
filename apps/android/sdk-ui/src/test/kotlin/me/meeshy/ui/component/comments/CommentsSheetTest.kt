package me.meeshy.ui.component.comments

import androidx.compose.material3.Text
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.comments.CommentsSheetPhase
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CommentsSheetTest {
    @get:Rule
    val compose = createComposeRule()

    private val labels = CommentsSheetLabels(
        title = "2 commentaires", closeLabel = "Fermer", loadError = "Erreur", retry = "Réessayer",
        empty = "Aucun commentaire", offline = "Hors ligne", offlineEmpty = "Hors ligne ici", loadMore = "Voir plus",
    )

    private fun list(
        state: CommentsListState,
        rows: List<String> = emptyList(),
        onRetry: () -> Unit = {},
        onLoadMore: () -> Unit = {},
    ) = compose.setContent {
        MeeshyTheme {
            CommentThreadList(
                state = state, labels = labels, rows = rows, rowKey = { it }, onRetry = onRetry, onLoadMore = onLoadMore,
                skeleton = { Text("squelette") },
            ) { Text(it) }
        }
    }

    @Test
    fun `la feuille montre le titre et le corps et se ferme par la croix`() {
        var dismissed = false
        compose.setContent {
            MeeshyTheme {
                CommentsSheet(
                    title = labels.title, closeLabel = labels.closeLabel, onDismiss = { dismissed = true },
                    composer = { Text("composeur") },
                ) { Text("corps") }
            }
        }
        compose.waitForIdle()
        compose.onNodeWithText("2 commentaires").assertIsDisplayed()
        compose.onNodeWithText("corps").assertIsDisplayed()
        compose.onNodeWithText("composeur").assertIsDisplayed()
        compose.onNodeWithContentDescription("Fermer").performSemanticsAction(SemanticsActions.OnClick)
        assertThat(dismissed).isTrue()
    }

    @Test
    fun `le squelette ne s affiche qu a froid`() {
        list(CommentsListState(CommentsSheetPhase.SKELETON))
        compose.onNodeWithText("squelette").assertIsDisplayed()
    }

    @Test
    fun `un fil charge montre ses lignes sans squelette et voir plus pagine`() {
        var loaded = 0
        list(CommentsListState(CommentsSheetPhase.CONTENT, canLoadMore = true), rows = listOf("a", "b"), onLoadMore = { loaded++ })
        compose.onNodeWithText("a").assertIsDisplayed()
        compose.onNodeWithText("b").assertIsDisplayed()
        compose.onNodeWithText("Voir plus").performClick()
        assertThat(loaded).isEqualTo(1)
    }

    @Test
    fun `l erreur propose de reessayer`() {
        var retried = false
        list(CommentsListState(CommentsSheetPhase.ERROR), onRetry = { retried = true })
        compose.onNodeWithText("Erreur").assertIsDisplayed()
        compose.onNodeWithText("Réessayer").performClick()
        assertThat(retried).isTrue()
    }

    @Test
    fun `le vide et le hors ligne sont dessines et le bandeau coiffe un fil garde`() {
        list(CommentsListState(CommentsSheetPhase.EMPTY))
        compose.onNodeWithText("Aucun commentaire").assertIsDisplayed()
    }

    @Test
    fun `hors ligne avec un fil garde pose le bandeau au dessus des lignes`() {
        list(CommentsListState(CommentsSheetPhase.CONTENT, showsOfflineBand = true), rows = listOf("a"))
        compose.onNodeWithText("Hors ligne").assertIsDisplayed()
        compose.onNodeWithText("a").assertIsDisplayed()
    }
}
