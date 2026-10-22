package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

/**
 * La boucle unique derriere la liste d'amis et la liste de bloques : elle s'arrete a
 * l'epuisement, a l'absence de curseur, a un curseur qui n'avance pas, ou au plafond —
 * et un echec de page ne rend JAMAIS une liste coupee comme si elle etait complete.
 */
class CursorDrainTest {

    private fun page(items: List<Int>, next: String?, hasMore: Boolean) =
        NetworkResult.Success(DrainedPage(items, next, hasMore))

    /** Rend les reponses dans l'ordre et note chaque curseur demande. */
    private class Script(vararg answers: NetworkResult<DrainedPage<Int>>) {
        val asked = mutableListOf<String?>()
        private val queue = answers.toMutableList()

        suspend fun fetch(cursor: String?): NetworkResult<DrainedPage<Int>> {
            asked.add(cursor)
            return queue.removeAt(0)
        }
    }

    @Test
    fun `it follows the cursor page after page until the gateway says there is no more`() = runTest {
        val script = Script(
            page(listOf(1, 2), "c1", hasMore = true),
            page(listOf(3), "c2", hasMore = true),
            page(listOf(4), null, hasMore = false),
        )

        val result = drainByCursor(cap = 100) { script.fetch(it) }

        assertThat((result as NetworkResult.Success).data).containsExactly(1, 2, 3, 4).inOrder()
        assertThat(script.asked).containsExactly(null, "c1", "c2").inOrder()
    }

    @Test
    fun `a failing page fails the whole read, whatever was already read`() = runTest {
        val failure = NetworkResult.Failure(ApiError(message = "offline", code = "NETWORK"))
        val script = Script(page(listOf(1, 2), "c1", hasMore = true), failure)

        val result = drainByCursor(cap = 100) { script.fetch(it) }

        assertThat(result).isEqualTo(failure)
    }

    @Test
    fun `it stops at the cap and hands back no more than the cap`() = runTest {
        val script = Script(
            page(listOf(1, 2, 3), "c1", hasMore = true),
            page(listOf(4, 5, 6), "c2", hasMore = true),
            page(listOf(7, 8, 9), "c3", hasMore = true),
        )

        val result = drainByCursor(cap = 5) { script.fetch(it) }

        assertThat((result as NetworkResult.Success).data).containsExactly(1, 2, 3, 4, 5).inOrder()
        assertThat(script.asked).hasSize(2)
    }

    @Test
    fun `a blank cursor is no cursor - it does not ask the same page again`() = runTest {
        val script = Script(page(listOf(1), "  ", hasMore = true))

        val result = drainByCursor(cap = 100) { script.fetch(it) }

        assertThat((result as NetworkResult.Success).data).containsExactly(1)
        assertThat(script.asked).hasSize(1)
    }

    @Test
    fun `an empty page ends the read even if more is announced`() = runTest {
        val script = Script(page(emptyList(), "c1", hasMore = true))

        val result = drainByCursor(cap = 100) { script.fetch(it) }

        assertThat((result as NetworkResult.Success).data).isEmpty()
        assertThat(script.asked).hasSize(1)
    }
}
