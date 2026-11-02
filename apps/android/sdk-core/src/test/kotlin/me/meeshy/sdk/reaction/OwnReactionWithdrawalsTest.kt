package me.meeshy.sdk.reaction

import com.google.common.truth.Truth.assertThat
import javax.inject.Singleton
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OwnReactionWithdrawalsTest {

    private fun withdrawal(index: Int) = OwnReactionWithdrawal("m$index", "🔥", stillMine = index % 2 == 0)

    /** Une rafale d'abandons plus longue que le tampon, annoncée avant que l'écran ait lu la première : aucune ne se perd. */
    @Test
    fun `a burst of withdrawals longer than the buffer reaches the listening screen whole`() = runTest {
        val withdrawals = OwnReactionWithdrawals()
        val heard = mutableListOf<OwnReactionWithdrawal>()
        backgroundScope.launch { withdrawals.withdrawals.collect { heard += it } }
        runCurrent()

        val burst = (0 until 200).map(::withdrawal)
        burst.forEach { withdrawals.announce(it) }
        runCurrent()

        assertThat(heard).containsExactlyElementsIn(burst).inOrder()
    }

    /** Chaque écran ouvert entend chaque abandon : deux conversations empilées ne se volent pas une annonce. */
    @Test
    fun `every open screen hears every withdrawal`() = runTest {
        val withdrawals = OwnReactionWithdrawals()
        val first = mutableListOf<OwnReactionWithdrawal>()
        val second = mutableListOf<OwnReactionWithdrawal>()
        backgroundScope.launch { withdrawals.withdrawals.collect { first += it } }
        backgroundScope.launch { withdrawals.withdrawals.collect { second += it } }
        runCurrent()

        withdrawals.announce(withdrawal(1))
        withdrawals.announce(withdrawal(2))
        runCurrent()

        assertThat(first).containsExactly(withdrawal(1), withdrawal(2)).inOrder()
        assertThat(second).containsExactly(withdrawal(1), withdrawal(2)).inOrder()
    }

    /**
     * L'outbox (`AddReactionHandler`, `RemoveReactionHandler`) annonce, l'écran (`ChatViewModel` → `ChatReactionController`)
     * écoute : ils ne s'entendent que s'ils tiennent la MÊME instance. Aucun de leurs constructeurs n'a plus de valeur par
     * défaut (le compilateur l'exige de chaque appelant) ; Hilt les sert donc tous depuis le composant singleton.
     */
    @Test
    fun `the announcer and the listener share one instance through the singleton component`() {
        assertThat(OwnReactionWithdrawals::class.java.isAnnotationPresent(Singleton::class.java)).isTrue()
    }
}
