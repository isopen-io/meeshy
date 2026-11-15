package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.StoryVisibility
import org.junit.Test

class DocumentSendCoordinatorTest {
    private class Sink(private val failure: Exception? = null) : DocumentDurableSink {
        val intents = mutableListOf<PublishIntent>()
        override suspend fun enqueue(intent: PublishIntent): String {
            failure?.let { throw it }
            intents += intent
            return "cmid-${intents.size}"
        }
    }

    private fun draft(
        text: String? = "bonjour",
        format: ComposerFormat = ComposerFormat.POST,
        repostOfId: String? = null,
        media: List<ComposerDocumentMedia> = emptyList(),
    ) = ComposerDocumentDraft(format, text, StoryVisibility.PUBLIC, null, repostOfId, media)

    private fun send(sink: Sink, draft: ComposerDocumentDraft, door: DocumentDoor, carried: CarriedSceneAssets = CarriedSceneAssets.EMPTY) =
        runBlocking { DocumentSendCoordinator(sink).send(draft, door, carried) }

    @Test
    fun `from the feed the queued row is handed back to the feed`() {
        val queued = mutableListOf<String>()
        val sink = Sink()
        val outcome = send(sink, draft(), DocumentDoor.Feed { queued += it })
        assertThat(outcome).isEqualTo(DocumentSendOutcome.Accepted("cmid-1"))
        assertThat(queued).containsExactly("cmid-1")
    }

    @Test
    fun `from a door without a feed only the durable send is queued, with no error`() {
        val sink = Sink()
        val outcome = send(sink, draft(), DocumentDoor.Wireless)
        assertThat(outcome).isInstanceOf(DocumentSendOutcome.Accepted::class.java)
        assertThat(sink.intents).hasSize(1)
        assertThat(sink.intents.single().content).isEqualTo("bonjour")
    }

    @Test
    fun `a refusal of the plan is said in clear, nothing is queued`() {
        val sink = Sink()
        val blank = send(sink, draft(text = " "), DocumentDoor.Wireless) as DocumentSendOutcome.Refused
        val quote = send(sink, draft(repostOfId = "p1"), DocumentDoor.Wireless) as DocumentSendOutcome.Refused
        val story = send(sink, draft(format = ComposerFormat.STORY), DocumentDoor.Wireless) as DocumentSendOutcome.Refused
        assertThat(blank.refusal).isEqualTo(ComposerDocumentSendRefusal.EmptyDraft)
        assertThat(quote.refusal).isEqualTo(ComposerDocumentSendRefusal.NonDurablePath(ComposerDocumentSendPath.QUOTED_REPOST))
        assertThat(story.copyKey).isEqualTo(DocumentRefusalCopy.FORMAT_UNSUPPORTED)
        assertThat(blank.copyKey).isEqualTo(DocumentRefusalCopy.PUBLISH_ERROR)
        assertThat(sink.intents).isEmpty()
    }

    @Test
    fun `a sink that fails refuses with its message and never calls the feed`() {
        val queued = mutableListOf<String>()
        val rejected = send(Sink(IllegalStateException("file pleine")), draft(), DocumentDoor.Feed { queued += it })
        val silent = send(Sink(IllegalStateException()), draft(), DocumentDoor.Wireless)
        assertThat(rejected).isEqualTo(DocumentSendOutcome.Refused(ComposerDocumentSendRefusal.PublisherRejected("file pleine")))
        assertThat(silent).isEqualTo(DocumentSendOutcome.Refused(ComposerDocumentSendRefusal.PublisherSilent))
        assertThat(queued).isEmpty()
    }

    @Test
    fun `a sound carried alone is matter and leaves with its bridge to the scene object`() {
        val sink = Sink()
        val carried = CarriedSceneAssets(
            listOf(ComposerDocumentMedia("/data/a.m4a", "audio/mp4")),
            mapOf("/data/a.m4a" to "s1"),
        )
        val outcome = send(sink, draft(text = null), DocumentDoor.Wireless, carried)
        assertThat(outcome).isInstanceOf(DocumentSendOutcome.Accepted::class.java)
        val intent = sink.intents.single()
        assertThat(intent.localMediaPaths).containsExactly("/data/a.m4a")
        assertThat(intent.mediaObjectIds).containsExactly("s1")
    }
}
