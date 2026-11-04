package me.meeshy.sdk.publication

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.outbox.MutationSender
import me.meeshy.sdk.outbox.OutboxDrainer
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxOutcome
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadProgressLedger
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.PublicationCancelOutcome
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.senders.CreatePostHandler
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.post.InMemoryPostComposerDraftStore
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PublicationCancelTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository
    private lateinit var publications: PublicationOutbox

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        outbox = OutboxRepository(db, db.outboxDao(), OutboxOwnerSource { "me" })
        publications = publicationsOver(outbox)
    }

    private fun publicationsOver(repository: OutboxRepository): PublicationOutbox {
        val blobs = MediaBlobStore(
            db.mediaBlobDao(),
            me.meeshy.sdk.media.MediaBlobFiles(kotlin.io.path.createTempDirectory("blobs").toFile()) {
                me.meeshy.core.crypto.primitives.StreamingSeal.ephemeral()
            },
        )
        return PublicationOutbox(
            repository,
            MediaUploadQueue(blobs, repository),
            InMemoryPostComposerDraftStore(),
            InMemoryStoryComposerDraftStore(),
            MediaUploadProgressLedger(),
            OutboxOwnerSource { "me" },
        )
    }

    /**
     * Le drainer qui RÉSERVE la ligne ([OutboxDao.claimPending]) juste après que « Supprimer » l'a lue `PENDING` : la
     * fenêtre que l'audit #15726 a trouvée entre la lecture et la suppression.
     */
    private class ClaimAfterRead(private val real: OutboxDao) : OutboxDao by real {
        var armedFor: String? = null

        override suspend fun find(cmid: String): OutboxEntity? {
            val row = real.find(cmid)
            if (armedFor == cmid) {
                armedFor = null
                real.claimPending(cmid, System.currentTimeMillis())
            }
            return row
        }
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun `supprimer une publication en file la retire`() = runTest {
        val cmid = publications.enqueuePost(CreatePostRequest(content = "bonjour"))

        assertThat(publications.cancel(cmid)).isEqualTo(PublicationCancelOutcome.REMOVED)
        assertThat(outbox.row(cmid)).isNull()
    }

    @Test
    fun `supprimer une publication echouee la retire`() = runTest {
        val cmid = publications.enqueuePost(CreatePostRequest(content = "bonjour"))
        outbox.markExhausted(cmid, "HTTP 500")

        assertThat(publications.cancel(cmid)).isEqualTo(PublicationCancelOutcome.REMOVED)
        assertThat(outbox.row(cmid)).isNull()
    }

    @Test
    fun `supprimer une publication en vol pose la marque durable sans retirer la ligne`() = runTest {
        val cmid = publications.enqueuePost(CreatePostRequest(content = "bonjour"))
        outbox.markInflight(cmid)

        assertThat(publications.cancel(cmid)).isEqualTo(PublicationCancelOutcome.CANCEL_REQUESTED)
        assertThat(outbox.row(cmid)!!.cancelRequestedAt).isNotNull()
    }

    @Test
    fun `supprimer une publication deja partie le constate`() = runTest {
        assertThat(publications.cancel("cmid_gone")).isEqualTo(PublicationCancelOutcome.ALREADY_SENT)
    }

    // ── Contrat d'annulation (audit #15726, iOS `OfflineQueue+PublicationCancel`) ──

    @Test
    fun `une ligne reservee par le drainer entre la lecture et la suppression n'est jamais dite retiree`() = runTest {
        val racing = ClaimAfterRead(db.outboxDao())
        val repository = OutboxRepository(db, racing, OutboxOwnerSource { "me" })
        val racingPublications = publicationsOver(repository)
        val cmid = racingPublications.enqueuePost(CreatePostRequest(content = "bonjour"))
        racing.armedFor = cmid

        val outcome = racingPublications.cancel(cmid)

        assertThat(outcome).isEqualTo(PublicationCancelOutcome.CANCEL_REQUESTED)
        assertThat(repository.row(cmid)!!.cancelRequestedAt).isNotNull()
    }

    @Test
    fun `une annulation honoree par le sender sort de la file sans jamais emettre Succeeded`() = runTest {
        val cmid = publications.enqueuePost(CreatePostRequest(content = "bonjour"))
        val drainer = OutboxDrainer(outbox, mapOf(OutboxKind.CREATE_POST to MutationSender { SendResult.Cancelled }))

        outbox.outcomes.test {
            val report = drainer.drainLane(OutboxLanes.POST)

            assertThat(awaitItem()).isEqualTo(OutboxOutcome.Cancelled(cmid))
            assertThat(report.delivered).isEqualTo(0)
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(outbox.row(cmid)).isNull()
    }

    @Test
    fun `supprimer pendant le vol puis l'envoi suivant ne publie rien`() = runTest {
        val cmid = publications.enqueuePost(CreatePostRequest(content = "bonjour"))
        val postApi = mockk<PostApi>()
        val handler = CreatePostHandler(
            postApi, outbox, MeeshyApi.json, mockk<PostRepository>(relaxed = true), InMemoryPostComposerDraftStore(),
        )
        val sender = MutationSender { row ->
            assertThat(publications.cancel(row.cmid)).isEqualTo(PublicationCancelOutcome.CANCEL_REQUESTED)
            handler.send(row)
        }

        val report = OutboxDrainer(outbox, mapOf(OutboxKind.CREATE_POST to sender)).drainLane(OutboxLanes.POST)

        coVerify(exactly = 0) { postApi.create(any(), any()) }
        assertThat(report.delivered).isEqualTo(0)
        assertThat(outbox.row(cmid)).isNull()
    }
}
