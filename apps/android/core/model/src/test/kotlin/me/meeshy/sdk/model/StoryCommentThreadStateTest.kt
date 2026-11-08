package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCommentThreadStateTest {

    private val root = storyComment("r", replyCount = 5)
    private val replies = listOf("a", "b", "c").map { storyComment(it, parentId = "r") }

    @Test
    fun `un fil replie montre l'apercu des deux premieres reponses`() {
        val state = StoryCommentThreadState()
        assertThat(state.visibleReplies(root, replies).map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `un fil deplie montre toutes les reponses chargees`() {
        val state = StoryCommentThreadState().toggled("r")
        assertThat(state.visibleReplies(root, replies)).hasSize(3)
    }

    @Test
    fun `le bouton annonce les reponses restantes puis masquer`() {
        val state = StoryCommentThreadState()
        assertThat(state.toggle(root)).isEqualTo(StoryCommentToggle.SeeMore(remaining = 3))
        assertThat(state.toggled("r").toggle(root)).isEqualTo(StoryCommentToggle.Hide)
    }

    @Test
    fun `aucun bouton quand le fil tient dans l'apercu`() {
        assertThat(StoryCommentThreadState().toggle(storyComment("r", replyCount = 2))).isNull()
    }

    @Test
    fun `un second chargement du meme fil est refuse tant que le premier est en vol`() {
        val state = StoryCommentThreadState().beginLoad("r")!!
        assertThat(state.beginLoad("r")).isNull()
    }

    @Test
    fun `voir plus de reponses depend du curseur de la page`() {
        val state = StoryCommentThreadState().pageLoaded("r", nextCursor = "c20", hasMore = true, firstPage = true)
        assertThat(state.hasMoreReplies("r")).isTrue()
        val last = state.pageLoaded("r", nextCursor = null, hasMore = false, firstPage = false)
        assertThat(last.hasMoreReplies("r")).isFalse()
    }

    @Test
    fun `recharger la tete d'un fil deja avance ne ramene pas le curseur en arriere`() {
        val advanced = StoryCommentThreadState()
            .pageLoaded("r", "c20", true, firstPage = true)
            .pageLoaded("r", "c40", true, firstPage = false)
            .pageLoaded("r", "c20", true, firstPage = true)
        assertThat(advanced.repliesCursor["r"]).isEqualTo("c40")
    }

    @Test
    fun `un echec de chargement libere le fil`() {
        val state = StoryCommentThreadState().beginLoad("r")!!.loadFailed("r")
        assertThat(state.isLoading("r")).isFalse()
    }
}
