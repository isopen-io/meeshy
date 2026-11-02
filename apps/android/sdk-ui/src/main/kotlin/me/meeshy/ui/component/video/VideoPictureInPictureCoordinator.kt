package me.meeshy.ui.component.video

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.playback.PipAspect
import me.meeshy.sdk.model.playback.VideoPictureInPicturePolicy

/** Ce qu'une surface vidéo plein écran inscrite dit d'elle-même au moment d'ouvrir la fenêtre. */
public interface VideoPictureInPictureSurface {
    public val isPlaying: Boolean
    public val aspect: PipAspect
}

/**
 * Le Picture-in-Picture d'une VIDÉO (iOS `SharedPipEngine`) : un réel ou le plein écran d'une vidéo de conversation
 * s'inscrit ([register]) tant qu'il est affiché ; quitter l'application ([onUserLeaveHint]) ou toucher « PiP »
 * ([requestEnter]) ouvre la fenêtre au rapport de la vidéo, selon [VideoPictureInPicturePolicy]. L'activité fournit
 * le geste ([enter]) et appelle le coordinateur d'APPEL d'abord : un appel vidéo en cours garde la fenêtre.
 * Une instance par activité : celle qu'une relance remplace emporte la sienne. Fil principal seulement.
 */
public class VideoPictureInPictureCoordinator(
    private val deviceSupportsPip: Boolean,
    private val videoCallInProgress: () -> Boolean,
    private val enter: (PipAspect) -> Boolean,
) {
    private val surfaces = mutableListOf<VideoPictureInPictureSurface>()
    private var entryPending = false
    private var heldByInAppLaunch = false
    private var windowSession = false

    private val _inPip = MutableStateFlow(false)
    private val _closures = MutableStateFlow(0)

    /** `true` tant que la fenêtre flottante montre la vidéo : la surface retire contrôles et chrome. */
    public val inPip: StateFlow<Boolean> = _inPip.asStateFlow()

    /** Compte les fenêtres FERMÉES par l'utilisateur (activité stoppée hors agrandissement) : la vidéo se met en pause. */
    public val closures: StateFlow<Int> = _closures.asStateFlow()

    /** Inscrit [surface] au-dessus des autres ; la valeur retournée la retire. */
    public fun register(surface: VideoPictureInPictureSurface): () -> Unit {
        surfaces += surface
        return { surfaces.removeAll { it === surface } }
    }

    /** Le bouton PiP des contrôles est proposé. */
    public fun offersButton(): Boolean =
        VideoPictureInPicturePolicy.offersButton(surfaces.isNotEmpty(), deviceSupportsPip, videoCallInProgress())

    /** Le bouton PiP : ouvre la fenêtre, en lecture comme en pause. */
    public fun requestEnter(): Boolean {
        val surface = surfaces.lastOrNull() ?: return false
        return offersButton() && open(surface)
    }

    /** `onUserLeaveHint` : l'utilisateur quitte l'application pendant la lecture. */
    public fun onUserLeaveHint(): Boolean {
        if (heldByInAppLaunch) {
            heldByInAppLaunch = false
            return false
        }
        val surface = surfaces.lastOrNull()
        val allowed = VideoPictureInPicturePolicy.mayEnterOnLeave(
            configured = surface != null,
            isPlaying = surface?.isPlaying == true,
            deviceSupportsPip = deviceSupportsPip,
            videoCallInProgress = videoCallInProgress(),
        )
        return allowed && surface != null && open(surface)
    }

    /** L'activité lance une autre activité pour elle-même : le départ qui suit n'est pas celui de l'utilisateur. */
    public fun holdForInAppLaunch() {
        heldByInAppLaunch = true
    }

    /** La fenêtre passe ou quitte le mode PiP ; rend `true` si c'est la vidéo qui l'occupe. */
    public fun onPictureInPictureModeChanged(inPip: Boolean): Boolean {
        val owns = inPip && entryPending
        entryPending = false
        if (owns) windowSession = true
        _inPip.value = owns
        return owns
    }

    /** L'activité revient au premier plan (fenêtre agrandie, retour dans l'app) : rien n'a été fermé. */
    public fun onActivityResumed() {
        heldByInAppLaunch = false
        windowSession = false
    }

    /** L'activité est stoppée : si la fenêtre de la vidéo était ouverte, l'utilisateur vient de la fermer. */
    public fun onActivityStopped() {
        if (!windowSession) return
        windowSession = false
        _inPip.value = false
        _closures.value += 1
    }

    private fun open(surface: VideoPictureInPictureSurface): Boolean {
        // Posée AVANT le geste : le système peut annoncer le mode pendant l'appel lui-même.
        entryPending = true
        val entered = enter(surface.aspect)
        if (!entered) entryPending = false
        return entered
    }
}
