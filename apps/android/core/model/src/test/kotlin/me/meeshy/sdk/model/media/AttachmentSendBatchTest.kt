package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AttachmentSendBatchTest {
    private fun piece(id: String, mime: String) = PlannableAttachment(id, mime)

    private fun counter(): () -> String {
        var n = 0
        return { "cid_${++n}" }
    }

    @Test
    fun `images et videos partent ensemble, l'audio a part, dans l'ordre de premiere apparition`() {
        val plan = AttachmentSendPlanner.plan(
            listOf(piece("a1", "audio/mp4"), piece("i1", "image/jpeg"), piece("v1", "video/mp4"), piece("d1", "application/pdf"), piece("a2", "audio/mp4")),
            text = "", hasReply = false,
        )

        assertThat(plan.map { it.kind }).containsExactly(AttachmentGroupKind.AUDIO, AttachmentGroupKind.VISUAL).inOrder()
        assertThat(plan[0].attachmentIds).containsExactly("a1", "a2").inOrder()
        assertThat(plan[1].attachmentIds).containsExactly("i1", "v1", "d1").inOrder()
    }

    @Test
    fun `le texte legende le groupe visuel`() {
        val plan = AttachmentSendPlanner.plan(listOf(piece("i1", "image/png")), text = "  salut  ", hasReply = false)

        assertThat(plan).hasSize(1)
        assertThat(plan.single().text).isEqualTo("salut")
    }

    @Test
    fun `sans groupe visuel le texte part en dernier dans son propre message`() {
        val plan = AttachmentSendPlanner.plan(listOf(piece("a1", "audio/mp4")), text = "écoute", hasReply = false)

        assertThat(plan.map { it.kind }).containsExactly(AttachmentGroupKind.AUDIO, AttachmentGroupKind.TEXT).inOrder()
        assertThat(plan.last().text).isEqualTo("écoute")
    }

    @Test
    fun `la citation ne voyage que sur le premier message du plan`() {
        val plan = AttachmentSendPlanner.plan(listOf(piece("a1", "audio/mp4"), piece("i1", "image/png")), text = "x", hasReply = true)

        assertThat(plan.map { it.carriesReply }).containsExactly(true, false).inOrder()
    }

    @Test
    fun `un lieu sans texte part seul sous sa propre bulle`() {
        val batch = AttachmentSendBatch.of(emptyList(), text = "", hasReply = false, hasPlace = true, newTempId = counter())

        assertThat(batch.mediaGroups).isEmpty()
        assertThat(batch.hasTrailing).isTrue()
        assertThat(batch.textTempId).isEqualTo("cid_1")
    }

    @Test
    fun `chaque groupe media recoit sa bulle puis le texte la sienne`() {
        val batch = AttachmentSendBatch.of(
            listOf(piece("a1", "audio/mp4")), text = "écoute", hasReply = false, hasPlace = false, newTempId = counter(),
        )

        assertThat(batch.mediaGroups.map { it.tempId }).containsExactly("cid_1")
        assertThat(batch.textTempId).isEqualTo("cid_2")
        assertThat(batch.textGroup?.text).isEqualTo("écoute")
    }

    @Test
    fun `une legende portee par le groupe visuel ne cree pas de bulle texte`() {
        val batch = AttachmentSendBatch.of(
            listOf(piece("i1", "image/png")), text = "légende", hasReply = false, hasPlace = false, newTempId = counter(),
        )

        assertThat(batch.textGroup).isNull()
        assertThat(batch.textTempId).isNull()
        assertThat(batch.hasTrailing).isFalse()
    }

    @Test
    fun `une piece dont le fichier a disparu sort des deux phases`() {
        val batch = AttachmentSendBatch.of(
            listOf(piece("a1", "audio/mp4"), piece("i1", "image/png")),
            text = "", hasReply = false, hasPlace = false, availableIds = setOf("i1"), newTempId = counter(),
        )

        assertThat(batch.mediaGroups.map { it.group.attachmentIds }).containsExactly(listOf("i1"))
        assertThat(batch.cleanupIds().audio).isEmpty()
        assertThat(batch.cleanupIds().visual).containsExactly("i1")
    }

    @Test
    fun `les vocaux se nettoient apres leur delai, les visuels tout de suite`() {
        val batch = AttachmentSendBatch.of(
            listOf(piece("a1", "audio/mp4"), piece("i1", "image/png")), text = "", hasReply = false, hasPlace = false, newTempId = counter(),
        )

        assertThat(batch.cleanupIds().audio).containsExactly("a1")
        assertThat(batch.cleanupIds().visual).containsExactly("i1")
        assertThat(AttachmentSendBatch.VOICE_RETENTION_MS).isEqualTo(10_000L)
    }
}
