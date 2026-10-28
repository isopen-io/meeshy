package me.meeshy.sdk.model.composer.capture

enum class CaptureHaptic { LIGHT, MEDIUM, SUCCESS, WARNING }

/** Ce que la machine demande à l'hôte d'exécuter (caméra, disque, retour sonore) : le réducteur ne touche à rien. */
sealed interface CaptureEffect {
    data class StartRecording(val token: String) : CaptureEffect
    data object StopRecording : CaptureEffect
    data object CancelPendingRecording : CaptureEffect
    data class TakePhoto(val token: String) : CaptureEffect
    data class DeleteFile(val path: String) : CaptureEffect
    data class Deliver(val segments: List<CaptureSegment>, val merge: Boolean) : CaptureEffect
    data class SwitchLens(val to: CaptureLensFacing) : CaptureEffect
    data class FocusAt(val point: CapturePoint) : CaptureEffect
    data class ApplyZoom(val displayed: Float) : CaptureEffect
    data class Haptic(val kind: CaptureHaptic) : CaptureEffect
    data object Disarm : CaptureEffect
}

data class CaptureSessionState(
    val stage: CaptureStage = CaptureStage.ARMED,
    val holding: Boolean = false,
    val locked: Boolean = false,
    val zoom: Float = 1f,
    val flash: CaptureFlashMode = CaptureFlashMode.OFF,
    val flashIntensity: Double = CaptureFlash.DEFAULT_INTENSITY,
    val flashSlider: CaptureFlashSliderTimer = CaptureFlashSliderTimer(),
    val facing: CaptureLensFacing = CaptureLensFacing.BACK,
    val switching: Boolean = false,
    val segments: List<CaptureSegment> = emptyList(),
    val ledger: CaptureTakeLedger = CaptureTakeLedger(),
    val discard: CaptureDiscardPrompt = CaptureDiscardPrompt(),
    val lastTap: CaptureLastTap? = null,
    val armedAtMs: Long? = null,
    val takeCounter: Int = 0,
    val allowsPhoto: Boolean = true,
    val allowsVideo: Boolean = true,
) {
    val gestureContext: CaptureGestureContext
        get() = CaptureGestureContext(
            stage = stage, holding = holding, locked = locked, pendingSegments = segments.size, frameChosen = false,
            allowsPhoto = allowsPhoto, allowsVideo = allowsVideo,
        )

    val topRow: CaptureTopRow.Input
        get() = CaptureTopRow.Input(stage = stage, pendingSegments = segments.size)
}

sealed interface CaptureEvent {
    data class Armed(val nowMs: Long) : CaptureEvent
    data class ShutterTapped(val nowMs: Long) : CaptureEvent
    data class SceneTapped(val point: CapturePoint?, val nowMs: Long) : CaptureEvent
    data object HoldBegan : CaptureEvent
    data class HoldDragged(val translationXDp: Float) : CaptureEvent
    data object HoldReleased : CaptureEvent
    data class RecordingStarted(val token: String) : CaptureEvent
    data class RecordingFailed(val token: String) : CaptureEvent
    data class SegmentWritten(val token: String, val path: String, val durationSec: Double) : CaptureEvent
    data class SegmentLost(val token: String) : CaptureEvent
    data class RecordingCancelled(val token: String) : CaptureEvent
    data class PhotoDelivered(val token: String) : CaptureEvent
    data class PhotoFailed(val token: String) : CaptureEvent
    data object DropLastSegment : CaptureEvent
    data object Validate : CaptureEvent
    data class CloseTapped(val nowMs: Long) : CaptureEvent
    data class DiscardAnswered(val confirmed: Boolean, val nowMs: Long) : CaptureEvent
    data object FlashTapped : CaptureEvent
    data class FlashIntensityChanged(val level: Double) : CaptureEvent
    data class FlashSliderTouched(val held: Boolean) : CaptureEvent
    data class FlashSliderExpired(val generation: Int, val voiceOver: Boolean) : CaptureEvent
    data object FlipTapped : CaptureEvent
    data object FlipFinished : CaptureEvent
    /** La caméra a lié l'objectif : si une bascule attendait ce signal, elle se termine. */
    data object FlipFinishedIfSwitching : CaptureEvent
    data class ZoomChanged(val displayed: Float) : CaptureEvent
}

data class CaptureStep(val state: CaptureSessionState, val effects: List<CaptureEffect> = emptyList())

/** La machine du viseur : événement -> état + effets, entièrement éprouvable sans caméra (miroir de `ComposerCaptureSession`). */
object CaptureSessionReducer {

    fun reduce(s: CaptureSessionState, e: CaptureEvent): CaptureStep = when (e) {
        is CaptureEvent.Armed -> CaptureStep(s.copy(stage = CaptureStage.ARMED, armedAtMs = e.nowMs))
        is CaptureEvent.ShutterTapped -> tap(s, CaptureGestureZone.SHUTTER, e.nowMs, null)
        is CaptureEvent.SceneTapped -> tap(s, CaptureGestureZone.SCENE, e.nowMs, e.point)
        CaptureEvent.HoldBegan -> holdBegan(s)
        is CaptureEvent.HoldDragged -> holdDragged(s, e.translationXDp)
        CaptureEvent.HoldReleased -> holdReleased(s)
        is CaptureEvent.RecordingStarted -> CaptureStep(s.copy(stage = CaptureStage.RECORDING), listOf(CaptureEffect.Haptic(CaptureHaptic.MEDIUM)))
        is CaptureEvent.RecordingFailed -> CaptureStep(settled(s).copy(ledger = s.ledger.abandon(e.token)), listOf(CaptureEffect.Haptic(CaptureHaptic.WARNING)))
        is CaptureEvent.SegmentWritten -> segmentWritten(s, e)
        is CaptureEvent.SegmentLost -> CaptureStep(settled(s).copy(ledger = s.ledger.abandon(e.token)), listOf(CaptureEffect.Haptic(CaptureHaptic.WARNING)))
        is CaptureEvent.RecordingCancelled -> CaptureStep(settled(s).copy(ledger = s.ledger.cancel(e.token)))
        is CaptureEvent.PhotoDelivered -> CaptureStep(s.copy(ledger = s.ledger.deliver(e.token)))
        is CaptureEvent.PhotoFailed -> CaptureStep(s.copy(ledger = s.ledger.abandon(e.token)), listOf(CaptureEffect.Haptic(CaptureHaptic.WARNING)))
        CaptureEvent.DropLastSegment -> dropLast(s)
        CaptureEvent.Validate -> validate(s)
        is CaptureEvent.CloseTapped -> close(s, e.nowMs)
        is CaptureEvent.DiscardAnswered -> discardAnswered(s, e)
        CaptureEvent.FlashTapped -> flashTapped(s)
        is CaptureEvent.FlashIntensityChanged -> CaptureStep(s.copy(flashIntensity = CaptureFlash.clamped(e.level), flashSlider = s.flashSlider.touch()))
        is CaptureEvent.FlashSliderTouched -> CaptureStep(s.copy(flashSlider = s.flashSlider.hold(e.held)))
        is CaptureEvent.FlashSliderExpired -> CaptureStep(s.copy(flashSlider = s.flashSlider.expire(e.generation, e.voiceOver)))
        CaptureEvent.FlipTapped -> flipTapped(s)
        CaptureEvent.FlipFinishedIfSwitching -> if (s.switching) reduce(s, CaptureEvent.FlipFinished) else CaptureStep(s)
        CaptureEvent.FlipFinished -> CaptureStep(s.copy(facing = flipped(s.facing), switching = false, zoom = 1f), listOf(CaptureEffect.Haptic(CaptureHaptic.LIGHT)))
        is CaptureEvent.ZoomChanged -> CaptureStep(s.copy(zoom = e.displayed), listOf(CaptureEffect.ApplyZoom(e.displayed)))
    }

    private fun settled(s: CaptureSessionState) =
        s.copy(stage = CaptureStage.ARMED, holding = false, locked = false)

    private fun nextToken(s: CaptureSessionState, kind: String) = "$kind-${s.takeCounter + 1}"

    private fun tap(s: CaptureSessionState, zone: CaptureGestureZone, nowMs: Long, point: CapturePoint?): CaptureStep {
        if (s.discard.swallowsTap(nowMs)) return CaptureStep(s)
        val outcome = CaptureGesture.tap(zone, s.gestureContext, nowMs, s.lastTap, s.armedAtMs)
        val next = s.copy(lastTap = outcome.memory)
        return when (outcome.action) {
            CaptureAction.PHOTO_TO_EDIT -> photo(next)
            CaptureAction.STOP_TAKE -> CaptureStep(next, listOf(CaptureEffect.StopRecording))
            CaptureAction.FOCUS ->
                if (point == null) CaptureStep(next)
                else CaptureStep(next, listOf(CaptureEffect.FocusAt(CaptureFocus.clamped(point)), CaptureEffect.Haptic(CaptureHaptic.LIGHT)))
            else -> CaptureStep(next)
        }
    }

    private fun photo(s: CaptureSessionState): CaptureStep {
        val token = nextToken(s, "photo")
        return CaptureStep(
            s.copy(ledger = s.ledger.begin(token), takeCounter = s.takeCounter + 1),
            listOf(CaptureEffect.TakePhoto(token), CaptureEffect.Haptic(CaptureHaptic.LIGHT)),
        )
    }

    private fun holdBegan(s: CaptureSessionState): CaptureStep {
        val action = CaptureGesture.action(CaptureGestureZone.SHUTTER, CaptureGestureKind.LONG_PRESS, s.gestureContext)
        if (action != CaptureAction.FILM_SEGMENT) return CaptureStep(s)
        val token = nextToken(s, "video")
        return CaptureStep(
            s.copy(holding = true, ledger = s.ledger.begin(token), takeCounter = s.takeCounter + 1),
            listOf(CaptureEffect.StartRecording(token)),
        )
    }

    private fun holdDragged(s: CaptureSessionState, translationXDp: Float): CaptureStep {
        if (!s.holding) return CaptureStep(s)
        val phase = CaptureHold.phase(translationXDp, wasLocked = s.locked)
        val locks = phase == CaptureHold.Phase.LOCKED && !s.locked
        return CaptureStep(s.copy(locked = phase == CaptureHold.Phase.LOCKED), if (locks) listOf(CaptureEffect.Haptic(CaptureHaptic.SUCCESS)) else emptyList())
    }

    private fun holdReleased(s: CaptureSessionState): CaptureStep {
        if (!s.holding) return CaptureStep(s)
        val phase = if (s.locked) CaptureHold.Phase.LOCKED else CaptureHold.Phase.HOLDING
        val next = s.copy(holding = false)
        return when (CaptureHold.release(s.stage == CaptureStage.RECORDING, phase)) {
            CaptureHold.Release.KEEP_FILMING -> CaptureStep(next)
            CaptureHold.Release.CLOSE_TAKE -> CaptureStep(next, listOf(CaptureEffect.StopRecording))
            CaptureHold.Release.CANCEL_PENDING -> CaptureStep(next, listOf(CaptureEffect.CancelPendingRecording))
        }
    }

    private fun segmentWritten(s: CaptureSessionState, e: CaptureEvent.SegmentWritten): CaptureStep {
        val segment = CaptureSegment(id = e.token, path = e.path, durationSec = e.durationSec)
        return CaptureStep(settled(s).copy(segments = s.segments + segment, ledger = s.ledger.deliver(e.token)), listOf(CaptureEffect.Haptic(CaptureHaptic.LIGHT)))
    }

    private fun dropLast(s: CaptureSessionState): CaptureStep {
        val dropped = CaptureSegments.droppingLast(s.segments)
        val effects = listOfNotNull(dropped.orphanPath?.let(CaptureEffect::DeleteFile))
        return CaptureStep(s.copy(segments = dropped.kept), effects)
    }

    private fun validate(s: CaptureSessionState): CaptureStep {
        if (!CaptureSegments.canValidate(s.segments)) return CaptureStep(s)
        return CaptureStep(
            s.copy(segments = emptyList()),
            listOf(CaptureEffect.Deliver(s.segments, CaptureSegments.needsMerge(s.segments)), CaptureEffect.Haptic(CaptureHaptic.SUCCESS)),
        )
    }

    private fun close(s: CaptureSessionState, nowMs: Long): CaptureStep =
        if (CaptureDiscardRule.asksBeforeClosing(s.stage, editing = false, segments = s.segments)) {
            CaptureStep(s.copy(discard = s.discard.ask(take = true, photo = false)))
        } else {
            CaptureStep(s, listOf(CaptureEffect.Disarm))
        }

    private fun discardAnswered(s: CaptureSessionState, e: CaptureEvent.DiscardAnswered): CaptureStep {
        val (prompt, request) = s.discard.answer(e.nowMs)
        val next = s.copy(discard = prompt)
        if (!e.confirmed || request == null) return CaptureStep(next)
        val files = s.segments.map { CaptureEffect.DeleteFile(it.path) }
        val stop = if (s.stage == CaptureStage.RECORDING) listOf(CaptureEffect.StopRecording) else emptyList()
        return CaptureStep(
            next.copy(segments = emptyList(), ledger = next.ledger.closeSession()),
            stop + files + CaptureEffect.Disarm,
        )
    }

    private fun flashTapped(s: CaptureSessionState): CaptureStep {
        val flash = CaptureFlash.next(s.flash)
        val slider = if (CaptureFlash.showsSlider(flash)) s.flashSlider.touch() else s.flashSlider.hide()
        return CaptureStep(s.copy(flash = flash, flashSlider = slider), listOf(CaptureEffect.Haptic(CaptureHaptic.LIGHT)))
    }

    private fun flipTapped(s: CaptureSessionState): CaptureStep {
        if (s.switching || s.stage == CaptureStage.RECORDING) return CaptureStep(s)
        return CaptureStep(s.copy(switching = true), listOf(CaptureEffect.SwitchLens(flipped(s.facing))))
    }

    private fun flipped(f: CaptureLensFacing) = if (f == CaptureLensFacing.BACK) CaptureLensFacing.FRONT else CaptureLensFacing.BACK
}
