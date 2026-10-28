package me.meeshy.sdk.model.ongoing

/**
 * **Ce que devient un vocal en cours quand l'app quitte l'écran.** Miroir Android du comportement iOS
 * (`VoiceRecordingLiveActivityCoordinator`, #9784) : la prise CONTINUE en arrière-plan, l'îlot ou la
 * notification devenant le seul écran, jusqu'à « Arrêter » (le vocal rejoint le tiroir) ou « Annuler »
 * (il est jeté). Pure.
 *
 * Android coupe le micro d'une app en arrière-plan sauf si un service de premier plan de type
 * `microphone` la tient : [Input.keptAliveByService] dit si ce service a été accepté au départ de la
 * prise. Sans lui (démarrage refusé par le système), continuer ne donnerait que du silence : la prise est
 * alors posée dans le tiroir, comme avant, plutôt que perdue.
 */
object VoiceRecordingBackgroundLaw {

    data class Input(val isRecording: Boolean, val keptAliveByService: Boolean)

    enum class Decision {
        /** Pas de prise : rien à faire. */
        Nothing,

        /** Le service tient le micro : la prise continue, la notification porte Arrêter et Annuler. */
        KeepRecording,

        /** Rien ne tient le micro : la prise est arrêtée et posée dans le tiroir. */
        AbandonToTray,
    }

    fun onAppLeft(input: Input): Decision = when {
        !input.isRecording -> Decision.Nothing
        input.keptAliveByService -> Decision.KeepRecording
        else -> Decision.AbandonToTray
    }

    /**
     * Le système retire le premier plan APRÈS avoir accepté le démarrage du service. L'app encore à l'écran :
     * la prise continue sous les yeux de l'utilisateur, et [onAppLeft] la rangera s'il quitte. L'app déjà
     * partie : plus rien ne tient le micro, la prise est arrêtée et posée dans le tiroir — jamais perdue en
     * silence.
     */
    fun onServiceLost(isRecording: Boolean, appVisible: Boolean): Decision = when {
        !isRecording -> Decision.Nothing
        appVisible -> Decision.KeepRecording
        else -> Decision.AbandonToTray
    }
}
