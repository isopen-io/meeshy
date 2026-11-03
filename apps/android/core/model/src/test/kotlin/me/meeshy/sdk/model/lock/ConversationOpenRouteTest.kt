package me.meeshy.sdk.model.lock

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationOpenRouteTest {

    @Test
    fun `une conversation libre s'ouvre sans feuille`() {
        val route = ConversationOpenRoute.resolve(isLocked = false, searching = false)

        assertThat(route).isEqualTo(ConversationOpenRoute.Open(searching = false))
        assertThat(route.presentsLockSheet).isFalse()
    }

    @Test
    fun `une conversation verrouillee demande d'abord le code`() {
        val route = ConversationOpenRoute.resolve(isLocked = true, searching = false)

        assertThat(route).isEqualTo(ConversationOpenRoute.UnlockFirst(searching = false))
        assertThat(route.presentsLockSheet).isTrue()
    }

    @Test
    fun `la recherche demandee sur une conversation libre s'arme tout de suite`() {
        val route = ConversationOpenRoute.resolve(isLocked = false, searching = true)

        assertThat(route.armsSearchNow).isTrue()
        assertThat(route.searchesAfterUnlock).isFalse()
    }

    @Test
    fun `la recherche demandee sur une conversation verrouillee n'est conservee qu'apres le code`() {
        val route = ConversationOpenRoute.resolve(isLocked = true, searching = true)

        assertThat(route.armsSearchNow).isFalse()
        assertThat(route.searchesAfterUnlock).isTrue()
    }

    @Test
    fun `sans recherche demandee rien ne s'arme ni avant ni apres le code`() {
        listOf(false, true).forEach { locked ->
            val route = ConversationOpenRoute.resolve(isLocked = locked, searching = false)
            assertThat(route.armsSearchNow).isFalse()
            assertThat(route.searchesAfterUnlock).isFalse()
        }
    }

    @Test
    fun `fenetre detachee et fiche de details refusees devant un code`() {
        assertThat(ConversationOpenRoute.mayDetach(isLocked = true)).isFalse()
        assertThat(ConversationOpenRoute.mayShowInfo(isLocked = true)).isFalse()
        assertThat(ConversationOpenRoute.mayDetach(isLocked = false)).isTrue()
        assertThat(ConversationOpenRoute.mayShowInfo(isLocked = false)).isTrue()
    }
}
