package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationLoadingPhaseTest {

    private fun derive(
        initial: Boolean = false,
        older: Boolean = false,
        newer: Boolean = false,
        revalidating: Boolean = false,
        observed: Boolean = false,
    ) = ConversationLoadingPhase.derive(
        isLoadingInitial = initial,
        isLoadingOlder = older,
        isLoadingNewer = newer,
        isRevalidating = revalidating,
        hasObservedAnyData = observed,
    )

    @Test
    fun `rien ne charge et aucune donnee vue donne idle`() {
        assertThat(derive()).isEqualTo(ConversationLoadingPhase.IDLE)
    }

    @Test
    fun `rien ne charge apres des donnees donne loaded`() {
        assertThat(derive(observed = true)).isEqualTo(ConversationLoadingPhase.LOADED)
    }

    @Test
    fun `la priorite est initial puis older puis newer puis revalidating`() {
        assertThat(derive(initial = true, older = true, newer = true, revalidating = true))
            .isEqualTo(ConversationLoadingPhase.LOADING_INITIAL)
        assertThat(derive(older = true, newer = true, revalidating = true))
            .isEqualTo(ConversationLoadingPhase.LOADING_OLDER)
        assertThat(derive(newer = true, revalidating = true))
            .isEqualTo(ConversationLoadingPhase.LOADING_NEWER)
        assertThat(derive(revalidating = true, observed = true))
            .isEqualTo(ConversationLoadingPhase.REVALIDATING)
    }

    @Test
    fun `seul loadingInitial autorise un spinner bloquant`() {
        val blocking = ConversationLoadingPhase.entries.filter { it.isBlockingSpinnerNeeded }
        assertThat(blocking).containsExactly(ConversationLoadingPhase.LOADING_INITIAL)
    }

    @Test
    fun `un cache non vide n est jamais bloquant`() {
        val phases = listOf(
            derive(older = true, observed = true),
            derive(newer = true, observed = true),
            derive(revalidating = true, observed = true),
            derive(observed = true),
        )
        assertThat(phases.none { it.isBlockingSpinnerNeeded }).isTrue()
    }

    @Test
    fun `la pagination est older ou newer seulement`() {
        val paginating = ConversationLoadingPhase.entries.filter { it.isPaginating }
        assertThat(paginating).containsExactly(
            ConversationLoadingPhase.LOADING_OLDER,
            ConversationLoadingPhase.LOADING_NEWER,
        )
    }
}
