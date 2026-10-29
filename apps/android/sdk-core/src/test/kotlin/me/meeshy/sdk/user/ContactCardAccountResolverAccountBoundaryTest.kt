package me.meeshy.sdk.user

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ContactResolveRequest
import me.meeshy.sdk.net.api.PublicContactAccount
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.PerAccountCache
import org.junit.Test

/**
 * Ce que la carte a résolu (qui est inscrit, « ami », « demande envoyée », « vous ») appartient au compte qui l'a
 * demandé : la fin de session le vide, et une réponse partie sous A qui arrive après la fermeture de A n'est jamais
 * écrite pour B (#13495, #13560).
 */
class ContactCardAccountResolverAccountBoundaryTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private val request = ContactResolveRequest.bounded(listOf("+33600000001"), emptyList(), "FR")
    private val friendOfA = PublicContactAccount(userId = "u1", username = "u1", relation = "friend")

    private fun resolver(fence: AccountFence?, source: ContactAccountsSource) = ContactCardAccountResolver(
        source = source,
        freshnessMillis = 600_000,
        failureBackoffMillis = 120_000,
        capacity = 50,
        clock = { 0L },
        fence = fence,
    )

    @Test
    fun `le resolveur est un cache par compte vide a la fin de session`() = runTest {
        val subject = resolver(null) { NetworkResult.Success(listOf(friendOfA)) }
        subject.resolve(request)
        assertThat(subject.cached(request)).isNotNull()

        val cache: PerAccountCache = subject
        cache.clear()

        assertThat(subject.cached(request)).isNull()
    }

    @Test
    fun `une reponse partie sous A et arrivee apres sa fermeture n'est pas ecrite pour B`() = runTest {
        val owner = Owner("A")
        val fence = AccountFence(owner)
        val gate = CompletableDeferred<Unit>()
        val subject = resolver(fence) { gate.await(); NetworkResult.Success(listOf(friendOfA)) }

        val pending = async { subject.resolve(request) }
        runCurrent()
        fence.close { (subject as PerAccountCache).clear(); owner.id = null }
        owner.id = "B"
        gate.complete(Unit)
        val served = pending.await()

        assertThat(served).isEmpty()
        assertThat(subject.cached(request)).isNull()
    }
}
