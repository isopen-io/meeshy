package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.composer.PendingAttachmentType

/**
 * Les étapes d'une pièce qui passe de la sélection brute à « prête à partir » — miroir de
 * `AttachmentPreparationStage` iOS. L'ordre est celui du déroulement : une étape n'avance jamais en arrière.
 */
sealed interface PreparationStage {
    data object Loading : PreparationStage
    data object Compressing : PreparationStage
    data object Thumbnailing : PreparationStage
    data object Hashing : PreparationStage
    data object Ready : PreparationStage
    data class Failed(val message: String) : PreparationStage
    data object Cancelled : PreparationStage

    /** Terminale : plus rien ne la fait avancer. */
    val isTerminal: Boolean get() = this is Ready || this is Failed || this is Cancelled

    /** Rang dans le déroulement nominal ; les états terminaux dépassent toutes les étapes. */
    val rank: Int
        get() = when (this) {
            Loading -> 0
            Compressing -> 1
            Thumbnailing -> 2
            Hashing -> 3
            Ready, is Failed, Cancelled -> 4
        }
}

/** Ce que la préparation a appris de la pièce, rempli au fil des étapes. */
data class PreparedMedia(
    val thumbnailPath: String? = null,
    val thumbHash: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    val durationMs: Long? = null,
    val sizeBytes: Long = 0L,
)

/** La poignée immuable d'une préparation en vol : un instantané que l'écran projette. */
data class PreparingAttachment(
    val id: String,
    val type: PendingAttachmentType,
    val stage: PreparationStage = PreparationStage.Loading,
    val accentHex: String? = null,
    val capturedInApp: Boolean = false,
    val prepared: PreparedMedia = PreparedMedia(),
) {
    val isPreparing: Boolean get() = !stage.isTerminal
    val hasThumbnail: Boolean get() = prepared.thumbnailPath != null
}

/** Réducteur pur des étapes : monotone, un état terminal est définitif. */
object PreparingAttachmentReducer {

    fun advance(item: PreparingAttachment, next: PreparationStage): PreparingAttachment {
        if (item.stage.isTerminal) return item
        if (next !is PreparationStage.Failed && next != PreparationStage.Cancelled && next.rank < item.stage.rank) return item
        return item.copy(stage = next)
    }

    fun fail(item: PreparingAttachment, message: String): PreparingAttachment =
        advance(item, PreparationStage.Failed(message))

    fun cancel(item: PreparingAttachment): PreparingAttachment = advance(item, PreparationStage.Cancelled)

    fun withMedia(item: PreparingAttachment, update: (PreparedMedia) -> PreparedMedia): PreparingAttachment =
        if (item.stage.isTerminal) item else item.copy(prepared = update(item.prepared))

    /** Une pièce en échec repart de zéro : l'étape, pas ce qu'elle avait appris. */
    fun retry(item: PreparingAttachment): PreparingAttachment =
        if (item.stage is PreparationStage.Failed) item.copy(stage = PreparationStage.Loading, prepared = PreparedMedia()) else item
}

/** Libellé de l'étape en cours, `null` hors préparation. Les textes viennent des ressources. */
enum class PreparationStageLabel { LOADING, COMPRESSING, PREVIEW, FINGERPRINT }

fun PreparationStage.label(): PreparationStageLabel? = when (this) {
    PreparationStage.Loading -> PreparationStageLabel.LOADING
    PreparationStage.Compressing -> PreparationStageLabel.COMPRESSING
    PreparationStage.Thumbnailing -> PreparationStageLabel.PREVIEW
    PreparationStage.Hashing -> PreparationStageLabel.FINGERPRINT
    else -> null
}
