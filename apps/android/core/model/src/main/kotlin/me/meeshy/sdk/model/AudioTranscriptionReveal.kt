package me.meeshy.sdk.model

/**
 * La règle pure de l'opt-out d'affichage de la transcription — miroir de `AudioTranscriptionReveal`
 * (iOS, #4956). `autoTranscribeIncoming == false` ne retire jamais la transcription : le serveur
 * l'a déjà produite (au besoin pour les traductions), le réglage ne porte que sur son AFFICHAGE
 * automatique dans la bulle d'un message REÇU. Ses propres vocaux restent toujours transcrits à
 * l'écran. Une fois révélée d'un tap, la transcription le reste pour la vie de la bulle.
 */
public object AudioTranscriptionReveal {

    /** Faux pour un message envoyé par soi, sinon la préférence `audio.autoTranscribeIncoming`. */
    public fun autoReveals(isOutgoing: Boolean, autoTranscribeIncoming: Boolean): Boolean =
        isOutgoing || autoTranscribeIncoming

    /**
     * Vrai quand le bouton « Transcrire » doit remplacer le texte alors qu'une transcription existe :
     * l'affichage automatique est coupé et l'utilisateur ne l'a pas encore révélée.
     */
    public fun shouldShowRevealCta(hasTranscription: Boolean, autoReveal: Boolean, manuallyRevealed: Boolean): Boolean =
        hasTranscription && !autoReveal && !manuallyRevealed
}
