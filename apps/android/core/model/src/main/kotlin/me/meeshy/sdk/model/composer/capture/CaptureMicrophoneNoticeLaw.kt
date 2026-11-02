package me.meeshy.sdk.model.composer.capture

/**
 * **Quand le viseur dit que la vidéo sera muette.** Miroir de `CameraModel.enableAudioCaptureIfNeeded` (iOS) : le
 * micro se demande au PREMIER film, jamais à l'ouverture du viseur ; refusé, on filme quand même, sans piste audio,
 * et on le dit UNE fois par session — deux avis pour des prises qui ont toutes le même défaut seraient du bruit.
 */
object CaptureMicrophoneNoticeLaw {

    data class State(val announced: Boolean = false)

    data class Step(val state: State, val announce: Boolean)

    fun beforeFilm(state: State, microphoneGranted: Boolean): Step {
        if (microphoneGranted || state.announced) return Step(state, announce = false)
        return Step(State(announced = true), announce = true)
    }
}
