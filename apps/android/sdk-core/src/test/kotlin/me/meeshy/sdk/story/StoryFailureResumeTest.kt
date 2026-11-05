package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class StoryFailureResumeTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true }
    private val discarded = mutableListOf<String>()

    private class Media(private val broken: Set<String> = emptySet(), private val gate: CompletableDeferred<Unit>? = null) :
        LegacyDraftMediaSource {
        override suspend fun copy(mediaId: String, directory: File): File? {
            gate?.await()
            if (mediaId in broken) throw IOException("illisible")
            if (!mediaId.startsWith("cmid_")) return null
            return File(directory, "$mediaId.jpg").apply { writeText("octets") }
        }
    }

    private fun failed(vararg media: String) =
        StoryFailedRequest("bonjour", media.toList(), "FRIENDS", emptyList(), null)

    private fun resume(
        request: StoryFailedRequest? = failed("cmid_a", "srv_b"),
        media: LegacyDraftMediaSource = Media(),
        store: StoryDraftStoring = StoryDraftDiskStore(tmp.newFolder(), tmp.newFolder(), json),
    ) = store to StoryFailureResume(
        store = store,
        media = media,
        staging = tmp.newFolder(),
        readFailed = { request },
        discardFailed = { discarded += it },
        newId = { "draft-1" },
    )

    @Test
    fun `l'echec devient un brouillon relu identique puis la ligne est retiree`() = runTest {
        val (store, resume) = resume()
        val outcome = resume.resume("cmid_row")
        assertThat(outcome).isEqualTo(StoryResumeOutcome.Resumed("draft-1"))
        assertThat(store.peek("draft-1")!!.slides.single().text).isEqualTo("bonjour")
        assertThat(store.mediaNames("draft-1")).containsExactly("cmid_a.jpg")
        assertThat(discarded).containsExactly("cmid_row")
    }

    @Test
    fun `un echec de copie laisse la ligne d'outbox intacte et aucun brouillon`() = runTest {
        val (store, resume) = resume(media = Media(broken = setOf("cmid_a")))
        assertThat(resume.resume("cmid_row")).isEqualTo(StoryResumeOutcome.CopyFailed)
        assertThat(discarded).isEmpty()
        assertThat(store.listDrafts()).isEmpty()
    }

    @Test
    fun `une ligne disparue ou vide ne change rien`() = runTest {
        assertThat(resume(request = null).second.resume("x")).isEqualTo(StoryResumeOutcome.NothingToResume)
        val empty = StoryFailedRequest(null, emptyList(), "PUBLIC", emptyList(), null)
        assertThat(resume(request = empty).second.resume("x")).isEqualTo(StoryResumeOutcome.NothingToResume)
        assertThat(discarded).isEmpty()
    }

    @Test
    fun `un seul reprendre a la fois`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val (_, resume) = resume(media = Media(gate = gate))
        val first = async { resume.resume("cmid_row") }
        testScheduler.runCurrent()
        assertThat(resume.resume("cmid_row")).isEqualTo(StoryResumeOutcome.Busy)
        gate.complete(Unit)
        assertThat(first.await()).isEqualTo(StoryResumeOutcome.Resumed("draft-1"))
        assertThat(discarded).hasSize(1)
    }
}
