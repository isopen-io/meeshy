package me.meeshy.sdk.user

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.contacts.ContactRelation
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ContactResolveRequest
import me.meeshy.sdk.net.api.PublicContactAccount
import org.junit.Test

class ContactCardAccountResolverTest {

    private class Harness(private var next: NetworkResult<List<PublicContactAccount>>) {
        var now = 0L
        val requests = mutableListOf<ContactResolveRequest>()
        fun answer(result: NetworkResult<List<PublicContactAccount>>) { next = result }
        val resolver = ContactCardAccountResolver(
            source = { request -> requests += request; next },
            freshnessMillis = 1_000,
            failureBackoffMillis = 500,
            capacity = 2,
            clock = { now },
        )
    }

    private fun account(id: String, relation: String = "none") = PublicContactAccount(userId = id, displayName = id, username = id, relation = relation)
    private fun request(phone: String) = ContactResolveRequest.bounded(listOf(phone), emptyList(), "FR")
    private fun ok(vararg accounts: PublicContactAccount): NetworkResult<List<PublicContactAccount>> = NetworkResult.Success(accounts.toList())
    private val failure = NetworkResult.Failure(ApiError("x"))

    @Test
    fun `une requete vide ne touche jamais le reseau`() = runTest {
        val h = Harness(ok(account("a")))
        assertThat(h.resolver.resolve(ContactResolveRequest.bounded(emptyList(), emptyList()))).isEmpty()
        assertThat(h.requests).isEmpty()
    }

    @Test
    fun `une entree fraiche est servie sans reseau et visible par cached`() = runTest {
        val h = Harness(ok(account("a")))
        val req = request("+33600000001")
        assertThat(h.resolver.cached(req)).isNull()
        h.resolver.resolve(req)
        h.now = 999
        assertThat(h.resolver.cached(req)).hasSize(1)
        assertThat(h.resolver.resolve(req)).hasSize(1)
        assertThat(h.requests).hasSize(1)
    }

    @Test
    fun `une entree perimee est revalidee`() = runTest {
        val h = Harness(ok(account("a")))
        val req = request("+33600000001")
        h.resolver.resolve(req)
        h.now = 1_000
        h.answer(ok(account("a"), account("b")))
        assertThat(h.resolver.resolve(req)).hasSize(2)
        assertThat(h.requests).hasSize(2)
    }

    @Test
    fun `un echec rend le dernier resultat connu puis n est pas rejoue avant le repli`() = runTest {
        val h = Harness(ok(account("a")))
        val req = request("+33600000001")
        h.resolver.resolve(req)
        h.now = 1_000
        h.answer(failure)
        assertThat(h.resolver.resolve(req)).hasSize(1)
        h.now = 1_200
        assertThat(h.resolver.resolve(req)).hasSize(1)
        assertThat(h.requests).hasSize(2)
        h.now = 1_600
        h.answer(ok())
        assertThat(h.resolver.resolve(req)).isEmpty()
        assertThat(h.requests).hasSize(3)
    }

    @Test
    fun `un echec sans cache rend une liste vide`() = runTest {
        val h = Harness(failure)
        assertThat(h.resolver.resolve(request("+33600000001"))).isEmpty()
    }

    @Test
    fun `la capacite evince la plus ancienne entree`() = runTest {
        val h = Harness(ok(account("a")))
        val first = request("+33600000001")
        h.resolver.resolve(first)
        h.resolver.resolve(request("+33600000002"))
        h.resolver.resolve(request("+33600000003"))
        assertThat(h.resolver.cached(first)).isNull()
    }

    @Test
    fun `updateRelation reecrit le compte dans toutes les entrees`() = runTest {
        val h = Harness(ok(account("a"), account("b")))
        val req = request("+33600000001")
        h.resolver.resolve(req)
        h.resolver.updateRelation("a", ContactRelation.RequestSent)
        val accounts = h.resolver.cached(req)!!
        assertThat(accounts.first { it.userId == "a" }.relationState).isEqualTo(ContactRelation.RequestSent)
        assertThat(accounts.first { it.userId == "b" }.relationState).isEqualTo(ContactRelation.None)
    }

    @Test
    fun `purge oublie tout`() = runTest {
        val h = Harness(ok(account("a")))
        val req = request("+33600000001")
        h.resolver.resolve(req)
        h.resolver.clear()
        assertThat(h.resolver.cached(req)).isNull()
    }
}
