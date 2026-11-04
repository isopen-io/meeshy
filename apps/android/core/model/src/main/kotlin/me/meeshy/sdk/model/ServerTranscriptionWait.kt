package me.meeshy.sdk.model

/**
 * L'attente d'une transcription demandée au serveur (miroir de `ServerTranscriptionWait`, iOS, et de
 * `ON_DEMAND_STALL_MS`, web) : « Transcription… » reste affiché tant que la tâche tourne, puis, passé le plafond de
 * silence sans rien recevoir, « Transcrire » revient et la demande peut se refaire. Une loi pure : l'horloge est passée
 * en paramètre, aucun état n'est tenu ici.
 */
object ServerTranscriptionWait {

    /** Au-delà, un serveur muet est tenu pour perdu : la demande est de nouveau permise. */
    const val SILENCE_CEILING_MS: Long = 90_000L

    /**
     * `true` tant que la demande faite à [requestedAtMs] attend sa réponse : rien n'est [hasArrived] et moins de
     * [SILENCE_CEILING_MS] se sont écoulés. Une horloge reculée (`nowMs < requestedAtMs`) continue d'attendre.
     */
    fun isWaiting(requestedAtMs: Long, nowMs: Long, hasArrived: Boolean): Boolean =
        !hasArrived && nowMs - requestedAtMs < SILENCE_CEILING_MS

    /**
     * L'état de la demande d'une pièce : arrivée = au repos ; échec reçu = en échec, réessayable ; en attente = en
     * cours ; plafond dépassé, ou jamais demandée = au repos.
     */
    fun requestState(
        requestedAtMs: Long?,
        nowMs: Long,
        hasArrived: Boolean,
        failed: Boolean,
    ): MessageTranscriptionFiche.Request = when {
        hasArrived -> MessageTranscriptionFiche.Request.IDLE
        failed -> MessageTranscriptionFiche.Request.FAILED
        requestedAtMs != null && isWaiting(requestedAtMs, nowMs, hasArrived = false) -> MessageTranscriptionFiche.Request.IN_FLIGHT
        else -> MessageTranscriptionFiche.Request.IDLE
    }
}
