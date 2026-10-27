package me.meeshy.sdk.model.composer.sound

/** L'aperçu d'un son de l'étagère : jamais plus d'UN à la fois, la ligne montre une attente tant que rien ne joue. */
sealed interface SoundPreviewState {
    data object Idle : SoundPreviewState
    data class Preparing(val id: String) : SoundPreviewState
    data class Playing(val id: String) : SoundPreviewState

    fun isPlaying(id: String): Boolean = this is Playing && this.id == id
    fun isPreparing(id: String): Boolean = this is Preparing && this.id == id
}

sealed interface SoundPreviewCommand {
    data object None : SoundPreviewCommand
    data object Stop : SoundPreviewCommand
    data class Start(val id: String) : SoundPreviewCommand
}

data class SoundPreviewOutcome(val state: SoundPreviewState, val command: SoundPreviewCommand)

/** Miroir de `togglePreview` / `stopPreview` de `SoundLibraryPickerModel` (iOS), en machine pure. */
object SoundPreviewLaw {
    /**
     * [instant] : le fichier est déjà sur le disque — un son local part sans état d'attente, car afficher une roue
     * pour un fichier local serait un clignotement gratuit.
     */
    fun toggle(state: SoundPreviewState, id: String, instant: Boolean): SoundPreviewOutcome {
        if (state.isPlaying(id) || state.isPreparing(id)) return stopped()
        val next = if (instant) SoundPreviewState.Playing(id) else SoundPreviewState.Preparing(id)
        return SoundPreviewOutcome(next, SoundPreviewCommand.Start(id))
    }

    fun ready(state: SoundPreviewState, id: String): SoundPreviewState =
        if (state.isPreparing(id)) SoundPreviewState.Playing(id) else state

    /** Fin naturelle de piste ou échec : la ligne repasse en « lecture » toute seule, sans rester bloquée sur « stop ». */
    fun finished(state: SoundPreviewState, id: String): SoundPreviewState =
        if (state.isPlaying(id) || state.isPreparing(id)) SoundPreviewState.Idle else state

    fun removing(state: SoundPreviewState, id: String): SoundPreviewOutcome =
        if (state.isPlaying(id) || state.isPreparing(id)) stopped()
        else SoundPreviewOutcome(state, SoundPreviewCommand.None)

    fun stopped(): SoundPreviewOutcome = SoundPreviewOutcome(SoundPreviewState.Idle, SoundPreviewCommand.Stop)
}
