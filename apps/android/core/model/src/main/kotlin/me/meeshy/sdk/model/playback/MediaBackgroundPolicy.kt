package me.meeshy.sdk.model.playback

/**
 * Règle produit du passage en arrière-plan pour les lecteurs média — port de iOS
 * `MediaBackgroundPolicy` (#11041), décision pure.
 *
 * - L'AUDIO (messages vocaux, posts audio) survit à l'arrière-plan — file en lecture OU en pause
 *   (carte « À l'écoute », parité WhatsApp).
 * - La VIDÉO (réels, vidéos de commentaire, message en plein écran) ne survit JAMAIS hors
 *   Picture-in-Picture : elle part dans la fenêtre PiP que le système ouvre, sinon elle est mise en
 *   pause.
 * - La session audio n'est rendue que lorsqu'il ne reste strictement rien à faire vivre.
 */
public object MediaBackgroundPolicy {

    /** Ce que devient la vidéo du lecteur partagé quand l'application quitte le premier plan (#11041). */
    public enum class VideoVerdict {
        /**
         * La fenêtre PiP démarre ou est ouverte : la vidéo lui appartient. Ni pause, ni arrêt, et la
         * session reste active — la mettre en pause ou démonter le lecteur avorterait la fenêtre en
         * cours d'ouverture.
         */
        HandOffToPip,

        /** Aucune fenêtre ne la reprend : elle s'arrête. */
        Pause,

        /** Rien ne joue et aucune fenêtre n'est ouverte. */
        None,
    }

    public data class Decision(
        val video: VideoVerdict,
        /** Garder la session audio active (lecture ou file audio, ou PiP). */
        val keepsSessionAlive: Boolean,
    ) {
        /** Mettre en pause le lecteur vidéo partagé. */
        public val pausesVideo: Boolean
            get() = video == VideoVerdict.Pause
    }

    public fun backgroundVideo(
        videoPlaying: Boolean,
        pipConfigured: Boolean,
        pipStartingOrEngaged: Boolean,
        pipFailed: Boolean,
    ): VideoVerdict {
        val pipOwnsTheVideo = pipConfigured && pipStartingOrEngaged && !pipFailed
        return when {
            pipOwnsTheVideo -> VideoVerdict.HandOffToPip
            videoPlaying -> VideoVerdict.Pause
            else -> VideoVerdict.None
        }
    }

    public fun decide(
        audioQueuePlaying: Boolean,
        audioQueueActive: Boolean,
        anyAudioEnginePlaying: Boolean,
        video: VideoVerdict,
    ): Decision {
        val audioAlive = audioQueuePlaying || audioQueueActive || anyAudioEnginePlaying
        return Decision(video = video, keepsSessionAlive = audioAlive || video == VideoVerdict.HandOffToPip)
    }
}
