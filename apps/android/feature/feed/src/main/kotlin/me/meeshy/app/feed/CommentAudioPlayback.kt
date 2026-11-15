package me.meeshy.app.feed

/** Où en est le lecteur d'un commentaire vocal. */
internal enum class CommentAudioPhase { IDLE, PREPARING, PLAYING, PAUSED, FAILED }

/** Ce qu'un toucher sur la pastille demande au lecteur. */
internal enum class CommentAudioTap { PREPARE, IGNORE, PAUSE, RESUME }

/**
 * La règle de la pastille vocale (#18271) : un toucher pendant la préparation est ignoré, puisque le lecteur n'accepte
 * pas encore `start()` ; après une erreur, le toucher suivant prépare un lecteur neuf au lieu de rester muet.
 */
internal object CommentAudioPlayback {
    fun onTap(phase: CommentAudioPhase): CommentAudioTap = when (phase) {
        CommentAudioPhase.IDLE, CommentAudioPhase.FAILED -> CommentAudioTap.PREPARE
        CommentAudioPhase.PREPARING -> CommentAudioTap.IGNORE
        CommentAudioPhase.PLAYING -> CommentAudioTap.PAUSE
        CommentAudioPhase.PAUSED -> CommentAudioTap.RESUME
    }
}
