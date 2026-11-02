package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.core.crypto.primitives.StreamingSeal
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.SealedDocumentStore
import me.meeshy.sdk.model.call.CallNetworkEvent
import me.meeshy.sdk.model.call.CallNetworkEventKind
import me.meeshy.sdk.model.call.CallTranscriptPage
import me.meeshy.sdk.model.call.PersistedTranscriptSegment
import org.junit.Test

/**
 * What a call leaves on THIS device, encrypted at rest (#13676, #13677): the copy of its transcript, readable offline
 * and deletable, and its network journal — both per account, both purged with it.
 */
class CallLocalRecordsTest {

    private val seal = StreamingSeal.ephemeral()
    private var owner: String? = "alice"

    private fun documents(directory: File, policy: CachePolicy) = SealedDocumentStore(directory, "test.v1", policy, { seal })

    private val transcriptDir: File = Files.createTempDirectory("call-transcripts").toFile()
    private val journalDir: File = Files.createTempDirectory("call-journals").toFile()

    private val transcripts = CallTranscriptCache(documents(transcriptDir, CachePolicy.CallTranscripts), { owner }, Dispatchers.Unconfined)
    private val journals = CallNetworkJournalStore(documents(journalDir, CachePolicy.CallNetworkJournals), { owner }, Dispatchers.Unconfined)

    private val page = CallTranscriptPage(
        callId = "call-1",
        conversationId = "conv-1",
        segments = listOf(PersistedTranscriptSegment(id = "s1", speakerId = "u2", text = "bonjour", language = "fr", capturedAtMs = 1L)),
    )

    @Test
    fun `a stored transcript is read back offline`() = runTest {
        transcripts.store("call-1", page)

        assertThat(transcripts.cached("call-1")).isEqualTo(CachedCallTranscript.Copy(page))
        assertThat(transcripts.cached("call-2")).isEqualTo(CachedCallTranscript.None)
    }

    @Test
    fun `a transcript deleted by the reader stays deleted, a later replay does not bring it back`() = runTest {
        transcripts.store("call-1", page)

        transcripts.dismiss("call-1")
        transcripts.store("call-1", page)

        assertThat(transcripts.cached("call-1")).isEqualTo(CachedCallTranscript.Dismissed)
    }

    @Test
    fun `a dropped copy is gone`() = runTest {
        transcripts.store("call-1", page)

        transcripts.drop("call-1")

        assertThat(transcripts.cached("call-1")).isEqualTo(CachedCallTranscript.None)
    }

    @Test
    fun `another account never reads the copy, and the account boundary purges it`() = runTest {
        transcripts.store("call-1", page)

        owner = "bob"
        assertThat(transcripts.cached("call-1")).isEqualTo(CachedCallTranscript.None)

        owner = "alice"
        transcripts.clear()
        assertThat(transcripts.cached("call-1")).isEqualTo(CachedCallTranscript.None)
    }

    @Test
    fun `the journal accumulates the events of a call and survives a new store`() = runTest {
        journals.append(listOf(CallNetworkEvent(10L, CallNetworkEventKind.Link("connected"))), "call-1", startedAtMs = 5L)
        journals.append(listOf(CallNetworkEvent(20L, CallNetworkEventKind.Reconnected)), "call-1", startedAtMs = 5L)

        val reopened = CallNetworkJournalStore(documents(journalDir, CachePolicy.CallNetworkJournals), { owner }, Dispatchers.Unconfined)
        val journal = reopened.journal("call-1")

        assertThat(journal?.startedAtMs).isEqualTo(5L)
        assertThat(journal?.events?.map { it.kind }).containsExactly(
            CallNetworkEventKind.Link("connected"),
            CallNetworkEventKind.Reconnected,
        ).inOrder()
    }

    @Test
    fun `a rejoin merges into the persisted journal of the same call`() = runTest {
        journals.append(listOf(CallNetworkEvent(10L, CallNetworkEventKind.Link("connected"))), "call-1", startedAtMs = 5L)
        val afterRestart = CallNetworkJournalStore(documents(journalDir, CachePolicy.CallNetworkJournals), { owner }, Dispatchers.Unconfined)

        afterRestart.append(listOf(CallNetworkEvent(30L, CallNetworkEventKind.Reconnected)), "call-1", startedAtMs = 25L)

        val journal = afterRestart.journal("call-1")
        assertThat(journal?.startedAtMs).isEqualTo(5L)
        assertThat(journal?.events?.map { it.atMs }).containsExactly(10L, 30L).inOrder()
    }

    @Test
    fun `the account boundary purges the journals`() = runTest {
        journals.append(listOf(CallNetworkEvent(10L, CallNetworkEventKind.Reconnected)), "call-1", startedAtMs = 5L)

        journals.clear()

        assertThat(journals.journal("call-1")).isNull()
    }
}
