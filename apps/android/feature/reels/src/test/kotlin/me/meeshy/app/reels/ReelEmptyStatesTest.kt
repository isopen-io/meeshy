package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ContentFetchFailure
import org.junit.Test

class ReelEmptyStatesTest {

    @Test
    fun `avant le premier chargement c est le placeholder froid`() {
        assertThat(ReelEmptyKind.of(ReelsUiState(isLoading = true))).isEqualTo(ReelEmptyKind.Cold)
        assertThat(ReelEmptyKind.of(ReelsUiState())).isEqualTo(ReelEmptyKind.Cold)
    }

    @Test
    fun `une reponse sans reel est un vide et non une panne`() {
        assertThat(ReelEmptyKind.of(ReelsUiState(hasLoadedOnce = true))).isEqualTo(ReelEmptyKind.Empty)
    }

    @Test
    fun `une panne garde sa cause`() {
        val state = ReelsUiState(loadFailure = ContentFetchFailure.SERVER, errorMessage = "x")
        assertThat(ReelEmptyKind.of(state)).isEqualTo(ReelEmptyKind.Failed(ContentFetchFailure.SERVER))
    }

    @Test
    fun `une absence ne propose pas de reessai`() {
        val kind = ReelEmptyKind.of(ReelsUiState(loadFailure = ContentFetchFailure.NOT_FOUND)) as ReelEmptyKind.Failed
        assertThat(kind.failure.offersRetry).isFalse()
    }
}
