package me.meeshy.sdk.user

import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.contacts.ContactCardResolutionScope
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ContactResolveRequest
import me.meeshy.sdk.net.api.PublicContactAccount
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import org.junit.Test

class ContactCardMeeshyLookupTest {

    private val card = "BEGIN:VCARD\nVERSION:3.0\nFN:Ada\nTEL:+33600000001\nEND:VCARD\n"
    private val ada = PublicContactAccount(userId = "u1", displayName = "Ada L.", username = "ada", avatarUrl = "https://cdn/a.png")

    private class Harness(card: String, answer: List<PublicContactAccount>) {
        val opened = mutableListOf<String>()
        val requests = mutableListOf<ContactResolveRequest>()
        var gate: CompletableDeferred<Unit>? = null
        val cards = VCardCache({ uri -> opened += uri; ByteArrayInputStream(card.toByteArray()) }, Dispatchers.Unconfined, 10, null)
        val resolver = ContactCardAccountResolver(
            source = { request -> requests += request; gate?.await(); NetworkResult.Success(answer) },
            freshnessMillis = 600_000, failureBackoffMillis = 120_000, capacity = 10, clock = { 0L },
        )
        val lookup = ContactCardMeeshyLookup(cards, resolver) { "FR" }
    }

    @Test
    fun `une carte en clair rend le compte inscrit`() = runTest {
        val h = Harness(card, listOf(ada))

        val account = h.lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.Clear)

        assertThat(account).isEqualTo(ContactCardMeeshyAccount("u1", "Ada L.", "https://cdn/a.png"))
        assertThat(h.lookup.cached("a1", ContactCardResolutionScope.Clear)).isEqualTo(account)
    }

    @Test
    fun `un contact non inscrit ne montre rien`() = runTest {
        val h = Harness(card, emptyList())

        assertThat(h.lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.Clear)).isNull()
    }

    @Test
    fun `bout en bout et inconnu ferment sans lire ni requeter`() = runTest {
        val h = Harness(card, listOf(ada))

        for (scope in listOf(ContactCardResolutionScope.EndToEnd, ContactCardResolutionScope.Unknown)) {
            assertThat(h.lookup.lookup("a1", "content://dl/1", scope)).isNull()
            assertThat(h.lookup.cached("a1", scope)).isNull()
        }
        assertThat(h.opened).isEmpty()
        assertThat(h.requests).isEmpty()
    }

    @Test
    fun `un compte deja resolu ne ferme pas la porte a une resolution refusee ensuite`() = runTest {
        val h = Harness(card, listOf(ada))
        h.lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.Clear)

        assertThat(h.lookup.cached("a1", ContactCardResolutionScope.EndToEnd)).isNull()
        assertThat(h.lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.EndToEnd)).isNull()
    }

    @Test
    fun `une carte non telechargee ne declenche aucune requete`() = runTest {
        val h = Harness(card, listOf(ada))

        assertThat(h.lookup.lookup("a1", "https://gate/x.vcf", ContactCardResolutionScope.Clear)).isNull()
        assertThat(h.opened).isEmpty()
        assertThat(h.requests).isEmpty()
    }

    @Test
    fun `deux demandes simultanees pour la meme carte ne font qu'une requete`() = runTest {
        val h = Harness(card, listOf(ada))
        h.gate = CompletableDeferred()

        val first = async { h.lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.Clear) }
        val second = async { h.lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.Clear) }
        runCurrent()
        h.gate!!.complete(Unit)

        assertThat(first.await()).isNotNull()
        assertThat(second.await()).isEqualTo(first.await())
        assertThat(h.requests).hasSize(1)
        assertThat(h.opened).hasSize(1)
    }

    @Test
    fun `une demande annulee n'empeche pas la suivante d'aboutir`() = runTest {
        val h = Harness(card, listOf(ada))
        h.gate = CompletableDeferred()

        val first = async { h.lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.Clear) }
        val second = async { h.lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.Clear) }
        runCurrent()
        first.cancel()
        runCurrent()
        h.gate!!.complete(Unit)

        assertThat(second.await()?.userId).isEqualTo("u1")
    }

    @Test
    fun `deux pieces portant la meme carte ne font qu'une requete`() = runTest {
        val h = Harness(card, listOf(ada))
        h.gate = CompletableDeferred()

        val first = async { h.lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.Clear) }
        val second = async { h.lookup.lookup("a2", "content://dl/2", ContactCardResolutionScope.Clear) }
        runCurrent()
        h.gate!!.complete(Unit)

        assertThat(first.await()?.userId).isEqualTo("u1")
        assertThat(second.await()?.userId).isEqualTo("u1")
        assertThat(h.requests).hasSize(1)
    }

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    @Test
    fun `B ne rejoint pas le vol encore ouvert de A et resout ses propres comptes`() = runTest {
        val owner = Owner("A")
        val fence = AccountFence(owner)
        val gate = CompletableDeferred<Unit>()
        val adaOfB = ada.copy(userId = "u-b", displayName = "Ada B.")
        val askedBy = mutableListOf<String?>()
        val cards = VCardCache({ ByteArrayInputStream(card.toByteArray()) }, Dispatchers.Unconfined, 10, fence)
        val resolver = ContactCardAccountResolver(
            source = {
                val asker = owner.id
                askedBy += asker
                gate.await()
                NetworkResult.Success(listOf(if (asker == "A") ada else adaOfB))
            },
            freshnessMillis = 600_000, failureBackoffMillis = 120_000, capacity = 10, clock = { 0L }, fence = fence,
        )
        val lookup = ContactCardMeeshyLookup(cards, resolver, fence) { "FR" }

        val underA = async { lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.Clear) }
        runCurrent()
        fence.close { cards.clear(); resolver.clear(); owner.id = null }
        owner.id = "B"
        val underB = async { lookup.lookup("a1", "content://dl/1", ContactCardResolutionScope.Clear) }
        runCurrent()
        gate.complete(Unit)

        assertThat(underA.await()).isNull()
        assertThat(underB.await()?.userId).isEqualTo("u-b")
        assertThat(askedBy).containsExactly("A", "B").inOrder()
    }
}
