package me.meeshy.sdk.call.camera

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.call.camera.CameraZoomPlan
import me.meeshy.sdk.model.call.camera.CameraZoomPolicy
import me.meeshy.sdk.model.call.camera.CameraZoomProfile
import me.meeshy.sdk.model.call.camera.CameraZoomStep

/** Ce que le zoom écrit dans la caméra : ouvrir un objectif, recadrer son image. Doublé dans les tests. */
interface CameraZoomActuator {
    /** [rampRate] en puissances de deux par seconde ; `null` = saut immédiat (ouverture, changement de caméra). */
    fun setCrop(zoom: Float, rampRate: Float?)

    /** Rouvre la capture sur l'objectif physique [lensId] (le recadrage courant est conservé). */
    fun openLens(lensId: String)
}

data class CallCameraZoomState(
    val profile: CameraZoomProfile? = null,
    val displayFactor: Float = 1f,
    val isPinching: Boolean = false,
) {
    val isZoomable: Boolean get() = profile != null
}

/**
 * Le zoom de MA caméra pendant un appel (miroir de iOS `CameraZoomController`) : pincer sa propre
 * image, choisir une pastille d'objectif, revenir à 1×. Les décisions sont les nombres de
 * [CameraZoomProfile] ; l'écriture dans la caméra part par [CameraZoomActuator], jamais d'ici.
 */
class CallCameraZoom(private val actuator: CameraZoomActuator) {
    private val _state = MutableStateFlow(CallCameraZoomState())
    val state: StateFlow<CallCameraZoomState> = _state.asStateFlow()

    private var activeLensId: String? = null
    private var pinchStart: Float? = null

    /** Après chaque capture démarrée sur une face : une nouvelle caméra repart à 1×. */
    @Synchronized
    fun attach(profile: CameraZoomProfile?, activeLensId: String?) {
        this.activeLensId = activeLensId
        pinchStart = null
        _state.value = CallCameraZoomState(profile = profile)
        if (profile != null) move(profile.baselineDisplay, rampRate = null, stayOnLens = true)
    }

    @Synchronized
    fun detach() {
        activeLensId = null
        pinchStart = null
        _state.value = CallCameraZoomState()
    }

    @Synchronized
    fun updatePinch(scale: Float) {
        val profile = _state.value.profile ?: return
        val start = pinchStart ?: _state.value.displayFactor
        pinchStart = start
        _state.update { it.copy(isPinching = true) }
        move(profile.display(scale, from = start), CameraZoomPolicy.PINCH_RAMP_RATE, stayOnLens = true)
    }

    @Synchronized
    fun endPinch() {
        pinchStart = null
        _state.update { it.copy(isPinching = false) }
        val profile = _state.value.profile ?: return
        move(profile.settled(_state.value.displayFactor), CameraZoomPolicy.SETTLE_RAMP_RATE)
    }

    @Synchronized
    fun resetToBaseline() {
        val profile = _state.value.profile ?: return
        move(profile.baselineDisplay, CameraZoomPolicy.SETTLE_RAMP_RATE)
    }

    @Synchronized
    fun step(step: CameraZoomStep) {
        val profile = _state.value.profile ?: return
        move(profile.stepped(_state.value.displayFactor, step), CameraZoomPolicy.SETTLE_RAMP_RATE)
    }

    /** Une pastille « 0,5× · 1× · 2× · 3× » touchée. */
    @Synchronized
    fun select(display: Float) {
        if (_state.value.profile == null) return
        move(display, CameraZoomPolicy.SETTLE_RAMP_RATE)
    }

    @Synchronized
    fun cycleQuickStop() {
        val profile = _state.value.profile ?: return
        move(profile.nextQuickStop(_state.value.displayFactor), CameraZoomPolicy.SETTLE_RAMP_RATE)
    }

    /**
     * [stayOnLens] : pendant un pincement l'objectif ne change pas sous les doigts (rouvrir la
     * caméra coupe l'image) ; la bascule d'objectif attend le relâcher, qui s'aimante aux objectifs.
     */
    private fun move(display: Float, rampRate: Float?, stayOnLens: Boolean = false) {
        val profile = _state.value.profile ?: return
        val lens = activeLensId?.let { id -> profile.lenses.firstOrNull { it.id == id } }
        val floor = if (stayOnLens && lens != null) lens.ratio else profile.minDisplay
        val clamped = profile.clamped(maxOf(display, floor))
        val plan = if (stayOnLens && lens != null) CameraZoomPlan(lens.id, maxOf(1f, clamped / lens.ratio)) else profile.plan(clamped)
        _state.update { it.copy(displayFactor = clamped) }
        if (plan.lensId != activeLensId) {
            activeLensId = plan.lensId
            actuator.openLens(plan.lensId)
        }
        actuator.setCrop(plan.crop, rampRate)
    }
}
