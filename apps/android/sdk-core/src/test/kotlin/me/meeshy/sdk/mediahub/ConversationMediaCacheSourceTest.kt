package me.meeshy.sdk.mediahub

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.store.CacheStoreRegistry
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.media.ConversationMediaCatalog
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ConversationMediaCacheSourceTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock(now = 1_790_000_000_000L)
    private val registry = CacheStoreRegistry(Dispatchers.Unconfined)

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun source() = ConversationMediaCacheSource(registry, db.cacheEntryDao(), clock)

    private fun cold(source: ConversationMediaCacheSource = source()) = ConversationMediaHubIndex(null, source)

    private fun carrier(id: String, mime: String, minute: Int = 0, viewOnce: Boolean? = null) = ApiMessage(
        id = id,
        conversationId = "c1",
        createdAt = "2026-10-01T10:%02d:00.000Z".format(minute),
        attachments = listOf(ApiMessageAttachment(id = "a$id", mimeType = mime, fileUrl = "https://cdn/$id")),
        isViewOnce = viewOnce,
    )

    @Test fun `un index fusionne se relit a froid depuis le disque`() = runTest {
        val source = source()
        cold(source).merge("c1", ConversationMediaKind.VISUAL, listOf(carrier("m1", "image/png", 1)), complete = true, ticket = null)

        val restarted = cold(source)
        assertThat(restarted.read("c1", ConversationMediaKind.VISUAL)).isNull()
        val entry = restarted.load("c1", ConversationMediaKind.VISUAL)!!

        assertThat(entry.carriers.map { it.id }).containsExactly("m1")
        assertThat(entry.isComplete).isTrue()
    }

    @Test fun `un index par genre, sans plafond`() = runTest {
        val index = cold()
        val many = (0 until 700).map { carrier("m$it", "image/png", it % 60) }
        index.merge("c1", ConversationMediaKind.VISUAL, many, complete = false, ticket = null)
        index.merge("c1", ConversationMediaKind.DOCUMENT, listOf(carrier("d1", "application/pdf")), complete = false, ticket = null)

        val restarted = cold(source())
        assertThat(restarted.load("c1", ConversationMediaKind.VISUAL)!!.carriers).hasSize(700)
        assertThat(restarted.load("c1", ConversationMediaKind.DOCUMENT)!!.carriers.map { it.id }).containsExactly("d1")
        assertThat(restarted.load("c1", ConversationMediaKind.VISUAL)!!.isComplete).isFalse()
    }

    @Test fun `la vue unique n entre jamais sur le disque`() = runTest {
        cold().merge(
            "c1", ConversationMediaKind.VISUAL,
            listOf(carrier("ok", "image/png"), carrier("once", "image/png", viewOnce = true)), complete = true, ticket = null,
        )
        assertThat(cold().load("c1", ConversationMediaKind.VISUAL)!!.carriers.map { it.id }).containsExactly("ok")
    }

    @Test fun `au-dela de six mois l index n est plus servi`() = runTest {
        cold().merge("c1", ConversationMediaKind.VISUAL, listOf(carrier("m1", "image/png")), complete = true, ticket = null)
        clock.now += 190L * 24 * 3600 * 1000
        assertThat(cold().load("c1", ConversationMediaKind.VISUAL)).isNull()
    }

    @Test fun `la fraicheur est de dix minutes`() = runTest {
        val source = source()
        cold(source).merge("c1", ConversationMediaKind.VISUAL, listOf(carrier("m1", "image/png")), complete = true, ticket = null)
        assertThat(source.isFresh("c1", ConversationMediaKind.VISUAL)).isTrue()
        clock.now += 11 * 60_000L
        assertThat(source.isFresh("c1", ConversationMediaKind.VISUAL)).isFalse()
        assertThat(source.read("c1", ConversationMediaKind.VISUAL)).isNotNull()
    }

    @Test fun `invalider une conversation vide tous les genres, memoire et disque, sans toucher une autre`() = runTest {
        val source = source()
        val index = cold(source)
        ConversationMediaKind.entries.forEach {
            index.merge("c1", it, listOf(carrier("m-${it.wire}", "image/png")), complete = true, ticket = null)
        }
        index.merge("c2", ConversationMediaKind.VISUAL, listOf(carrier("x", "image/png")), complete = true, ticket = null)

        index.invalidateConversation("c1")

        ConversationMediaKind.entries.forEach {
            assertThat(index.load("c1", it)).isNull()
            assertThat(source.read("c1", it)).isNull()
        }
        assertThat(cold(source).load("c2", ConversationMediaKind.VISUAL)).isNotNull()
    }

    @Test fun `un message supprime est retire de tous les genres, jamais de fantome dans Documents`() = runTest {
        val source = source()
        val index = cold(source)
        val mixed = ApiMessage(
            id = "m1", conversationId = "c1", createdAt = "2026-10-01T10:00:00.000Z",
            attachments = listOf(
                ApiMessageAttachment(id = "p", mimeType = "image/png", fileUrl = "https://cdn/p"),
                ApiMessageAttachment(id = "d", mimeType = "application/pdf", fileUrl = "https://cdn/d"),
            ),
        )
        index.merge("c1", ConversationMediaKind.VISUAL, listOf(mixed), complete = true, ticket = null)
        index.merge("c1", ConversationMediaKind.DOCUMENT, listOf(mixed), complete = true, ticket = null)
        val restarted = cold(source)

        restarted.forgetMessage("c1", "m1", ticket = null)

        assertThat(cold(source).load("c1", ConversationMediaKind.DOCUMENT)!!.carriers).isEmpty()
        assertThat(cold(source).load("c1", ConversationMediaKind.VISUAL)!!.carriers).isEmpty()
    }

    @Test fun `le catalogue sert un media ancien lu sur le disque, et prechauffe la tete`() = runTest {
        val index = cold()
        index.merge("c1", ConversationMediaKind.VISUAL, listOf(carrier("old", "image/png", 1)), complete = true, ticket = null)

        val catalog = ConversationMediaCatalog(cold(source()))
        val items = catalog.items("c1", ConversationMediaKind.VISUAL, clock.now, "https://meeshy.me")

        assertThat(items.map { it.messageId }).containsExactly("old")
        assertThat(catalog.prewarmTargets("c1", clock.now, "https://meeshy.me")).hasSize(1)
    }

    @Test fun `la deconnexion vide le disque par l inventaire`() = runTest {
        val source = source()
        cold(source).merge("c1", ConversationMediaKind.VISUAL, listOf(carrier("m1", "image/png")), complete = true, ticket = null)

        registry.reset()

        assertThat(source.read("c1", ConversationMediaKind.VISUAL)).isNull()
    }
}
