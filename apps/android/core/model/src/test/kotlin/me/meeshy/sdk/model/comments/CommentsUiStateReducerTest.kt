package me.meeshy.sdk.model.comments

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentsUiStateReducerTest {
    private fun input(
        rows: Int = 0,
        loading: Boolean = false,
        failed: Boolean = false,
        offline: Boolean = false,
        settled: Boolean = true,
    ) = CommentsSheetInput(loadedRows = rows, isLoading = loading, loadFailed = failed, isOffline = offline, hasSettled = settled)

    @Test
    fun `froid vide en chargement montre le squelette`() {
        val ui = CommentsUiStateReducer.reduce(input(loading = true, settled = false))
        assertThat(ui.phase).isEqualTo(CommentsSheetPhase.SKELETON)
    }

    @Test
    fun `cache non vide en chargement ne montre jamais de squelette`() {
        val ui = CommentsUiStateReducer.reduce(input(rows = 3, loading = true, settled = false))
        assertThat(ui.phase).isEqualTo(CommentsSheetPhase.CONTENT)
    }

    @Test
    fun `chaud apres reponse montre le contenu et vide sans ligne`() {
        assertThat(CommentsUiStateReducer.reduce(input(rows = 2)).phase).isEqualTo(CommentsSheetPhase.CONTENT)
        assertThat(CommentsUiStateReducer.reduce(input(rows = 0)).phase).isEqualTo(CommentsSheetPhase.EMPTY)
    }

    @Test
    fun `erreur sans ligne dessine l erreur et avec lignes garde le contenu`() {
        assertThat(CommentsUiStateReducer.reduce(input(failed = true)).phase).isEqualTo(CommentsSheetPhase.ERROR)
        assertThat(CommentsUiStateReducer.reduce(input(rows = 2, failed = true)).phase).isEqualTo(CommentsSheetPhase.CONTENT)
    }

    @Test
    fun `hors ligne sans ligne est un etat discret et jamais une erreur`() {
        val ui = CommentsUiStateReducer.reduce(input(failed = true, offline = true))
        assertThat(ui.phase).isEqualTo(CommentsSheetPhase.OFFLINE_EMPTY)
        assertThat(ui.showsOfflineBand).isFalse()
    }

    @Test
    fun `hors ligne avec lignes garde le contenu et affiche le bandeau`() {
        val ui = CommentsUiStateReducer.reduce(input(rows = 2, offline = true))
        assertThat(ui.phase).isEqualTo(CommentsSheetPhase.CONTENT)
        assertThat(ui.showsOfflineBand).isTrue()
    }

    @Test
    fun `le titre garde le total servi tant qu il depasse ce qui est charge`() {
        assertThat(CommentsTitleCount.of(serverCount = 40, loadedRows = 20)).isEqualTo(40)
        assertThat(CommentsTitleCount.of(serverCount = 2, loadedRows = 5)).isEqualTo(5)
        assertThat(CommentsTitleCount.of(serverCount = null, loadedRows = 0)).isEqualTo(0)
    }

    @Test
    fun `envoyer un commentaire incremente le compteur de l hote sans jamais passer sous zero`() {
        assertThat(CommentsTitleCount.afterSend(4)).isEqualTo(5)
        assertThat(CommentsTitleCount.afterSend(-3)).isEqualTo(1)
    }
}
