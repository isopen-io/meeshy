package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostAbsenceReasonTest {

    @Test
    fun `un post present gagne meme avec un echec ancien`() {
        val reason = PostAbsenceReason.resolve(hasPost = true, isLoading = true, failure = ContentFetchFailure.SERVER)
        assertThat(reason).isEqualTo(PostAbsenceReason.PRESENT)
    }

    @Test
    fun `un chargement en cours masque une cause ancienne`() {
        val reason = PostAbsenceReason.resolve(hasPost = false, isLoading = true, failure = ContentFetchFailure.NETWORK)
        assertThat(reason).isEqualTo(PostAbsenceReason.STILL_LOADING)
    }

    @Test
    fun `sans post ni chargement la cause tranche`() {
        assertThat(PostAbsenceReason.resolve(false, false, ContentFetchFailure.NETWORK))
            .isEqualTo(PostAbsenceReason.NETWORK_FAILED)
        assertThat(PostAbsenceReason.resolve(false, false, ContentFetchFailure.SERVER))
            .isEqualTo(PostAbsenceReason.SERVER_FAILED)
        assertThat(PostAbsenceReason.resolve(false, false, ContentFetchFailure.FORBIDDEN))
            .isEqualTo(PostAbsenceReason.UNAVAILABLE)
        assertThat(PostAbsenceReason.resolve(false, false, ContentFetchFailure.NOT_FOUND))
            .isEqualTo(PostAbsenceReason.UNAVAILABLE)
        assertThat(PostAbsenceReason.resolve(false, false, null)).isEqualTo(PostAbsenceReason.UNAVAILABLE)
    }
}
