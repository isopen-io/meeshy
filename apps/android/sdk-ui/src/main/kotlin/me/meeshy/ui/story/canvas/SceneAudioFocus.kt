package me.meeshy.ui.story.canvas

import me.meeshy.sdk.model.scene.SceneAudioFocusLaw
import me.meeshy.sdk.playback.AudioFocusSystem
import me.meeshy.sdk.playback.FocusChange
import me.meeshy.sdk.playback.FocusKind
import me.meeshy.sdk.playback.NoisyRouteSource

/**
 * Le focus audio du mixeur de scène, tenu UNE fois pour toutes ses pistes (la session audio unique d'iOS) : un appel,
 * un assistant ou une autre application mettent le son en attente SANS perdre sa position ; la loi pure
 * [SceneAudioFocusLaw] décide de la reprise. Un casque débranché met le son en pause sans le relancer sur le haut-parleur.
 */
internal class SceneAudioFocus(
    private val system: AudioFocusSystem,
    private val noisy: NoisyRouteSource,
    private val onLost: () -> Unit,
    private val onGained: () -> Unit,
    private val onLostForGood: () -> Unit,
) {
    private val law = SceneAudioFocusLaw()
    private var requested = false
    private var unregisterNoisy: (() -> Unit)? = null

    /** La scène doit se taire (position conservée). */
    val isHeld: Boolean get() = law.isHeld

    /** Le système a demandé de baisser le niveau (navigation vocale) : le son continue, plus bas. */
    @Volatile
    var isDucked: Boolean = false
        private set

    /** Demande le focus une fois par lecture ; refusé (un appel en cours), le son reste en attente. */
    fun request() {
        if (requested) return
        requested = true
        law.onUserResume()
        isDucked = false
        unregisterNoisy = noisy.register {
            if (law.onBecomingNoisy()) {
                drop()
                onLostForGood()
            }
        }
        if (!system.request(FocusKind.Playback, ::onChange) && law.onFocusLost()) onLost()
    }

    /** L'utilisateur relance après une pause définitive : la mise en attente est levée, le prochain tick redemande le focus. */
    fun userResumed() = law.onUserResume()

    /** Rend le focus (pause de l'utilisateur, scène quittée) ; la prochaine lecture le redemande. */
    fun release() = drop()

    private fun drop() {
        if (!requested) return
        requested = false
        unregisterNoisy?.invoke()
        unregisterNoisy = null
        system.abandon(FocusKind.Playback)
        isDucked = false
    }

    private fun onChange(change: FocusChange) {
        when (change) {
            FocusChange.Gain -> {
                isDucked = false
                if (law.onFocusGained()) onGained()
            }
            FocusChange.LossTransientCanDuck -> isDucked = true
            FocusChange.LossTransient -> if (law.onFocusLost()) onLost()
            FocusChange.Loss -> if (law.onFocusLostForGood()) {
                drop()
                onLostForGood()
            }
        }
    }
}
