package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.media.PreparationStage
import me.meeshy.sdk.model.media.PreparedMedia
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AttachmentPreparationServiceTest {
    private fun TestScope.service() = AttachmentPreparationService(TestScope(UnconfinedTestDispatcher(testScheduler)))

    private val steps = PreparationPipeline { progress ->
        listOf(PreparationStage.Compressing, PreparationStage.Thumbnailing, PreparationStage.Hashing).forEach(progress::enter)
        PreparedMedia(thumbnailPath = "/t.jpg", thumbHash = "h")
    }

    @Test fun `une piece traverse les etapes jusqu'a prete avec ce qu'elle a appris`() = runTest {
        val s = service()
        s.prepare("a", PendingAttachmentType.IMAGE, steps, capturedInApp = true)
        val outcome = s.awaitCompletion("a") as PreparationOutcome.Ready
        assertThat(outcome.attachment.stage).isEqualTo(PreparationStage.Ready)
        assertThat(outcome.attachment.prepared.thumbHash).isEqualTo("h")
        assertThat(outcome.attachment.capturedInApp).isTrue()
    }

    @Test fun `un echec porte son message et reste suivi pour reessayer`() = runTest {
        val s = service()
        s.prepare("a", PendingAttachmentType.IMAGE, { throw AttachmentPreparationException("Image illisible") })
        assertThat(s.awaitCompletion("a")).isEqualTo(PreparationOutcome.Failed("Image illisible"))
        assertThat(s.items.value.single().stage).isEqualTo(PreparationStage.Failed("Image illisible"))
    }

    @Test fun `reessayer relance la preparation d'une piece en echec`() = runTest {
        val s = service()
        var attempts = 0
        s.prepare("a", PendingAttachmentType.IMAGE, {
            if (attempts++ == 0) throw AttachmentPreparationException("boom")
            PreparedMedia()
        })
        s.awaitCompletion("a")
        s.retry("a")
        assertThat(s.awaitCompletion("a")).isInstanceOf(PreparationOutcome.Ready::class.java)
    }

    @Test fun `annuler arrete la preparation et libere les attentes`() = runTest {
        val s = service()
        val gate = CompletableDeferred<Unit>()
        s.prepare("a", PendingAttachmentType.VIDEO, { gate.await(); PreparedMedia() })
        s.cancel("a")
        assertThat(s.awaitCompletion("a")).isEqualTo(PreparationOutcome.Cancelled)
        assertThat(s.items.value.single().stage).isEqualTo(PreparationStage.Cancelled)
    }

    @Test fun `un vocal de moins de 500 ms est refuse`() = runTest {
        val s = service()
        assertThat(s.admitsVoice(499)).isFalse()
        assertThat(s.admitsVoice(500)).isTrue()
    }

    @Test fun `les pieces gardent leur ordre d'arrivee`() = runTest {
        val s = service()
        s.prepare("1", PendingAttachmentType.IMAGE, CompletableDeferredPipeline())
        s.prepare("2", PendingAttachmentType.IMAGE, steps)
        assertThat(s.items.value.map { it.id }).containsExactly("1", "2").inOrder()
    }

    private class CompletableDeferredPipeline : PreparationPipeline {
        override suspend fun run(progress: PreparationProgress): PreparedMedia {
            CompletableDeferred<Unit>().await()
            return PreparedMedia()
        }
    }
}
