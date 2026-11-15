package me.meeshy.sdk.model.composer.capture

/** `FRAME` : la case du cadre choisi. `OUTSIDE` : la scène, ou le déclencheur rond sans cadre. */
enum class CaptureZone { FRAME, OUTSIDE }

/** Où part une prise ; `keptInApp` = elle ne vit QUE dans l'application. */
data class CaptureDestination(val gallery: Boolean, val keptInApp: Boolean) {
    companion object {
        val Frame = CaptureDestination(gallery = true, keptInApp = false)
        val Outside = CaptureDestination(gallery = false, keptInApp = true)
    }
}

/** Une VERSION de la prise : la paire (cadre, format). */
data class SavedVersion(val frameId: String?, val format: String)

/** D'où vient une prise ; par la zone cadre, elle a par construction un cadre. */
sealed interface CaptureOrigin {
    val zone: CaptureZone
    val frameId: String?
    val format: String

    data class Frame(override val frameId: String, override val format: String) : CaptureOrigin {
        override val zone: CaptureZone = CaptureZone.FRAME
    }

    data class Outside(override val frameId: String?, override val format: String) : CaptureOrigin {
        override val zone: CaptureZone = CaptureZone.OUTSIDE
    }
}

/** L'état d'enregistrement d'une prise en retouche : version courante et versions déjà en galerie. */
data class TakeSaveState(
    val currentFrame: String?,
    val currentFormat: String,
    val savedWith: List<SavedVersion>,
) {
    val currentVersion: SavedVersion get() = SavedVersion(currentFrame, currentFormat)
}

/**
 * La loi d'enregistrement d'une prise (#10284) — MIROIR de
 * `packages/shared/utils/capture/capture-save.ts` et de `CaptureSaveLaw.swift`.
 * Les vecteurs `capture-save.vectors.json` sont rejoués ; sur divergence, le TypeScript a raison.
 */
object CaptureSaveLaw {
    fun destination(zone: CaptureZone, savesOriginal: Boolean = false): CaptureDestination = when (zone) {
        CaptureZone.FRAME -> CaptureDestination.Frame
        CaptureZone.OUTSIDE -> if (savesOriginal) CaptureDestination.Frame else CaptureDestination.Outside
    }

    /** Juste après la prise : par le cadre, elle part déjà en galerie (optimiste). */
    fun beginTake(origin: CaptureOrigin): TakeSaveState = TakeSaveState(
        currentFrame = origin.frameId,
        currentFormat = origin.format,
        savedWith = if (origin.zone == CaptureZone.FRAME) listOf(SavedVersion(origin.frameId, origin.format)) else emptyList(),
    )

    fun saveButtonVisible(state: TakeSaveState): Boolean = state.currentVersion !in state.savedWith

    fun applySaved(state: TakeSaveState): TakeSaveState =
        if (!saveButtonVisible(state)) state else state.copy(savedWith = state.savedWith + state.currentVersion)

    /** L'écriture de [version] a échoué : CETTE version redevient à enregistrer. */
    fun applySaveFailed(state: TakeSaveState, version: SavedVersion): TakeSaveState =
        state.copy(savedWith = state.savedWith.filter { it != version })

    fun applyFrameChange(state: TakeSaveState, frameId: String?): TakeSaveState = state.copy(currentFrame = frameId)

    fun applyFormatChange(state: TakeSaveState, format: String): TakeSaveState = state.copy(currentFormat = format)
}
