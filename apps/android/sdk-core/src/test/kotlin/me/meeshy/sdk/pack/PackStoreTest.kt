package me.meeshy.sdk.pack

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.pack.PackDomain
import me.meeshy.sdk.model.sticker.StickerPackSummary
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PackStoreTest {
    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun cache() = KeyedJsonCache(db.keyedJsonCacheDao(), clock)

    private fun store(
        transport: FakePackTransport,
        online: Boolean = true,
        cache: KeyedJsonCache = cache(),
        onShrank: suspend () -> Unit = {},
    ) = PackStore(
        service = PackService(PackDomain.STICKER, StickerPackSummary.serializer(), transport),
        cache = cache,
        elementSerializer = StickerPackSummary.serializer(),
        defaults = StickerPackDefaults.builtins,
        isOnline = { online },
        clock = clock,
        onShelfShrank = onShrank,
    )

    @Test
    fun `tant que les installes sont inconnus, les trois packs integres sont servis`() = runTest {
        val store = store(FakePackTransport())

        assertThat(store.state.value.installed).isNull()
        assertThat(store.served().map { it.slug }).containsExactly("mee", "meo", "mee-et-meo")
    }

    @Test
    fun `une revalidation sert la liste du serveur`() = runTest {
        val store = store(FakePackTransport(installed = listOf(FakePackTransport.pack("fruits", installed = true))))

        store.loadInstalled()

        assertThat(store.served().map { it.slug }).containsExactly("fruits")
    }

    @Test
    fun `une panne n'efface jamais l'etagere deja connue`() = runTest {
        val transport = FakePackTransport(installed = listOf(FakePackTransport.pack("fruits", installed = true)))
        val store = store(transport)
        store.loadInstalled()

        transport.failWith = FakePackTransport.offline
        store.loadInstalled()

        assertThat(store.served().map { it.slug }).containsExactly("fruits")
    }

    @Test
    fun `chaque apparition revalide`() = runTest {
        val transport = FakePackTransport()
        val store = store(transport)

        store.loadInstalled()
        store.loadInstalled()

        assertThat(transport.calls.count { it == "installed sticker" }).isEqualTo(2)
    }

    @Test
    fun `installer bascule a l'instant puis confirme`() = runTest {
        val transport = FakePackTransport(catalogue = listOf(FakePackTransport.pack("fruits")))
        val store = store(transport)
        store.loadCatalogue()

        val outcome = store.toggle("fruits")

        assertThat(outcome).isEqualTo(PackToggleOutcome.Done)
        assertThat(store.state.value.catalogue!!.single().installed).isTrue()
        assertThat(store.state.value.pending).isEmpty()
        assertThat(transport.calls).contains("PUT sticker fruits")
    }

    @Test
    fun `un refus defait la bascule du seul pack et le dit`() = runTest {
        val transport = FakePackTransport(catalogue = listOf(FakePackTransport.pack("fruits")))
        val store = store(transport)
        store.loadCatalogue()
        transport.failWith = FakePackTransport.rejected(403, "PACK_NOT_OWNED")

        val outcome = store.toggle("fruits")

        assertThat(outcome).isEqualTo(PackToggleOutcome.Refused(403, "PACK_NOT_OWNED"))
        assertThat(store.state.value.catalogue!!.single().installed).isFalse()
        assertThat(store.state.value.failed).isTrue()
        assertThat(store.state.value.pending).isEmpty()
    }

    @Test
    fun `hors ligne l'installation est refusee sans rien basculer`() = runTest {
        val transport = FakePackTransport(catalogue = listOf(FakePackTransport.pack("fruits")))
        val store = store(transport, online = false)
        store.loadCatalogue()
        transport.calls.clear()

        val outcome = store.toggle("fruits")

        assertThat(outcome).isEqualTo(PackToggleOutcome.Offline)
        assertThat(store.state.value.catalogue!!.single().installed).isFalse()
        assertThat(transport.calls).isEmpty()
    }

    @Test
    fun `retirer annonce que l'etagere a retreci`() = runTest {
        var shrank = 0
        val transport = FakePackTransport(
            catalogue = listOf(FakePackTransport.pack("fruits", installed = true)),
            installed = listOf(FakePackTransport.pack("fruits", installed = true)),
        )
        val store = store(transport, onShrank = { shrank += 1 })
        store.loadInstalled()
        store.loadCatalogue()

        store.toggle("fruits")

        assertThat(shrank).isEqualTo(1)
    }

    @Test
    fun `la derniere etagere connue est servie depuis le cache avant le reseau`() = runTest {
        val shared = cache()
        val first = store(FakePackTransport(installed = listOf(FakePackTransport.pack("fruits", installed = true))), cache = shared)
        first.loadInstalled()

        val offline = FakePackTransport(failWith = FakePackTransport.offline)
        val second = store(offline, cache = shared)
        second.loadInstalled()

        assertThat(second.served().map { it.slug }).containsExactly("fruits")
    }

    @Test
    fun `la remise a zero du compte vide l'etagere et le cache`() = runTest {
        val shared = cache()
        val first = store(FakePackTransport(installed = listOf(FakePackTransport.pack("fruits", installed = true))), cache = shared)
        first.loadInstalled()

        first.clear()
        assertThat(first.state.value.installed).isNull()

        val next = store(FakePackTransport(failWith = FakePackTransport.offline), cache = shared)
        next.loadInstalled()
        assertThat(next.served().map { it.slug }).containsExactly("mee", "meo", "mee-et-meo")
    }
}
