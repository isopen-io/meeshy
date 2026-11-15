package me.meeshy.sdk.model.composer.capture

/** (x) ne jette jamais une prise en silence (miroir de `ComposerCaptureDiscardRule`). */
object CaptureDiscardRule {
    fun asksBeforeClosing(stage: CaptureStage, editing: Boolean, segments: List<CaptureSegment>): Boolean {
        if (editing) return true
        return stage == CaptureStage.RECORDING || CaptureSegments.asksBeforeClosing(segments)
    }
}

/**
 * La question « Abandonner ? » portée par la session, pas par la vue : elle survit à une vue recréée
 * et ce qu'elle abandonne est fixé quand on la pose (miroir de `ComposerCaptureDiscardPrompt`).
 */
data class CaptureDiscardPrompt(
    val request: Request? = null,
    val isPresented: Boolean = false,
    val closedAtMs: Long? = null,
) {
    data class Request(val take: Boolean, val photo: Boolean)

    fun ask(take: Boolean, photo: Boolean): CaptureDiscardPrompt =
        copy(request = Request(take, photo), isPresented = true)

    fun dismiss(nowMs: Long): CaptureDiscardPrompt =
        if (!isPresented) this else copy(isPresented = false, closedAtMs = nowMs)

    /** La réponse consomme la demande. */
    fun answer(nowMs: Long): Pair<CaptureDiscardPrompt, Request?> = dismiss(nowMs).let { it.copy(request = null) to request }

    fun swallowsTap(nowMs: Long): Boolean = CaptureTapRule.belongsToAnAlert(isPresented, closedAtMs, nowMs)
}

/**
 * Le curseur du flash s'efface 2 s après la dernière interaction (miroir de `ComposerFlashSliderTimer`) ;
 * un doigt posé ou un lecteur d'écran le retient.
 */
data class CaptureFlashSliderTimer(
    val generation: Int = 0,
    val visible: Boolean = false,
    val held: Boolean = false,
) {
    fun touch(): CaptureFlashSliderTimer = copy(visible = true, generation = generation + 1)

    fun hold(isHeld: Boolean): CaptureFlashSliderTimer = copy(held = isHeld).touch()

    fun hide(): CaptureFlashSliderTimer = copy(visible = false, held = false, generation = generation + 1)

    fun expire(forGeneration: Int, voiceOver: Boolean): CaptureFlashSliderTimer =
        if (forGeneration != generation || held || voiceOver) this else copy(visible = false)

    companion object {
        const val LIFETIME_MS: Long = 2_000
    }
}
