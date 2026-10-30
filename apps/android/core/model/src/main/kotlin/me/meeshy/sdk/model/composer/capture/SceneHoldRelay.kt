package me.meeshy.sdk.model.composer.capture

/** Ce que le doigt qui tient la scène dit au viseur : il tient, il glisse (dp, y vers le bas), il se lève. */
sealed interface SceneHoldSignal {
    data object Began : SceneHoldSignal
    data class Moved(val dxDp: Float, val dyDp: Float) : SceneHoldSignal
    data object Released : SceneHoldSignal

    /** Ce que la machine du viseur en reçoit ; le zoom vertical reste à l'hôte, qui connaît l'objectif. */
    val events: List<CaptureEvent>
        get() = when (this) {
            Began -> listOf(CaptureEvent.HoldBegan)
            is Moved -> listOf(CaptureEvent.HoldDragged(dxDp))
            Released -> listOf(CaptureEvent.HoldReleased)
        }
}

/**
 * **Le doigt qui a ouvert le viseur en TENANT la scène vide** (#13849, iOS `beginHold` / `holdChanged` / `endHold`) : il
 * tient encore quand le viseur paraît, et c'est lui qui filme — relâché, la prise se clôt ; glissé jusqu'au cadenas, elle
 * continue sans lui (`ComposerCaptureHold`). Tant que la caméra n'est pas liée, le relais RÉSUME le geste ; à la liaison
 * ([attach]) il le rejoue : un doigt parti sans verrou n'a rien demandé, un verrou posé avant vaut intention.
 */
class SceneHoldRelay {
    private var began = false
    private var released = false
    private var locked = false
    private var lastDyDp = 0f
    private var sink: ((SceneHoldSignal) -> Unit)? = null

    /** Le doigt tient la scène, sa levée n'est pas encore venue. */
    val holding: Boolean get() = began && !released

    fun began() {
        clearGesture()
        began = true
        sink?.invoke(SceneHoldSignal.Began)
    }

    fun moved(dxDp: Float, dyDp: Float) {
        if (!holding) return
        locked = CaptureHold.phase(dxDp, wasLocked = locked) == CaptureHold.Phase.LOCKED
        lastDyDp = dyDp
        sink?.invoke(SceneHoldSignal.Moved(dxDp, dyDp))
    }

    fun released() {
        if (!holding) return
        released = true
        sink?.invoke(SceneHoldSignal.Released)
    }

    /** Un armement au toucher : aucun doigt ne filme. */
    fun clear() = clearGesture()

    /** La caméra est liée : le geste résumé se rejoue une fois, la suite passe en direct. */
    fun attach(sink: (SceneHoldSignal) -> Unit) {
        val first = this.sink == null
        this.sink = sink
        if (first) replay().forEach(sink)
    }

    /** Le viseur s'en va : plus rien à relayer, ni à rejouer. */
    fun detach() {
        sink = null
        clearGesture()
    }

    private fun replay(): List<SceneHoldSignal> {
        if (!began || (released && !locked)) return emptyList()
        return listOfNotNull(
            SceneHoldSignal.Began,
            SceneHoldSignal.Moved(ShutterGesture.SLIDE_TO_LOCK_DP, lastDyDp).takeIf { locked },
            SceneHoldSignal.Released.takeIf { released },
        )
    }

    private fun clearGesture() {
        began = false
        released = false
        locked = false
        lastDyDp = 0f
    }
}
