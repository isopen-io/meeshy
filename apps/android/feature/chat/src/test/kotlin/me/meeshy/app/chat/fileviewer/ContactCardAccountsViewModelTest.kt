package me.meeshy.app.chat.fileviewer

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.DirectConversationOpener
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.DirectConversationSource
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendConnectionCoordinator
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.contacts.ContactCardResolutionScope
import me.meeshy.sdk.model.contacts.ContactRelation
import me.meeshy.sdk.model.contacts.vcard.VCard
import me.meeshy.sdk.model.contacts.vcard.VCardEntry
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.api.ContactResolveRequest
import me.meeshy.sdk.net.api.PublicContactAccount
import me.meeshy.sdk.user.ContactCardAccountResolver
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ContactCardAccountsViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val card = VCard(formattedName = "Zoé", phones = listOf(VCardEntry("+33612345678")), emails = listOf(VCardEntry("Zoe@Example.com")))
    private val request = ContactResolveRequest.bounded(listOf("+33612345678"), listOf("zoe@example.com"), "FR")

    private fun account(id: String, relation: String = "none") =
        PublicContactAccount(userId = id, displayName = "Zoé $id", username = "zoe$id", relation = relation)

    private class Fixture(
        val resolver: ContactCardAccountResolver,
        val connections: FriendConnectionCoordinator,
        val friendship: FriendshipCache,
        val blocks: BlockCache,
        val source: DirectConversationSource,
        val vm: ContactCardAccountsViewModel,
    )

    private fun fixture(
        cached: List<PublicContactAccount>? = null,
        resolved: List<PublicContactAccount> = emptyList(),
        resolution: DirectConversationResolution = DirectConversationResolution.Failed(ApiError("x"), offline = false),
        cachedDirect: ApiConversation? = null,
    ): Fixture {
        val resolver = mockk<ContactCardAccountResolver> {
            every { cached(any()) } returns cached
            coEvery { resolve(any()) } returns resolved
        }
        val connections = mockk<FriendConnectionCoordinator> {
            every { busyUserIds } returns MutableStateFlow(emptySet())
        }
        val source = mockk<DirectConversationSource> {
            coEvery { cachedDirectWith(any()) } returns cachedDirect
            coEvery { directConversationWith(any()) } returns resolution
        }
        val friendship = FriendshipCache()
        val blocks = BlockCache()
        val vm = ContactCardAccountsViewModel(resolver, DirectConversationOpener(source), connections, friendship, blocks) { "FR" }
        return Fixture(resolver, connections, friendship, blocks, source, vm)
    }

    @Test
    fun `les comptes du cache sont montres avant tout reseau puis revalides`() = runTest(dispatcher) {
        val f = fixture(cached = listOf(account("a")), resolved = listOf(account("a"), account("b")))
        f.vm.bind(card, ContactCardResolutionScope.Clear)
        advanceUntilIdle()
        assertThat(f.vm.rows.value.map { it.account.userId }).containsExactly("a", "b").inOrder()
        coVerify { f.resolver.resolve(request) }
    }

    @Test
    fun `seul le premier compte garde son visage dans l entete`() = runTest(dispatcher) {
        val f = fixture(resolved = listOf(account("a"), account("b")))
        f.vm.bind(card, ContactCardResolutionScope.Clear)
        advanceUntilIdle()
        assertThat(f.vm.rows.value.map { it.showsFace }).containsExactly(false, true).inOrder()
    }

    @Test
    fun `une carte sans numero ni e-mail ne part pas au serveur`() = runTest(dispatcher) {
        val f = fixture()
        f.vm.bind(VCard(formattedName = "Sans identifiant"), ContactCardResolutionScope.Clear)
        advanceUntilIdle()
        coVerify(exactly = 0) { f.resolver.resolve(any()) }
        assertThat(f.vm.rows.value).isEmpty()
    }

    @Test
    fun `soi n a aucune action et un ami peut seulement ecrire`() = runTest(dispatcher) {
        val f = fixture(resolved = listOf(account("me", "self"), account("fr", "friend"), account("no")))
        f.vm.bind(card, ContactCardResolutionScope.Clear)
        advanceUntilIdle()
        val rows = f.vm.rows.value.associateBy { it.account.userId }
        assertThat(rows.getValue("me").actions.canWrite).isFalse()
        assertThat(rows.getValue("fr").actions.connect).isNull()
        assertThat(rows.getValue("fr").canWrite).isTrue()
        assertThat(rows.getValue("no").actions.connect).isNotNull()
    }

    @Test
    fun `une demande envoyee bascule la relation servie sans attendre le reseau`() = runTest(dispatcher) {
        val f = fixture(resolved = listOf(account("a")))
        f.vm.bind(card, ContactCardResolutionScope.Clear)
        advanceUntilIdle()
        f.friendship.didSendRequest("a", "r1")
        advanceUntilIdle()
        assertThat(f.vm.rows.value.single().relation).isEqualTo(ContactRelation.RequestSent)
    }

    @Test
    fun `se connecter appelle le coordinateur et un refus immediat est dit`() = runTest(dispatcher) {
        val f = fixture(resolved = listOf(account("a")))
        val job: Job = launch { }
        every { f.connections.connect("a") } returns job
        f.vm.bind(card, ContactCardResolutionScope.Clear)
        val events = mutableListOf<ContactCardAccountEvent>()
        val collector = launch(Dispatchers.Unconfined) { f.vm.events.collect { events += it } }
        advanceUntilIdle()
        f.vm.connect("a")
        advanceUntilIdle()
        verify { f.connections.connect("a") }
        assertThat(events).containsExactly(ContactCardAccountEvent.ConnectFailed)
        collector.cancel()
    }

    @Test
    fun `ecrire ouvre la directe existante sans creer`() = runTest(dispatcher) {
        val f = fixture(resolved = listOf(account("a", "friend")), cachedDirect = ApiConversation(id = "c1", type = "direct"))
        val events = mutableListOf<ContactCardAccountEvent>()
        val collector = launch(Dispatchers.Unconfined) { f.vm.events.collect { events += it } }
        f.vm.write("a")
        advanceUntilIdle()
        assertThat(events).containsExactly(ContactCardAccountEvent.OpenConversation("c1"))
        coVerify(exactly = 0) { f.source.directConversationWith(any()) }
        collector.cancel()
    }

    @Test
    fun `ecrire a un bloque est refuse sans rien ouvrir`() = runTest(dispatcher) {
        val f = fixture(resolved = listOf(account("a", "friend")))
        f.blocks.setBlocked("a", true)
        val events = mutableListOf<ContactCardAccountEvent>()
        val collector = launch(Dispatchers.Unconfined) { f.vm.events.collect { events += it } }
        f.vm.bind(card, ContactCardResolutionScope.Clear)
        advanceUntilIdle()
        f.vm.write("a")
        advanceUntilIdle()
        assertThat(events).containsExactly(ContactCardAccountEvent.OpenFailed)
        assertThat(f.vm.rows.value.single().canWrite).isFalse()
        coVerify(exactly = 0) { f.source.cachedDirectWith(any()) }
        collector.cancel()
    }

    @Test
    fun `un echec d ouverture est dit`() = runTest(dispatcher) {
        val f = fixture(resolved = listOf(account("a", "friend")))
        val events = mutableListOf<ContactCardAccountEvent>()
        val collector = launch(Dispatchers.Unconfined) { f.vm.events.collect { events += it } }
        f.vm.write("a")
        advanceUntilIdle()
        assertThat(events).containsExactly(ContactCardAccountEvent.OpenFailed)
        collector.cancel()
    }

    @Test
    fun `une fiche en bout en bout ne lit ni ne requete rien et dit la verification indisponible`() = runTest(dispatcher) {
        val f = fixture(cached = listOf(account("a")), resolved = listOf(account("a")))
        f.vm.bind(card, ContactCardResolutionScope.EndToEnd)
        advanceUntilIdle()
        coVerify(exactly = 0) { f.resolver.resolve(any()) }
        verify(exactly = 0) { f.resolver.cached(any()) }
        assertThat(f.vm.rows.value).isEmpty()
        assertThat(f.vm.lookupUnavailable.value).isTrue()
    }

    @Test
    fun `une fiche au mode inconnu ferme comme le bout en bout`() = runTest(dispatcher) {
        val f = fixture(resolved = listOf(account("a")))
        f.vm.bind(card, ContactCardResolutionScope.Unknown)
        advanceUntilIdle()
        coVerify(exactly = 0) { f.resolver.resolve(any()) }
        assertThat(f.vm.rows.value).isEmpty()
        assertThat(f.vm.lookupUnavailable.value).isTrue()
    }

    @Test
    fun `une fiche en clair resout et ne dit rien d'indisponible`() = runTest(dispatcher) {
        val f = fixture(resolved = listOf(account("a")))
        f.vm.bind(card, ContactCardResolutionScope.Clear)
        advanceUntilIdle()
        coVerify(exactly = 1) { f.resolver.resolve(request) }
        assertThat(f.vm.rows.value).hasSize(1)
        assertThat(f.vm.lookupUnavailable.value).isFalse()
    }

    @Test
    fun `la meme carte rouverte sous une portee fermee efface les comptes deja montres`() = runTest(dispatcher) {
        val f = fixture(resolved = listOf(account("a")))
        f.vm.bind(card, ContactCardResolutionScope.Clear)
        advanceUntilIdle()
        f.vm.bind(card, ContactCardResolutionScope.EndToEnd)
        advanceUntilIdle()
        assertThat(f.vm.rows.value).isEmpty()
        assertThat(f.vm.lookupUnavailable.value).isTrue()
    }
}
