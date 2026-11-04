package me.meeshy.ui.story.canvas

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * L'état publié du registre de lecture des canvas de scène.
 *
 * [activeCanvasId] : le seul canvas qui parle. [pausedCanvasIds] : les canvas dont l'utilisateur a figé la lecture
 * (maintenir un doigt) — la pause survit à une éviction puis un retour à l'écran. [inBackground] : l'appli est
 * passée en arrière-plan (ON_STOP). [muted] / [muteLocked] : le mute global et son verrou.
 */
public data class ScenePlaybackState(
    val activeCanvasId: String? = null,
    val pausedCanvasIds: Set<String> = emptySet(),
    val inBackground: Boolean = false,
    val muted: Boolean = false,
    val muteLocked: Boolean = false,
) {
    /** Vrai : [canvasId] doit jouer image, son et vidéos (actif, pas figé, appli au premier plan). */
    public fun shouldPlay(canvasId: String): Boolean =
        !inBackground && activeCanvasId == canvasId && canvasId !in pausedCanvasIds

    /** Le mute effectif propagé à TOUS les médias de la scène : verrouillé, il l'emporte sur tout. */
    public val effectiveMuted: Boolean get() = muted || muteLocked
}

/**
 * Le registre de canvas actif (miroir de la coordination de lecture iOS) : un canvas qui réclame la lecture
 * préempte les autres ; un canvas évincé (feuille, commentaires, groupe suivant) coupe immédiatement son et vidéos
 * (il lit [ScenePlaybackState.shouldPlay] faux) ; un canvas mis en pause qui revient garde sa pause. Les
 * transitions d'arrière-plan figent la lecture sans toucher aux pauses de l'utilisateur.
 *
 * Confiné au fil principal ; l'état est un [StateFlow] que les surfaces projettent.
 */
public class ScenePlaybackCoordinator {

    private val mutableState = MutableStateFlow(ScenePlaybackState())
    public val state: StateFlow<ScenePlaybackState> = mutableState.asStateFlow()

    /** [canvasId] prend la lecture ; l'ancien actif est évincé. Sa pause éventuelle est conservée. */
    public fun claim(canvasId: String) {
        mutableState.update { it.copy(activeCanvasId = canvasId) }
    }

    /** [canvasId] quitte l'écran : s'il était actif, plus personne ne parle ; sa pause est oubliée. */
    public fun release(canvasId: String) {
        mutableState.update {
            it.copy(
                activeCanvasId = it.activeCanvasId.takeIf { active -> active != canvasId },
                pausedCanvasIds = it.pausedCanvasIds - canvasId,
            )
        }
    }

    /** Évince [canvasId] sans l'oublier : il se tait mais garde sa pause (feuille ouverte par-dessus). */
    public fun preempt(canvasId: String) {
        mutableState.update {
            if (it.activeCanvasId == canvasId) it.copy(activeCanvasId = null) else it
        }
    }

    /** Pause d'un seul geste (doigt maintenu) de tous les médias du canvas, reprise au relâchement. */
    public fun setPaused(canvasId: String, paused: Boolean) {
        mutableState.update {
            it.copy(pausedCanvasIds = if (paused) it.pausedCanvasIds + canvasId else it.pausedCanvasIds - canvasId)
        }
    }

    /** ON_STOP / ON_START : l'arrière-plan fige tout, le retour reprend à l'état juste (pauses préservées). */
    public fun setInBackground(inBackground: Boolean) {
        mutableState.update { it.copy(inBackground = inBackground) }
    }

    public fun setMuted(muted: Boolean) {
        mutableState.update { it.copy(muted = muted) }
    }

    public fun setMuteLocked(locked: Boolean) {
        mutableState.update { it.copy(muteLocked = locked) }
    }

    public fun shouldPlay(canvasId: String): Boolean = mutableState.value.shouldPlay(canvasId)
}
