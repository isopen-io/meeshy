package me.meeshy.sdk.outbox

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.story.PublishMediaWriteBack
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxDrainerTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        outbox = OutboxRepository(db, db.outboxDao())
    }

    @After
    fun tearDown() {
        db.close()
    }

    private val lane = OutboxLanes.forMessage("c1")

    private suspend fun enqueueSend(cmid: String) {
        outbox.enqueue(
            OutboxMutation(OutboxKind.SEND_MESSAGE, lane, targetId = cmid, payload = "{}", cmid = cmid),
        )
    }

    private suspend fun enqueueOn(
        cmid: String,
        rowLane: String,
        dependsOn: Set<String> = emptySet(),
    ) {
        outbox.enqueue(
            OutboxMutation(
                OutboxKind.SEND_MESSAGE,
                rowLane,
                targetId = cmid,
                payload = "{}",
                dependsOn = dependsOn,
                cmid = cmid,
            ),
        )
    }

    private fun drainer(sender: MutationSender) =
        OutboxDrainer(outbox, mapOf(OutboxKind.SEND_MESSAGE to sender))

    @Test
    fun `drainLane delivers every pending row on success`() = runTest {
        enqueueSend("m1")
        enqueueSend("m2")

        val report = drainer { SendResult.Success }.drainLane(lane)

        assertThat(report.delivered).isEqualTo(2)
        assertThat(outbox.observeAll().first()).isEmpty()
    }

    @Test
    fun `drainLane stops the lane on a transient failure to preserve FIFO`() = runTest {
        enqueueSend("m1")
        enqueueSend("m2")
        var calls = 0

        val report = drainer { calls++; SendResult.TransientFailure }.drainLane(lane)

        assertThat(report.stoppedOnTransientFailure).isTrue()
        assertThat(calls).isEqualTo(1)
        assertThat(outbox.observeAll().first().map { it.cmid }).containsExactly("m1", "m2")
    }

    @Test
    fun `drainLane exhausts a permanently-failed row and continues`() = runTest {
        enqueueSend("m1")
        enqueueSend("m2")

        val report = drainer { row ->
            if (row.cmid == "m1") SendResult.PermanentFailure("rejected") else SendResult.Success
        }.drainLane(lane)

        assertThat(report.exhausted).isEqualTo(1)
        assertThat(report.delivered).isEqualTo(1)
        assertThat(outbox.observeAll().first().single().cmid).isEqualTo("m1")
        assertThat(outbox.observeAll().first().single().stateEnum).isEqualTo(OutboxState.EXHAUSTED)
    }

    @Test
    fun `drainLane exhausts a row whose kind has no sender`() = runTest {
        enqueueSend("m1")

        val report = OutboxDrainer(outbox, emptyMap()).drainLane(lane)

        assertThat(report.exhausted).isEqualTo(1)
        assertThat(outbox.observeAll().first().single().stateEnum).isEqualTo(OutboxState.EXHAUSTED)
    }

    @Test
    fun `drainLane reports every exhausted row through onExhausted`() = runTest {
        enqueueSend("m1")
        enqueueSend("m2")
        val exhaustedCmids = mutableListOf<String>()

        OutboxDrainer(
            outbox,
            mapOf(
                OutboxKind.SEND_MESSAGE to MutationSender { row ->
                    if (row.cmid == "m1") SendResult.PermanentFailure("rejected") else SendResult.Success
                },
            ),
            onExhausted = { exhaustedCmids += it.cmid },
        ).drainLane(lane)

        assertThat(exhaustedCmids).containsExactly("m1")
    }

    @Test
    fun `drainLane holds a dependent while its prerequisite is still pending`() = runTest {
        val media = OutboxLanes.MEDIA
        val story = OutboxLanes.STORY
        enqueueOn("upload", media)
        enqueueOn("publish", story, dependsOn = setOf("upload"))
        var calls = 0

        val report = drainer { calls++; SendResult.Success }.drainLane(story)

        assertThat(report.stoppedOnBlockedDependency).isTrue()
        assertThat(report.stoppedOnTransientFailure).isFalse()
        assertThat(report.delivered).isEqualTo(0)
        assertThat(calls).isEqualTo(0)
        assertThat(outbox.stateOf("publish")).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `drainLane holds a dependent while its prerequisite is inflight`() = runTest {
        val media = OutboxLanes.MEDIA
        val story = OutboxLanes.STORY
        enqueueOn("upload", media)
        outbox.markInflight("upload")
        enqueueOn("publish", story, dependsOn = setOf("upload"))

        val report = drainer { SendResult.Success }.drainLane(story)

        assertThat(report.stoppedOnBlockedDependency).isTrue()
        assertThat(outbox.stateOf("publish")).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `drainLane delivers a dependent once its prerequisite has succeeded`() = runTest {
        val media = OutboxLanes.MEDIA
        val story = OutboxLanes.STORY
        enqueueOn("upload", media)
        outbox.markSucceeded("upload")
        enqueueOn("publish", story, dependsOn = setOf("upload"))

        val report = drainer { SendResult.Success }.drainLane(story)

        assertThat(report.stoppedOnBlockedDependency).isFalse()
        assertThat(report.delivered).isEqualTo(1)
        assertThat(outbox.stateOf("publish")).isNull()
    }

    @Test
    fun `drainLane cascade-exhausts a dependent whose prerequisite exhausted`() = runTest {
        val media = OutboxLanes.MEDIA
        val story = OutboxLanes.STORY
        enqueueOn("upload", media)
        outbox.markExhausted("upload", "upload failed")
        enqueueOn("publish", story, dependsOn = setOf("upload"))
        val exhaustedCmids = mutableListOf<String>()

        val report = OutboxDrainer(
            outbox,
            mapOf(OutboxKind.SEND_MESSAGE to MutationSender { SendResult.Success }),
            onExhausted = { exhaustedCmids += it.cmid },
        ).drainLane(story)

        assertThat(report.exhausted).isEqualTo(1)
        assertThat(report.delivered).isEqualTo(0)
        assertThat(exhaustedCmids).containsExactly("publish")
        assertThat(outbox.stateOf("publish")).isEqualTo(OutboxState.EXHAUSTED)
    }

    @Test
    fun `drainLane delivers a dependent whose prerequisite never existed`() = runTest {
        val story = OutboxLanes.STORY
        enqueueOn("publish", story, dependsOn = setOf("never-enqueued"))

        val report = drainer { SendResult.Success }.drainLane(story)

        assertThat(report.delivered).isEqualTo(1)
        assertThat(outbox.stateOf("publish")).isNull()
    }

    private suspend fun enqueuePublish(
        cmid: String,
        rowLane: String,
        dependsOn: Set<String>,
        mediaIds: List<String>,
    ) {
        outbox.enqueue(
            OutboxMutation(
                OutboxKind.PUBLISH_STORY,
                rowLane,
                targetId = cmid,
                payload = MeeshyApi.json.encodeToString(CreateStoryRequest(content = "hi", mediaIds = mediaIds)),
                dependsOn = dependsOn,
                cmid = cmid,
            ),
        )
    }

    private suspend fun mediaIdsOfPublish(cmid: String): List<String>? =
        outbox.deliverable(OutboxLanes.STORY).single { it.cmid == cmid }
            .let { MeeshyApi.json.decodeFromString<CreateStoryRequest>(it.payload).mediaIds }

    private fun graftingDrainer(sender: MutationSender) =
        OutboxDrainer(
            outbox,
            mapOf(OutboxKind.SEND_MESSAGE to sender, OutboxKind.PUBLISH_STORY to sender),
            graftProducedId = PublishMediaWriteBack::graft,
        )

    @Test
    fun `drainLane grafts a produced id into a waiting dependent publish`() = runTest {
        enqueueOn("upload", OutboxLanes.MEDIA)
        enqueuePublish("publish", OutboxLanes.STORY, dependsOn = setOf("upload"), mediaIds = listOf("upload"))

        val report = graftingDrainer { row ->
            if (row.cmid == "upload") SendResult.SuccessWithId("real-77") else SendResult.Success
        }.drainLane(OutboxLanes.MEDIA)

        assertThat(report.delivered).isEqualTo(1)
        assertThat(outbox.stateOf("upload")).isNull()
        assertThat(mediaIdsOfPublish("publish")).containsExactly("real-77")
    }

    @Test
    fun `SuccessWithId counts as a delivery and removes the row`() = runTest {
        enqueueOn("upload", OutboxLanes.MEDIA)

        val report = graftingDrainer { SendResult.SuccessWithId("real-77") }.drainLane(OutboxLanes.MEDIA)

        assertThat(report.delivered).isEqualTo(1)
        assertThat(outbox.observeAll().first()).isEmpty()
    }

    @Test
    fun `a plain Success leaves a dependent placeholder untouched`() = runTest {
        enqueueOn("upload", OutboxLanes.MEDIA)
        enqueuePublish("publish", OutboxLanes.STORY, dependsOn = setOf("upload"), mediaIds = listOf("upload"))

        graftingDrainer { SendResult.Success }.drainLane(OutboxLanes.MEDIA)

        assertThat(mediaIdsOfPublish("publish")).containsExactly("upload")
    }

    @Test
    fun `drainLane holds a multi-dependency publish until every prerequisite lands`() = runTest {
        enqueueOn("u1", OutboxLanes.MEDIA)
        enqueueOn("u2", OutboxLanes.MEDIA)
        outbox.markSucceeded("u1")
        enqueueOn("publish", OutboxLanes.STORY, dependsOn = setOf("u1", "u2"))

        val report = drainer { SendResult.Success }.drainLane(OutboxLanes.STORY)

        assertThat(report.stoppedOnBlockedDependency).isTrue()
        assertThat(report.delivered).isEqualTo(0)
        assertThat(outbox.stateOf("publish")).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `drainLane delivers a multi-dependency publish once every prerequisite has succeeded`() = runTest {
        enqueueOn("u1", OutboxLanes.MEDIA)
        enqueueOn("u2", OutboxLanes.MEDIA)
        outbox.markSucceeded("u1")
        outbox.markSucceeded("u2")
        enqueueOn("publish", OutboxLanes.STORY, dependsOn = setOf("u1", "u2"))

        val report = drainer { SendResult.Success }.drainLane(OutboxLanes.STORY)

        assertThat(report.delivered).isEqualTo(1)
        assertThat(outbox.stateOf("publish")).isNull()
    }

    @Test
    fun `drainLane cascade-exhausts a multi-dependency publish when any prerequisite exhausted`() = runTest {
        enqueueOn("u1", OutboxLanes.MEDIA)
        enqueueOn("u2", OutboxLanes.MEDIA)
        outbox.markExhausted("u1", "upload failed")
        enqueueOn("publish", OutboxLanes.STORY, dependsOn = setOf("u1", "u2"))
        val exhaustedCmids = mutableListOf<String>()

        val report = OutboxDrainer(
            outbox,
            mapOf(OutboxKind.SEND_MESSAGE to MutationSender { SendResult.Success }),
            onExhausted = { exhaustedCmids += it.cmid },
        ).drainLane(OutboxLanes.STORY)

        assertThat(report.exhausted).isEqualTo(1)
        assertThat(report.delivered).isEqualTo(0)
        assertThat(exhaustedCmids).containsExactly("publish")
        assertThat(outbox.stateOf("publish")).isEqualTo(OutboxState.EXHAUSTED)
    }

    @Test
    fun `drainLane grafts each producer id into a publish waiting on several uploads`() = runTest {
        enqueueOn("u1", OutboxLanes.MEDIA)
        enqueueOn("u2", OutboxLanes.MEDIA)
        enqueuePublish(
            "publish",
            OutboxLanes.STORY,
            dependsOn = setOf("u1", "u2"),
            mediaIds = listOf("u1", "u2"),
        )

        graftingDrainer { row ->
            when (row.cmid) {
                "u1" -> SendResult.SuccessWithId("real-1")
                "u2" -> SendResult.SuccessWithId("real-2")
                else -> SendResult.Success
            }
        }.drainLane(OutboxLanes.MEDIA)

        assertThat(mediaIdsOfPublish("publish")).containsExactly("real-1", "real-2").inOrder()
    }

    @Test
    fun `drainLane fires onExhausted when transient retries run out`() = runTest {
        enqueueSend("m1")
        repeat(OutboxRepository.MAX_ATTEMPTS - 1) { outbox.markFailed("m1") }
        val exhaustedCmids = mutableListOf<String>()

        OutboxDrainer(
            outbox,
            mapOf(OutboxKind.SEND_MESSAGE to MutationSender { SendResult.TransientFailure }),
            onExhausted = { exhaustedCmids += it.cmid },
        ).drainLane(lane)

        assertThat(exhaustedCmids).containsExactly("m1")
        assertThat(outbox.observeAll().first().single().stateEnum).isEqualTo(OutboxState.EXHAUSTED)
    }
}
