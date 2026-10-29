package me.meeshy.sdk.publication

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadProgressLedger
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.outbox.OutboxDependencyKey
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.post.InMemoryPostComposerDraftStore
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftAnnotations
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PublicationOutboxTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository
    private lateinit var blobs: MediaBlobStore
    private lateinit var uploads: MediaUploadQueue
    private lateinit var drafts: InMemoryPostComposerDraftStore
    private lateinit var storyDrafts: InMemoryStoryComposerDraftStore
    private lateinit var publications: PublicationOutbox

    private val photo = MediaUploadItem(bytes = byteArrayOf(1, 2, 3), fileName = "a.heic", mimeType = "image/heic")

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        outbox = OutboxRepository(db, db.outboxDao(), OutboxOwnerSource { "me" })
        blobs = MediaBlobStore(db.mediaBlobDao(), me.meeshy.sdk.media.MediaBlobFiles(kotlin.io.path.createTempDirectory("blobs").toFile()) { me.meeshy.core.crypto.primitives.StreamingSeal.ephemeral() })
        uploads = MediaUploadQueue(blobs, outbox)
        drafts = InMemoryPostComposerDraftStore()
        storyDrafts = InMemoryStoryComposerDraftStore()
        publications = PublicationOutbox(outbox, uploads, drafts, storyDrafts, MediaUploadProgressLedger(), OutboxOwnerSource { "me" })
    }

    @After
    fun tearDown() = db.close()

    private fun draft(vararg media: UploadedMedia) =
        PostComposerDraftSnapshot(text = "mes photos", media = media.toList(), mediaAlt = mapOf())

    private fun pending(id: String) = UploadedMedia(id, "content://picked/$id", "image/heic", 3L, null, null, null, null)

    @Test
    fun `a post is queued with its media still on the device and waits on their uploads`() = runTest {
        val upload = uploads.enqueue(photo, TusUploadContext.POST)

        val cmid = publications.enqueuePost(CreatePostRequest(content = "mes photos", mediaIds = listOf(upload)))

        val row = outbox.row(cmid)!!
        assertThat(row.kind).isEqualTo(OutboxKind.CREATE_POST.name)
        assertThat(row.lane).isEqualTo(OutboxLanes.POST)
        assertThat(OutboxDependencyKey.decode(row.dependsOn)).containsExactly(upload)
        assertThat(blobs.has(upload)).isTrue()
    }

    @Test
    fun `publishing parks the composer draft instead of erasing it`() = runTest {
        drafts.saveEditing(draft())

        val cmid = publications.enqueuePost(CreatePostRequest(content = "mes photos"), draft())

        assertThat(drafts.parked(cmid)).isEqualTo(draft())
        assertThat(drafts.loadEditing()).isNull()
    }

    @Test
    fun `an unsent post reads back with its words, its media count and its state`() = runTest {
        val upload = uploads.enqueue(photo, TusUploadContext.POST)
        val cmid = publications.enqueuePost(CreatePostRequest(content = "mes photos", type = "REEL", mediaIds = listOf(upload)))

        val sending = publications.unsent().first().single()
        assertThat(sending.kind).isEqualTo(UnsentPublicationKind.REEL)
        assertThat(sending.text).isEqualTo("mes photos")
        assertThat(sending.mediaCount).isEqualTo(1)
        assertThat(sending.status).isEqualTo(UnsentPublicationStatus.SENDING)
        assertThat(sending.canRetry).isFalse()

        outbox.markExhausted(cmid, "Post refused: HTTP 415")

        val failed = publications.unsent().first().single()
        assertThat(failed.status).isEqualTo(UnsentPublicationStatus.FAILED)
        assertThat(failed.failureReason).isEqualTo("Post refused: HTTP 415")
        assertThat(failed.canReopen).isTrue()
    }

    @Test
    fun `a queued story is listed too, but reopens only through retry or discard`() = runTest {
        outbox.enqueue(
            OutboxMutation(
                kind = OutboxKind.PUBLISH_STORY,
                lane = OutboxLanes.STORY,
                targetId = "pending_1",
                payload = MeeshyApi.json.encodeToString(CreateStoryRequest(content = "ma story")),
                cmid = "story-1",
            ),
        )
        outbox.markExhausted("story-1", "HTTP 500")

        val story = publications.unsent().first().single()

        assertThat(story.kind).isEqualTo(UnsentPublicationKind.STORY)
        assertThat(story.canRetry).isTrue()
        assertThat(story.canReopen).isFalse()
    }

    @Test
    fun `other queued mutations are not publications`() = runTest {
        outbox.enqueue(OutboxMutation(OutboxKind.LIKE_POST, OutboxLanes.SOCIAL, "p1", "{}", cmid = "like"))
        uploads.enqueue(photo, TusUploadContext.POST)

        assertThat(publications.unsent().first()).isEmpty()
    }

    @Test
    fun `retrying a failed post revives the refused upload it waits on`() = runTest {
        val upload = uploads.enqueue(photo, TusUploadContext.POST)
        val cmid = publications.enqueuePost(CreatePostRequest(mediaIds = listOf(upload)))
        outbox.markExhausted(upload, "HTTP 415")
        outbox.markExhausted(cmid, "Prerequisite(s) failed: $upload")

        assertThat(publications.retry(cmid)).isTrue()

        assertThat(outbox.stateOf(cmid)).isEqualTo(OutboxState.PENDING)
        assertThat(outbox.stateOf(upload)).isEqualTo(OutboxState.PENDING)
        assertThat(blobs.has(upload)).isTrue()
    }

    @Test
    fun `discarding is the author's explicit removal - post, its uploads, their bytes and its draft leave`() = runTest {
        val upload = uploads.enqueue(photo, TusUploadContext.POST)
        val cmid = publications.enqueuePost(CreatePostRequest(mediaIds = listOf(upload)), draft(pending(upload)))
        outbox.markExhausted(upload, "HTTP 415")
        outbox.markExhausted(cmid, "Prerequisite(s) failed")

        publications.discard(cmid)

        assertThat(outbox.row(cmid)).isNull()
        assertThat(outbox.row(upload)).isNull()
        assertThat(blobs.has(upload)).isFalse()
        assertThat(drafts.parked(cmid)).isNull()
        assertThat(publications.unsent().first()).isEmpty()
    }

    @Test
    fun `reopening a failed post gives the composer its draft back with the ids its media received`() = runTest {
        val upload = uploads.enqueue(photo, TusUploadContext.POST)
        val served = pending("media-real")
        val parked = draft(pending(upload), pending("media-2")).copy(mediaAlt = mapOf(upload to "un chat"))
        val cmid = publications.enqueuePost(CreatePostRequest(mediaIds = listOf(upload, "media-2")), parked)
        outbox.rewriteDependents(upload) { it.replace(upload, served.id) }
        outbox.markExhausted(cmid, "Post refused: HTTP 422")

        val reopened = publications.reopenPost(cmid)

        assertThat(reopened?.media?.map { it.id }).containsExactly("media-real", "media-2").inOrder()
        assertThat(reopened?.mediaAlt).containsExactly("media-real", "un chat")
        assertThat(drafts.loadEditing()).isEqualTo(reopened)
        assertThat(outbox.row(cmid)).isNull()
        assertThat(drafts.parked(cmid)).isNull()
    }

    @Test
    fun `reopening a failed post gives back the captions of its media under the ids they received`() = runTest {
        val upload = uploads.enqueue(photo, TusUploadContext.POST)
        val parked = draft(pending(upload)).copy(mediaCaption = mapOf(upload to "Au marché"))
        val cmid = publications.enqueuePost(CreatePostRequest(mediaIds = listOf(upload)), parked)
        outbox.rewriteDependents(upload) { it.replace(upload, "media-real") }
        outbox.markExhausted(cmid, "Post refused: HTTP 422")

        val reopened = publications.reopenPost(cmid)

        assertThat(reopened?.mediaCaption).containsExactly("media-real", "Au marché")
    }

    @Test
    fun `a post still on its way does not reopen`() = runTest {
        val cmid = publications.enqueuePost(CreatePostRequest(content = "en route"), draft())

        assertThat(publications.reopenPost(cmid)).isNull()
        assertThat(outbox.row(cmid)).isNotNull()
        assertThat(drafts.parked(cmid)).isNotNull()
    }

    @Test
    fun `a parked draft whose post was confirmed while the app was away leaves, the others stay`() = runTest {
        val confirmed = publications.enqueuePost(CreatePostRequest(content = "a"), draft())
        val waiting = publications.enqueuePost(CreatePostRequest(content = "b"), draft())
        outbox.markSucceeded(confirmed)

        publications.releaseSettledDrafts()

        assertThat(drafts.parkedCmids()).containsExactly(waiting)
    }

    @Test
    fun `a publication of another account stays out of the list while it is signed in`() = runTest {
        publications.enqueuePost(CreatePostRequest(content = "mine", mediaIds = emptyList()))
        val other = OutboxRepository(db, db.outboxDao(), OutboxOwnerSource { "someone-else" })
        val foreign = PublicationOutbox(other, uploads, drafts, storyDrafts, MediaUploadProgressLedger(), OutboxOwnerSource { "someone-else" })
        foreign.enqueuePost(CreatePostRequest(content = "theirs", mediaIds = emptyList()))

        val seen = publications.unsent().first().map { it.text }

        assertThat(seen).containsExactly("mine")
    }

    private suspend fun failedStory(cmid: String, request: CreateStoryRequest, dependsOn: Set<String> = emptySet()) {
        outbox.enqueue(
            OutboxMutation(
                kind = OutboxKind.PUBLISH_STORY,
                lane = OutboxLanes.STORY,
                targetId = "pending_$cmid",
                payload = MeeshyApi.json.encodeToString(request),
                dependsOn = dependsOn,
                cmid = cmid,
            ),
        )
        outbox.markExhausted(cmid, "HTTP 500")
    }

    private fun keptStory(vararg awaiting: String, media: List<String> = listOf("m1")) = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "ma story", mediaIds = media)),
        selectedId = "s1",
        annotations = StoryDraftAnnotations(
            mentions = listOf(PostMentionInput(userId = "u1", username = "ana", display = "PINNED")),
            mediaAlt = mapOf(media.first() to "un chat"),
            mediaCaption = mapOf(media.first() to "Minou"),
        ),
        awaitingPublication = awaiting.toList(),
    )

    @Test
    fun `a failed story whose draft is kept reopens, one whose draft is gone does not`() = runTest {
        failedStory("story-1", CreateStoryRequest(content = "ma story", mediaIds = listOf("m1")))
        assertThat(publications.unsent().first().single().canReopen).isFalse()

        storyDrafts.save(keptStory("story-1"))

        assertThat(publications.unsent().first().single().canReopen).isTrue()
    }

    @Test
    fun `reopening a failed story gives the composer its draft with mentions, alt texts and captions, and the queue loses the story`() = runTest {
        failedStory("story-1", CreateStoryRequest(content = "ma story", mediaIds = listOf("m1")))
        storyDrafts.save(keptStory("story-1"))

        val reopened = publications.reopenStory("story-1")

        assertThat(reopened?.isAwaitingPublication).isFalse()
        assertThat(storyDrafts.load()).isEqualTo(reopened)
        assertThat(reopened?.annotations?.mentions?.single()?.username).isEqualTo("ana")
        assertThat(reopened?.annotations?.mediaAlt).containsExactly("m1", "un chat")
        assertThat(reopened?.annotations?.mediaCaption).containsExactly("m1", "Minou")
        assertThat(outbox.row("story-1")).isNull()
        assertThat(publications.unsent().first()).isEmpty()
    }

    @Test
    fun `a reopened story keeps the upload it waits on and names its media by the id they received`() = runTest {
        val upload = uploads.enqueue(photo, TusUploadContext.STORY)
        failedStory("story-1", CreateStoryRequest(content = "ma story", mediaIds = listOf(upload)), dependsOn = setOf(upload))
        storyDrafts.save(keptStory("story-1", media = listOf(upload)))
        outbox.rewriteDependents(upload) { it.replace(upload, "media-real") }

        val reopened = publications.reopenStory("story-1")

        assertThat(reopened?.slides?.single()?.mediaIds).containsExactly("media-real")
        assertThat(reopened?.annotations?.mediaAlt).containsExactly("media-real", "un chat")
        assertThat(outbox.row(upload)).isNotNull()
        assertThat(blobs.has(upload)).isTrue()
    }

    @Test
    fun `a draft owing a story that is still on its way or already gone is not reopened`() = runTest {
        failedStory("story-1", CreateStoryRequest(content = "a"))
        outbox.enqueue(
            OutboxMutation(OutboxKind.PUBLISH_STORY, OutboxLanes.STORY, "pending_2", MeeshyApi.json.encodeToString(CreateStoryRequest(content = "b")), cmid = "story-2"),
        )
        storyDrafts.save(keptStory("story-1", "story-2"))

        assertThat(publications.reopenStory("story-1")).isNull()
        assertThat(publications.unsent().first().none { it.canReopen }).isTrue()

        storyDrafts.save(keptStory("story-1", "story-gone"))

        assertThat(publications.reopenStory("story-1")).isNull()
        assertThat(outbox.row("story-1")).isNotNull()
        assertThat(storyDrafts.load()?.isAwaitingPublication).isTrue()
    }

    @Test
    fun `a story the draft does not await is left alone`() = runTest {
        failedStory("story-1", CreateStoryRequest(content = "a"))
        storyDrafts.save(keptStory("other"))

        assertThat(publications.reopenStory("story-1")).isNull()
        assertThat(outbox.row("story-1")).isNotNull()
    }

    @Test
    fun `a story whose publication belongs to another account is not reopened (#13621)`() = runTest {
        val other = OutboxRepository(db, db.outboxDao(), OutboxOwnerSource { "other" })
        other.enqueue(
            OutboxMutation(
                kind = OutboxKind.PUBLISH_STORY,
                lane = OutboxLanes.STORY,
                targetId = "pending_story-1",
                payload = MeeshyApi.json.encodeToString(CreateStoryRequest(content = "ma story", mediaIds = listOf("m1"))),
                cmid = "story-1",
            ),
        )
        other.markExhausted("story-1", "HTTP 500")
        storyDrafts.save(keptStory("story-1"))

        assertThat(publications.reopenStory("story-1")).isNull()
        assertThat(outbox.row("story-1")).isNotNull()
        assertThat(storyDrafts.load()?.isAwaitingPublication).isTrue()
    }
}
