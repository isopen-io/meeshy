package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.PendingAttachmentType
import org.junit.Test

class PreparingAttachmentReducerTest {
    private fun item() = PreparingAttachment("a", PendingAttachmentType.VIDEO)

    @Test fun `les etapes avancent dans l'ordre jusqu'a prete`() {
        val stages = listOf(PreparationStage.Compressing, PreparationStage.Thumbnailing, PreparationStage.Hashing, PreparationStage.Ready)
        val seen = stages.runningFold(item()) { acc, s -> PreparingAttachmentReducer.advance(acc, s) }.map { it.stage }
        assertThat(seen).containsExactly(PreparationStage.Loading, *stages.toTypedArray()).inOrder()
    }

    @Test fun `une etape ne recule jamais`() {
        val at = PreparingAttachmentReducer.advance(item(), PreparationStage.Hashing)
        assertThat(PreparingAttachmentReducer.advance(at, PreparationStage.Compressing).stage).isEqualTo(PreparationStage.Hashing)
    }

    @Test fun `l'echec est terminal et porte son message`() {
        val failed = PreparingAttachmentReducer.fail(item(), "Image illisible")
        assertThat(failed.stage).isEqualTo(PreparationStage.Failed("Image illisible"))
        assertThat(failed.isPreparing).isFalse()
        assertThat(PreparingAttachmentReducer.advance(failed, PreparationStage.Ready)).isEqualTo(failed)
    }

    @Test fun `l'annulation est terminale et une pliee prete ne s'annule plus`() {
        assertThat(PreparingAttachmentReducer.cancel(item()).stage).isEqualTo(PreparationStage.Cancelled)
        val ready = PreparingAttachmentReducer.advance(item(), PreparationStage.Ready)
        assertThat(PreparingAttachmentReducer.cancel(ready).stage).isEqualTo(PreparationStage.Ready)
    }

    @Test fun `reessayer repart de chargement et efface ce qui avait ete appris`() {
        val failed = PreparingAttachmentReducer.fail(
            PreparingAttachmentReducer.withMedia(item()) { it.copy(thumbnailPath = "/t.jpg") }, "x",
        )
        val retried = PreparingAttachmentReducer.retry(failed)
        assertThat(retried.stage).isEqualTo(PreparationStage.Loading)
        assertThat(retried.hasThumbnail).isFalse()
    }

    @Test fun `le libelle suit l'etape`() {
        assertThat(PreparationStage.Thumbnailing.label()).isEqualTo(PreparationStageLabel.PREVIEW)
        assertThat(PreparationStage.Ready.label()).isNull()
    }
}
