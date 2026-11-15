package me.meeshy.sdk.composer

import me.meeshy.sdk.model.AttachmentPlacement
import me.meeshy.sdk.model.composer.PendingAttachment
import me.meeshy.sdk.model.composer.PendingAttachmentPhase
import me.meeshy.sdk.model.composer.PendingAttachmentsState
import me.meeshy.sdk.model.media.PreparationStage
import me.meeshy.sdk.model.media.PreparingAttachment

/** L'état d'une pièce vu de la zone : en préparation, prête, ou échouée. */
enum class TrackedState { PREPARING, READY, FAILED }

/**
 * **Site UNIQUE du suivi d'une préparation** (chat et compositeur de fil) — miroir de `PreparationTracking`
 * iOS : la provenance (`capturedInApp`) n'est connue qu'ici, au moment où la prise rejoint le message, et
 * la place se réserve à la sélection.
 */
object PreparationTracker {

    fun stateOf(item: PreparingAttachment): TrackedState = when (item.stage) {
        PreparationStage.Ready -> TrackedState.READY
        is PreparationStage.Failed -> TrackedState.FAILED
        else -> TrackedState.PREPARING
    }

    /** Ce qui précède une nouvelle sélection : tout ce qui est déjà dans la zone, prêt ou en préparation. */
    fun selectedBefore(zone: List<PendingAttachment>, preparing: List<PreparingAttachment>): Set<String> =
        zone.map { it.id }.toSet() + preparing.map { it.id }

    /** La pièce prête telle qu'elle rejoint la zone : une capture le DIT, la galerie non. */
    fun promoted(ready: PendingAttachment, capturedInApp: Boolean): PendingAttachment =
        ready.copy(phase = PendingAttachmentPhase.Ready, capturedInApp = capturedInApp || ready.capturedInApp)

    fun place(state: PendingAttachmentsState, ready: PendingAttachment, selectedBefore: Set<String>): PendingAttachmentsState =
        state.copy(items = AttachmentPlacement.place(state.items.filterNot { it.id == ready.id }, ready, selectedBefore) { it.id })
}
