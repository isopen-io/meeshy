package me.meeshy.sdk.engagement

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.time.LocalDate
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.ConversationEngagementRepository
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class ConversationEngagementStoreTest {

    private fun snap(total: Int, streak: Int = 3, day: String = "2026-10-27", today: Int = 4, id: String = "c1") =
        ConversationEngagementSnapshot(id, total, today, streak, day)

    private fun store(
        served: NetworkResult<ConversationEngagementSnapshot>? = null,
        now: LocalDate = LocalDate.of(2026, 10, 27),
    ): ConversationEngagementStore {
        val repository = mockk<ConversationEngagementRepository>()
        if (served != null) coEvery { repository.fetch(any()) } returns served
        return ConversationEngagementStore(repository) { now }
    }

    @Test
    fun `le plus frais gagne, un cache relu ne fait pas reculer la pastille`() {
        val store = store()
        store.seed(snap(total = 120))
        store.seed(snap(total = 100))
        assertThat(store.snapshot("c1")?.totalPoints).isEqualTo(120)
        store.seed(snap(total = 130, day = "2026-10-28"))
        assertThat(store.snapshot("c1")?.totalPoints).isEqualTo(130)
    }

    @Test
    fun `l'affichage est ramene au jour courant`() {
        val store = store(now = LocalDate.of(2026, 10, 29))
        store.seed(snap(total = 120, streak = 3, today = 4, day = "2026-10-27"))
        val shown = store.displayed("c1")!!
        assertThat(shown.streakDays).isEqualTo(0)
        assertThat(shown.todayPoints).isEqualTo(0)
        assertThat(shown.totalPoints).isEqualTo(120)
    }

    @Test
    fun `la graine de la liste concourt avec l'instantane tenu et un cumul nul se tait`() {
        val held = store()
        held.seed(snap(total = 50))
        assertThat(held.displayed("c1", seed = snap(total = 80))?.totalPoints).isEqualTo(80)
        assertThat(held.displayed("c1", seed = snap(total = 10))?.totalPoints).isEqualTo(50)
        assertThat(held.displayed("c1", seed = snap(total = 80, id = "autre"))?.totalPoints).isEqualTo(50)
        assertThat(store().displayed("c1", seed = snap(total = 0))).isNull()
        assertThat(store().displayed("c1")).isNull()
    }

    @Test
    fun `la deconnexion vide les instantanes`() = runTest {
        val store = store()
        store.seed(snap(total = 120))
        store.clear()
        assertThat(store.snapshots.value).isEmpty()
    }

    @Test
    fun `la revalidation installe l'etat serveur et un echec garde ce qu'on avait`() = runTest {
        val ok = store(NetworkResult.Success(snap(total = 200)))
        ok.seed(snap(total = 120))
        ok.revalidate("c1")
        assertThat(ok.snapshot("c1")?.totalPoints).isEqualTo(200)

        val ko = store(NetworkResult.Failure(me.meeshy.sdk.net.ApiError("offline")))
        ko.seed(snap(total = 120))
        ko.revalidate("c1")
        assertThat(ko.snapshot("c1")?.totalPoints).isEqualTo(120)
    }

    @Test
    fun `une revalidation d'une autre conversation est ecartee`() = runTest {
        val store = store(NetworkResult.Success(snap(total = 200, id = "autre")))
        store.revalidate("c1")
        assertThat(store.snapshot("c1")).isNull()
    }
}
