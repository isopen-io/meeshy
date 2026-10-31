package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.app.feed.RecetteCommentThread.support
import me.meeshy.sdk.model.card.PostCommentCardLabels
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #13922, recette S8 : sur le détail d'un post vidéo PUBLIC, un commentaire racine public à emoji, avec des réponses
 * chargées dans le fil, compose sa carte — le post en tête.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PostCommentsImagingTest {

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private val labels = PostCommentCardLabels(thread = "Fil de commentaires", folded = { "+$it réponses" })

    @Test
    fun `a public root comment with emoji under a public video post composes its card, the post in head`() {
        val card = RecetteCommentThread.loadedViewModel().commentCard("c-grace", support, labels)

        assertThat(card).isNotNull()
        assertThat(card!!.reply.text).isEqualTo(RecetteCommentThread.GRACE_TEXT)
        assertThat(card.quoted?.author).isEqualTo("Windie Nh")
    }

    @Test
    fun `a public root comment whose replies are loaded composes its card`() {
        val card = RecetteCommentThread.loadedViewModel().commentCard("c-elvira", support, labels)

        assertThat(card?.reply?.author).isEqualTo("elvira ndjiki")
    }

    @Test
    fun `a loaded reply composes the thread down to it`() {
        val card = RecetteCommentThread.loadedViewModel().commentCard("r-1", support, labels)

        assertThat(card).isNotNull()
    }
}
