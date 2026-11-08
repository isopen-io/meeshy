package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryViewersOutcomeTest {
    @Test
    fun `403 est un refus distinct de la panne`() {
        assertThat(StoryViewersOutcome.failure(403)).isEqualTo(StoryViewersOutcome.Forbidden)
    }

    @Test
    fun `tout autre statut ou l'absence de statut est une panne`() {
        assertThat(StoryViewersOutcome.failure(500)).isEqualTo(StoryViewersOutcome.Failed)
        assertThat(StoryViewersOutcome.failure(404)).isEqualTo(StoryViewersOutcome.Failed)
        assertThat(StoryViewersOutcome.failure(null)).isEqualTo(StoryViewersOutcome.Failed)
    }
}
