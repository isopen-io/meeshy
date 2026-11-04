package me.meeshy.sdk.publication

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadProgressLedger
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.PublicationCancelOutcome
import me.meeshy.sdk.net.api.CreatePostRequest
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
        val blobs = MediaBlobStore(
            db.mediaBlobDao(),
            me.meeshy.sdk.media.MediaBlobFiles(kotlin.io.path.createTempDirectory("blobs").toFile()) {
                me.meeshy.core.crypto.primitives.StreamingSeal.ephemeral()
            },
        )
        publications = PublicationOutbox(
            outbox,
            MediaUploadQueue(blobs, outbox),
            InMemoryPostComposerDraftStore(),
            InMemoryStoryComposerDraftStore(),
            MediaUploadProgressLedger(),
            OutboxOwnerSource { "me" },
        )
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
}
