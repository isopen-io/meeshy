package me.meeshy.ui.component.video

import me.meeshy.sdk.playback.FocusChange

/**
 * **Le focus audio d'une vidéo** : une perte (appel, autre lecteur) met en pause ; le gain reprend, mais
 * seulement ce que le focus a lui-même suspendu. Une perte définitive ne reprend jamais d'elle-même, et
 * un geste de l'utilisateur annule toute reprise.
 */
internal class PlaybackAudioFocus(
    private val pause: () -> Unit,
    private val resume: () -> Unit,
) {
    private var suspendedByFocus = false

    fun onFocusChange(change: FocusChange) {
        when (change) {
            FocusChange.LossTransient -> {
                suspendedByFocus = true
                pause()
            }
            FocusChange.Loss -> {
                suspendedByFocus = false
                pause()
            }
            FocusChange.Gain -> if (suspendedByFocus) {
                suspendedByFocus = false
                resume()
            }
            FocusChange.LossTransientCanDuck -> Unit
        }
    }

    fun onUserPaused() {
        suspendedByFocus = false
    }
}
