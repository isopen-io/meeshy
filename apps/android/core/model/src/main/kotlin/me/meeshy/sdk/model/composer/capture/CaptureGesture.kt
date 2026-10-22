package me.meeshy.sdk.model.composer.capture

enum class CaptureZone { SCENE, CHOSEN_THUMBNAIL, SHUTTER, OTHER_THUMBNAIL, RAIL }

enum class CaptureGestureKind { TAP, DOUBLE_TAP, LONG_PRESS, PINCH, DRAG }

/** Ce que le geste produit : l'écran l'exécute, la table le décide. */
enum class CaptureAction {
    NONE, FOCUS, PHOTO_TO_EDIT, PHOTO_TO_GALLERY, FILM_SEGMENT, FILM_TO_GALLERY, STOP_TAKE, ZOOM,
    STEER_TAKE, CLOSE, SELECT, OPEN_FAMILY, REFRAME, TOGGLE_EDIT_CHROME,
    ;

    val takesAPhoto: Boolean get() = this == PHOTO_TO_EDIT || this == PHOTO_TO_GALLERY
}

data class CaptureGestureContext(
    val stage: CaptureStage = CaptureStage.ARMED,
    val editing: Boolean = false,
    val holding: Boolean = false,
    val locked: Boolean = false,
    val pendingSegments: Int = 0,
    val allowsPhoto: Boolean = true,
    val allowsVideo: Boolean = true,
    /** La case choisie porte un VRAI cadre ; sur « Aucun » elle prend hors cadre. */
    val frameChosen: Boolean = true,
)

data class CaptureLastTap(val zone: CaptureZone, val atMs: Long)

/** [memory] est nul quand le toucher a fini un double : un troisième en ouvre un nouveau. */
data class CaptureTapOutcome(val action: CaptureAction, val consumedDouble: Boolean, val memory: CaptureLastTap?)

/** La table des gestes de la capture : zone x geste x phase x verrou -> action (miroir de `ComposerCaptureGesture`). */
object CaptureGesture {

    fun action(zone: CaptureZone, gesture: CaptureGestureKind, context: CaptureGestureContext): CaptureAction {
        if (context.editing) return editing(zone, gesture)
        if (context.stage == CaptureStage.OFF) return CaptureAction.NONE
        return when (zone) {
            CaptureZone.SCENE -> scene(gesture, context)
            CaptureZone.CHOSEN_THUMBNAIL -> chosen(gesture, context)
            CaptureZone.SHUTTER -> shutter(gesture, context)
            CaptureZone.OTHER_THUMBNAIL ->
                if (gesture == CaptureGestureKind.TAP && !lookIsLocked(context)) CaptureAction.SELECT else CaptureAction.NONE
            CaptureZone.RAIL ->
                if (gesture == CaptureGestureKind.TAP && !lookIsLocked(context)) CaptureAction.OPEN_FAMILY else CaptureAction.NONE
        }
    }

    /** Un rail qu'on ne peut pas ouvrir n'est pas montré. */
    fun offersRail(context: CaptureGestureContext): Boolean =
        action(CaptureZone.RAIL, CaptureGestureKind.TAP, context) == CaptureAction.OPEN_FAMILY

    /**
     * Un toucher lu par la règle du porteur. Le second toucher d'un double sur un DÉCLENCHEUR est
     * absorbé (le premier a déjà photographié) : jamais deux photos d'un double.
     */
    fun tap(
        zone: CaptureZone,
        context: CaptureGestureContext,
        nowMs: Long,
        lastTap: CaptureLastTap?,
        armedAtMs: Long?,
    ): CaptureTapOutcome {
        val previous = lastTap?.takeIf { it.zone == zone }?.atMs
        val rule = CaptureTapRule.action(context.stage, nowMs, previous, armedAtMs)
        val simple = action(zone, CaptureGestureKind.TAP, context)
        if (rule == CaptureTapRule.Action.PHOTO && simple.takesAPhoto) {
            return CaptureTapOutcome(CaptureAction.NONE, consumedDouble = true, memory = null)
        }
        val double = if (rule == CaptureTapRule.Action.PHOTO) action(zone, CaptureGestureKind.DOUBLE_TAP, context) else CaptureAction.NONE
        if (double != CaptureAction.NONE) return CaptureTapOutcome(double, consumedDouble = true, memory = null)
        return CaptureTapOutcome(simple, consumedDouble = false, memory = CaptureLastTap(zone, nowMs))
    }

    /** Les équivalents TalkBack : chaque zone offre ses prises en actions nommées, projetées de la table. */
    fun accessibilityActions(zone: CaptureZone, context: CaptureGestureContext): List<CaptureAction> {
        if (context.editing || context.stage == CaptureStage.OFF) return emptyList()
        val armed = context.stage == CaptureStage.ARMED
        return when (zone) {
            CaptureZone.SCENE ->
                if (!armed) listOf(CaptureAction.STOP_TAKE, CaptureAction.FOCUS)
                else listOf(
                    action(zone, CaptureGestureKind.DOUBLE_TAP, context),
                    action(zone, CaptureGestureKind.LONG_PRESS, context),
                    CaptureAction.FOCUS,
                ).filter { it != CaptureAction.NONE }
            CaptureZone.CHOSEN_THUMBNAIL, CaptureZone.SHUTTER ->
                if (!armed) listOf(CaptureAction.STOP_TAKE)
                else listOf(
                    action(zone, CaptureGestureKind.TAP, context),
                    action(zone, CaptureGestureKind.LONG_PRESS, context),
                ).filter { it != CaptureAction.NONE }
            CaptureZone.OTHER_THUMBNAIL, CaptureZone.RAIL -> emptyList()
        }
    }

    private fun lookIsLocked(c: CaptureGestureContext): Boolean =
        c.stage == CaptureStage.RECORDING || c.pendingSegments > 0

    private fun mayShootAlone(c: CaptureGestureContext): Boolean =
        c.stage == CaptureStage.ARMED && c.pendingSegments == 0

    private fun scene(gesture: CaptureGestureKind, c: CaptureGestureContext): CaptureAction = when (gesture) {
        CaptureGestureKind.TAP -> CaptureAction.FOCUS
        CaptureGestureKind.DOUBLE_TAP -> if (mayShootAlone(c) && c.allowsPhoto) CaptureAction.PHOTO_TO_EDIT else CaptureAction.NONE
        CaptureGestureKind.LONG_PRESS ->
            if (c.stage == CaptureStage.ARMED && c.allowsVideo) CaptureAction.FILM_SEGMENT else CaptureAction.NONE
        CaptureGestureKind.PINCH -> CaptureAction.ZOOM
        CaptureGestureKind.DRAG -> when {
            c.holding -> CaptureAction.STEER_TAKE
            c.stage == CaptureStage.RECORDING -> CaptureAction.ZOOM
            else -> CaptureAction.CLOSE
        }
    }

    /** Le cadre EST le déclencheur : la case choisie photographie d'UN toucher et filme à l'appui long. */
    private fun chosen(gesture: CaptureGestureKind, c: CaptureGestureContext): CaptureAction {
        if (!c.frameChosen) return shutter(gesture, c)
        return when (gesture) {
            CaptureGestureKind.TAP -> when {
                c.stage == CaptureStage.RECORDING -> if (c.locked) CaptureAction.STOP_TAKE else CaptureAction.NONE
                mayShootAlone(c) && c.allowsPhoto -> CaptureAction.PHOTO_TO_GALLERY
                else -> CaptureAction.NONE
            }
            CaptureGestureKind.DOUBLE_TAP ->
                if (mayShootAlone(c) && c.allowsPhoto) CaptureAction.PHOTO_TO_GALLERY else CaptureAction.NONE
            CaptureGestureKind.LONG_PRESS ->
                if (mayShootAlone(c) && c.allowsVideo) CaptureAction.FILM_TO_GALLERY else CaptureAction.NONE
            CaptureGestureKind.PINCH -> CaptureAction.ZOOM
            CaptureGestureKind.DRAG -> if (c.holding) CaptureAction.STEER_TAKE else CaptureAction.NONE
        }
    }

    /** Le déclencheur simple fait ce que fait la scène, d'UN toucher. */
    private fun shutter(gesture: CaptureGestureKind, c: CaptureGestureContext): CaptureAction = when (gesture) {
        CaptureGestureKind.TAP -> when {
            c.stage == CaptureStage.RECORDING -> if (c.locked) CaptureAction.STOP_TAKE else CaptureAction.NONE
            mayShootAlone(c) && c.allowsPhoto -> CaptureAction.PHOTO_TO_EDIT
            else -> CaptureAction.NONE
        }
        CaptureGestureKind.DOUBLE_TAP -> CaptureAction.NONE
        CaptureGestureKind.LONG_PRESS ->
            if (c.stage == CaptureStage.ARMED && c.allowsVideo) CaptureAction.FILM_SEGMENT else CaptureAction.NONE
        CaptureGestureKind.PINCH -> CaptureAction.ZOOM
        CaptureGestureKind.DRAG -> if (c.holding) CaptureAction.STEER_TAKE else CaptureAction.NONE
    }

    private fun editing(zone: CaptureZone, gesture: CaptureGestureKind): CaptureAction = when {
        zone == CaptureZone.SCENE && (gesture == CaptureGestureKind.DRAG || gesture == CaptureGestureKind.PINCH) -> CaptureAction.REFRAME
        zone == CaptureZone.SCENE && gesture == CaptureGestureKind.TAP -> CaptureAction.TOGGLE_EDIT_CHROME
        zone == CaptureZone.OTHER_THUMBNAIL && gesture == CaptureGestureKind.TAP -> CaptureAction.SELECT
        zone == CaptureZone.RAIL && gesture == CaptureGestureKind.TAP -> CaptureAction.OPEN_FAMILY
        else -> CaptureAction.NONE
    }
}
