package me.meeshy.sdk.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.PendingAttachment
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.composer.PendingAttachmentsState
import me.meeshy.sdk.model.media.PreparationStage
import me.meeshy.sdk.model.media.PreparingAttachment
import org.junit.Test

class PreparationTrackerTest {
    private fun pending(id: String) = PendingAttachment(id, PendingAttachmentType.IMAGE, "$id.jpg")
    private fun preparing(id: String, stage: PreparationStage = PreparationStage.Loading) =
        PreparingAttachment(id, PendingAttachmentType.IMAGE, stage)

    @Test fun `les etats se lisent depuis l'etape`() {
        assertThat(PreparationTracker.stateOf(preparing("a"))).isEqualTo(TrackedState.PREPARING)
        assertThat(PreparationTracker.stateOf(preparing("a", PreparationStage.Hashing))).isEqualTo(TrackedState.PREPARING)
        assertThat(PreparationTracker.stateOf(preparing("a", PreparationStage.Ready))).isEqualTo(TrackedState.READY)
        assertThat(PreparationTracker.stateOf(preparing("a", PreparationStage.Failed("x")))).isEqualTo(TrackedState.FAILED)
    }

    @Test fun `une capture de l'application le declare, la galerie non`() {
        assertThat(PreparationTracker.promoted(pending("a"), capturedInApp = true).capturedInApp).isTrue()
        assertThat(PreparationTracker.promoted(pending("a"), capturedInApp = false).capturedInApp).isFalse()
    }

    @Test fun `la promotion prend la place reservee a la selection`() {
        val state = PendingAttachmentsState(items = listOf(pending("3"), pending("2")))
        val before = PreparationTracker.selectedBefore(listOf(pending("3")), listOf(preparing("1")))
        val placed = PreparationTracker.place(state, pending("1"), before)
        assertThat(placed.items.map { it.id }).containsExactly("3", "1", "2").inOrder()
    }
}
