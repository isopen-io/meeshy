package me.meeshy.sdk.cache.purge

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.mediacache.CacheDataKind
import me.meeshy.sdk.model.mediacache.CacheDomain
import me.meeshy.sdk.model.mediacache.CacheMediaIndex
import me.meeshy.sdk.model.mediacache.CacheMediaKind
import me.meeshy.sdk.model.mediacache.CachePurgeAvailability
import me.meeshy.sdk.model.mediacache.CachePurgeCellId
import org.junit.Test
import java.util.concurrent.Executors

@OptIn(ExperimentalCoroutinesApi::class)
class CachePurgeServiceTest {

    /** Un stockage en mémoire : url -> octets ; le résidu est tout ce que `keep` ne cite pas. */
    private class FakeDisk(files: Map<String, Long>, private val failing: Set<String> = emptySet()) : MediaDiskStore {
        val files = files.toMutableMap()
        val purgeCalls = mutableListOf<Set<String>>()
        var thread: String? = null
        var gate: CompletableDeferred<Unit>? = null

        override suspend fun totalBytes(): Long = files.values.sum()
        override suspend fun bytesFor(urls: Set<String>): Long {
            thread = Thread.currentThread().name
            gate?.await()
            return urls.sumOf { files[it] ?: 0L }
        }
        override suspend fun purge(urls: Set<String>): Long {
            purgeCalls += urls
            return urls.filter { it !in failing }.sumOf { files.remove(it) ?: 0L }
        }
        override suspend fun bytesExcluding(keep: Set<String>): Long = files.filterKeys { it !in keep }.values.sum()
        override suspend fun purgeExcluding(keep: Set<String>): Long =
            files.keys.filter { it !in keep }.sumOf { files.remove(it) ?: 0L }
    }

    private class FakeDisks(
        val images: MediaDiskStore,
        val thumbnails: MediaDiskStore,
        val videos: MediaDiskStore,
        val audio: MediaDiskStore,
    ) : CacheMediaDisks {
        override fun stores(kind: CacheMediaKind): List<MediaDiskStore> = when (kind) {
            CacheMediaKind.IMAGES -> listOf(images, thumbnails)
            CacheMediaKind.VIDEOS -> listOf(videos)
            CacheMediaKind.AUDIO -> listOf(audio)
        }
    }

    private class FakePayload(var size: Long, val broken: Boolean = false) : CachePayloadStore {
        override suspend fun bytes(): Long = if (broken) error("disque") else size
        override suspend fun clear(): Long = size.also { size = 0L }
    }

    private class FakePayloads(val messages: FakePayload, val stories: FakePayload) : CachePayloadStores {
        override fun store(kind: CacheDataKind, domain: CacheDomain): CachePayloadStore? = when {
            kind == CacheDataKind.MESSAGES && domain == CacheDomain.CONVERSATIONS -> messages
            kind == CacheDataKind.PAYLOADS && domain == CacheDomain.STORIES -> stories
            else -> null
        }
    }

    private class Fixture(
        val images: FakeDisk = FakeDisk(mapOf("img-conv" to 100L, "img-story" to 40L, "img-orphan" to 7L, "img-shared" to 10L)),
        val thumbnails: FakeDisk = FakeDisk(mapOf("img-conv" to 5L)),
        val videos: FakeDisk = FakeDisk(mapOf("vid-story" to 1_000L, "vid-orphan" to 300L)),
        val audio: FakeDisk = FakeDisk(emptyMap()),
        val messages: FakePayload = FakePayload(50L),
        val stories: FakePayload = FakePayload(20L),
        val index: Map<CacheDomain, CacheMediaIndex> = mapOf(
            CacheDomain.CONVERSATIONS to CacheMediaIndex(images = setOf("img-conv", "img-shared")),
            CacheDomain.STORIES to CacheMediaIndex(images = setOf("img-story", "img-shared"), videos = setOf("vid-story")),
        ),
        dispatcher: CoroutineDispatcher,
    ) {
        val service = CachePurgeService(
            disks = FakeDisks(images, thumbnails, videos, audio),
            payloads = FakePayloads(messages, stories),
            attribution = CacheAttributionSource { index },
            ledger = null,
            dispatcher = dispatcher,
        )
    }

    private fun id(kind: CacheDataKind, domain: CacheDomain) = CachePurgeCellId(kind, domain)

    @Test
    fun `chaque case media est mesuree sur les fichiers que son domaine cite`() = runTest {
        val report = Fixture(dispatcher = StandardTestDispatcher(testScheduler)).service.report()

        assertThat(report.cells).hasSize(28)
        assertThat(report.cell(CacheDataKind.IMAGES, CacheDomain.CONVERSATIONS)!!.availability)
            .isEqualTo(CachePurgeAvailability.Purgeable(100L + 10L + 5L))
        assertThat(report.cell(CacheDataKind.IMAGES, CacheDomain.STORIES)!!.availability.bytes).isEqualTo(50L)
        assertThat(report.cell(CacheDataKind.VIDEOS, CacheDomain.STORIES)!!.availability.bytes).isEqualTo(1_000L)
        assertThat(report.cell(CacheDataKind.MESSAGES, CacheDomain.CONVERSATIONS)!!.availability.bytes).isEqualTo(50L)
        assertThat(report.cell(CacheDataKind.PAYLOADS, CacheDomain.STORIES)!!.availability.bytes).isEqualTo(20L)
        assertThat(report.cell(CacheDataKind.IMAGES, CacheDomain.POSTS)!!.availability.bytes).isEqualTo(0L)
    }

    @Test
    fun `les fichiers que personne ne cite sont les medias orphelins et le total disque est mesure a part`() = runTest {
        val report = Fixture(dispatcher = StandardTestDispatcher(testScheduler)).service.report()

        assertThat(report.unattributedBytes).isEqualTo(7L + 300L)
        assertThat(report.totalDiskBytes).isEqualTo(100L + 40L + 7L + 10L + 5L + 1_000L + 300L)
    }

    @Test
    fun `une seule case est purgee et rend les octets reellement liberes`() = runTest {
        val fixture = Fixture(dispatcher = StandardTestDispatcher(testScheduler))

        val result = fixture.service.purge(setOf(id(CacheDataKind.VIDEOS, CacheDomain.STORIES)))

        assertThat(result.freedBytes).isEqualTo(1_000L)
        assertThat(fixture.videos.files.keys).containsExactly("vid-orphan")
        assertThat(fixture.images.files).hasSize(4)
    }

    @Test
    fun `un fichier cite par deux domaines n est supprime qu une fois`() = runTest {
        val fixture = Fixture(dispatcher = StandardTestDispatcher(testScheduler))

        val result = fixture.service.purge(
            setOf(id(CacheDataKind.IMAGES, CacheDomain.CONVERSATIONS), id(CacheDataKind.IMAGES, CacheDomain.STORIES)),
        )

        assertThat(result.freedBytes).isEqualTo(100L + 40L + 10L + 5L)
        assertThat(fixture.images.purgeCalls).hasSize(1)
        assertThat(fixture.images.purgeCalls.single().count { it == "img-shared" }).isEqualTo(1)
        assertThat(fixture.images.files.keys).containsExactly("img-orphan")
    }

    @Test
    fun `une case non purgeable est refusee sans bloquer les autres`() = runTest {
        val fixture = Fixture(dispatcher = StandardTestDispatcher(testScheduler))
        val refused = id(CacheDataKind.DOCUMENTS, CacheDomain.POSTS)

        val result = fixture.service.purge(setOf(refused, id(CacheDataKind.MESSAGES, CacheDomain.CONVERSATIONS)))

        assertThat(result.refused).containsExactly(refused)
        assertThat(result.freedBytes).isEqualTo(50L)
        assertThat(fixture.messages.size).isEqualTo(0L)
    }

    @Test
    fun `les medias orphelins se purgent en bloc sans toucher ce qu un domaine cite`() = runTest {
        val fixture = Fixture(dispatcher = StandardTestDispatcher(testScheduler))

        val freed = fixture.service.purgeUnattributed()

        assertThat(freed).isEqualTo(7L + 300L)
        assertThat(fixture.images.files.keys).containsExactly("img-conv", "img-story", "img-shared")
        assertThat(fixture.videos.files.keys).containsExactly("vid-story")
    }

    @Test
    fun `la selection peut inclure le residu`() = runTest {
        val fixture = Fixture(dispatcher = StandardTestDispatcher(testScheduler))

        val result = fixture.service.purge(setOf(id(CacheDataKind.VIDEOS, CacheDomain.STORIES)), includeUnattributed = true)

        assertThat(result.freedBytes).isEqualTo(1_000L + 7L + 300L)
        assertThat(fixture.videos.files).isEmpty()
    }

    @Test
    fun `une erreur d E S sur un stockage n abandonne pas le reste`() = runTest {
        val fixture = Fixture(
            dispatcher = StandardTestDispatcher(testScheduler),
            messages = FakePayload(50L, broken = true),
        )

        val report = fixture.service.report()

        assertThat(report.cell(CacheDataKind.MESSAGES, CacheDomain.CONVERSATIONS)!!.availability.bytes).isEqualTo(0L)
        assertThat(report.cell(CacheDataKind.VIDEOS, CacheDomain.STORIES)!!.availability.bytes).isEqualTo(1_000L)
    }

    @Test
    fun `un fichier qui ne se supprime pas ne compte pas et les autres partent`() = runTest {
        val fixture = Fixture(
            dispatcher = StandardTestDispatcher(testScheduler),
            images = FakeDisk(mapOf("img-conv" to 100L, "img-shared" to 10L), failing = setOf("img-conv")),
        )

        val result = fixture.service.purge(setOf(id(CacheDataKind.IMAGES, CacheDomain.CONVERSATIONS)))

        assertThat(result.freedBytes).isEqualTo(10L + 5L)
    }

    @Test
    fun `la mesure ne tourne pas sur le fil appelant`() = runTest {
        val executor = Executors.newSingleThreadExecutor { Thread(it, "cache-io") }
        try {
            val fixture = Fixture(dispatcher = executor.asCoroutineDispatcher())

            fixture.service.report()

            assertThat(fixture.videos.thread).isEqualTo("cache-io")
        } finally {
            executor.shutdown()
        }
    }

    @Test
    fun `une mesure annulee s arrete sans purger`() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val fixture = Fixture(dispatcher = dispatcher)
        val gate = CompletableDeferred<Unit>()
        fixture.images.gate = gate

        val job = async { fixture.service.report() }
        advanceUntilIdle()
        job.cancelAndJoin()

        assertThat(job.isCancelled).isTrue()
        assertThat(fixture.images.purgeCalls).isEmpty()
        assertThat(fixture.images.files).hasSize(4)
    }
}
