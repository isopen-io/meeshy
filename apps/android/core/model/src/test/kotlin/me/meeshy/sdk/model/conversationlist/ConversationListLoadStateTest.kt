package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.conversationlist.ConversationListCacheReading.EMPTY
import me.meeshy.sdk.model.conversationlist.ConversationListCacheReading.EXPIRED
import me.meeshy.sdk.model.conversationlist.ConversationListCacheReading.FRESH
import me.meeshy.sdk.model.conversationlist.ConversationListCacheReading.STALE
import org.junit.Test

class ConversationListLoadStateTest {

    @Test
    fun `un cache frais ou perime peint sans charger`() {
        assertThat(ConversationListLoadStates.onCacheRead(FRESH, hasData = true))
            .isEqualTo(ConversationListLoadState.CachedFresh)
        assertThat(ConversationListLoadStates.onCacheRead(STALE, hasData = true))
            .isEqualTo(ConversationListLoadState.CachedStale)
    }

    @Test
    fun `un cache expire mais recuperable s affiche hors ligne`() {
        assertThat(ConversationListLoadStates.onCacheRead(EXPIRED, hasData = true))
            .isEqualTo(ConversationListLoadState.Offline)
    }

    @Test
    fun `un cache vide ou expire sans donnees charge`() {
        assertThat(ConversationListLoadStates.onCacheRead(EMPTY, hasData = false))
            .isEqualTo(ConversationListLoadState.Loading)
        assertThat(ConversationListLoadStates.onCacheRead(EXPIRED, hasData = false))
            .isEqualTo(ConversationListLoadState.Loading)
    }

    @Test
    fun `une synchro reussie charge`() {
        assertThat(ConversationListLoadStates.onSyncSucceeded()).isEqualTo(ConversationListLoadState.Loaded)
    }

    @Test
    fun `une synchro en echec avec donnees reste hors ligne et n est pas une erreur`() {
        val state = ConversationListLoadStates.onSyncFailed(hasData = true, message = "offline")

        assertThat(state).isEqualTo(ConversationListLoadState.Offline)
        assertThat(ConversationListLoadStates.isError(state)).isFalse()
    }

    @Test
    fun `une synchro en echec sans donnees est une erreur`() {
        val state = ConversationListLoadStates.onSyncFailed(hasData = false, message = "Server down")

        assertThat(state).isEqualTo(ConversationListLoadState.Error("Server down"))
        assertThat(ConversationListLoadStates.isError(state)).isTrue()
    }

    @Test
    fun `le squelette n apparait que sur un chargement sans donnees`() {
        assertThat(ConversationListLoadStates.showsSkeleton(ConversationListLoadState.Loading, hasData = false)).isTrue()
        assertThat(ConversationListLoadStates.showsSkeleton(ConversationListLoadState.Loading, hasData = true)).isFalse()
        assertThat(ConversationListLoadStates.showsSkeleton(ConversationListLoadState.CachedStale, hasData = true))
            .isFalse()
        assertThat(ConversationListLoadStates.showsSkeleton(ConversationListLoadState.Offline, hasData = true)).isFalse()
    }

    @Test
    fun `un rafraichissement sur une liste peuplee ne repasse pas en chargement`() {
        assertThat(ConversationListLoadStates.onRefreshStarted(ConversationListLoadState.Offline, hasData = true))
            .isEqualTo(ConversationListLoadState.Offline)
        assertThat(ConversationListLoadStates.onRefreshStarted(ConversationListLoadState.Error("x"), hasData = false))
            .isEqualTo(ConversationListLoadState.Loading)
    }

    @Test
    fun `la reparation ne part que sur un front montant apres un echec`() {
        val failed = ConversationListLoadState.Error("x")

        assertThat(ConversationListLoadStates.repairsOnReconnect(failed, wasOnline = false, isOnline = true)).isTrue()
        assertThat(ConversationListLoadStates.repairsOnReconnect(failed, wasOnline = true, isOnline = true)).isFalse()
        assertThat(ConversationListLoadStates.repairsOnReconnect(failed, wasOnline = true, isOnline = false)).isFalse()
        assertThat(
            ConversationListLoadStates.repairsOnReconnect(ConversationListLoadState.Offline, wasOnline = false, isOnline = true),
        ).isFalse()
    }
}
