package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ContentFetchFailureTest {

    @Test
    fun `403 et 404 et 410 sont des absences sans reessai`() {
        listOf(403, 404, 410).forEach { status ->
            val failure = ContentFetchFailure.fromHttpStatus(status)
            assertThat(failure.isAbsence).isTrue()
            assertThat(failure.offersRetry).isFalse()
        }
        assertThat(ContentFetchFailure.fromHttpStatus(403)).isEqualTo(ContentFetchFailure.FORBIDDEN)
        assertThat(ContentFetchFailure.fromHttpStatus(404)).isEqualTo(ContentFetchFailure.NOT_FOUND)
        assertThat(ContentFetchFailure.fromHttpStatus(410)).isEqualTo(ContentFetchFailure.NOT_FOUND)
    }

    @Test
    fun `un 500 est un echec serveur qui offre de reessayer`() {
        listOf(500, 502, 503, 504).forEach { status ->
            val failure = ContentFetchFailure.fromHttpStatus(status)
            assertThat(failure).isEqualTo(ContentFetchFailure.SERVER)
            assertThat(failure.isAbsence).isFalse()
            assertThat(failure.offersRetry).isTrue()
        }
    }

    @Test
    fun `un refus inattendu reste serveur et jamais reseau`() {
        assertThat(ContentFetchFailure.fromHttpStatus(401)).isEqualTo(ContentFetchFailure.SERVER)
        assertThat(ContentFetchFailure.fromHttpStatus(422)).isEqualTo(ContentFetchFailure.SERVER)
    }

    @Test
    fun `le reseau offre de reessayer et n est pas une absence`() {
        assertThat(ContentFetchFailure.NETWORK.isAbsence).isFalse()
        assertThat(ContentFetchFailure.NETWORK.offersRetry).isTrue()
    }
}
