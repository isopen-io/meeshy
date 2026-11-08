package me.meeshy.sdk.model.ongoing

/** Un bouton de la notification : la commande et son libellé déjà localisé. */
data class LiveActivityAction(val command: LiveActivityCommand, val label: String)

/**
 * Ce qu'une notification en cours montre, indépendamment de l'API qui la dessine : titre, ligne de
 * détail, progression BORNÉE à 0..1 (`null` = pas de barre ; [indeterminate] = barre sans valeur),
 * chronomètre natif, boutons. [isOngoing] faux = l'issue, qui se retire seule.
 */
data class LiveActivityPlan(
    val kind: OngoingActivityKind,
    val title: String,
    val detail: String? = null,
    val progress: Double? = null,
    val indeterminate: Boolean = false,
    val chronometerFromEpochMs: Long? = null,
    val actions: List<LiveActivityAction> = emptyList(),
    val isOngoing: Boolean = true,
    val isError: Boolean = false,
)

/** La lecture d'un vocal telle que la notification la montre ; [isProtected] masque la conversation. */
data class VoicePlaybackSnapshot(
    val title: String,
    val subtitle: String,
    val isPlaying: Boolean,
    val positionMs: Long,
    val durationMs: Long,
    val isProtected: Boolean = false,
)

/** Les libellés dont les plans ont besoin, dans la langue d'interface. */
data class LiveActivityLabels(
    val publicText: String,
    val protectedMessage: String,
    val waitingNetwork: String,
    val pause: String,
    val resume: String,
    val close: String,
    val stop: String,
    val cancel: String,
    val hangUp: String,
    val mute: String,
    val unmute: String,
    val sentOfTotal: (sent: Int, total: Int) -> String,
    val remaining: (Int) -> String,
)

/**
 * **Chaque état d'une activité donne un plan**, miroir des quatre Live Activities iOS. Aucun plan ne
 * porte le texte d'un message : un vocal protégé (éphémère, vue unique, flouté, chiffré) dit un libellé
 * neutre à la place de la conversation, et l'envoi ne nomme que le TYPE de ce qui part.
 */
object LiveActivityPlans {

    fun fraction(position: Long, duration: Long): Double? =
        if (duration <= 0L) null else (position.toDouble() / duration.toDouble()).coerceIn(0.0, 1.0)

    fun outbox(snapshot: OutboxActivitySnapshot, labels: LiveActivityLabels): LiveActivityPlan {
        val waiting = snapshot.phase == OutboxActivityPhase.WaitingForNetwork
        val ended = snapshot.phase == OutboxActivityPhase.Sent || snapshot.phase == OutboxActivityPhase.Failed
        val counted = snapshot.total > 1 && !ended
        return LiveActivityPlan(
            kind = OngoingActivityKind.Outbox,
            title = snapshot.label,
            detail = when {
                waiting -> labels.waitingNetwork
                counted -> labels.sentOfTotal(snapshot.sent.coerceAtMost(snapshot.total), snapshot.total)
                snapshot.remaining > 1 -> labels.remaining(snapshot.remaining)
                else -> null
            },
            progress = if (counted && !waiting) fraction(snapshot.sent.toLong(), snapshot.total.toLong()) else null,
            indeterminate = !ended && !waiting && !counted,
            actions = if (ended) emptyList() else listOf(LiveActivityAction(LiveActivityCommand.OutboxCancel, labels.cancel)),
            isOngoing = !ended,
            isError = snapshot.phase == OutboxActivityPhase.Failed,
        )
    }

    fun recording(snapshot: VoiceRecordingSnapshot, labels: LiveActivityLabels): LiveActivityPlan = LiveActivityPlan(
        kind = OngoingActivityKind.Recording,
        title = snapshot.statusLabel,
        chronometerFromEpochMs = snapshot.startedAtEpochMs,
        actions = if (snapshot.isFinished) {
            emptyList()
        } else {
            listOf(
                LiveActivityAction(LiveActivityCommand.RecordingStop, labels.stop),
                LiveActivityAction(LiveActivityCommand.RecordingCancel, labels.cancel),
            )
        },
        isOngoing = !snapshot.isFinished,
    )

    fun playback(snapshot: VoicePlaybackSnapshot, labels: LiveActivityLabels): LiveActivityPlan = LiveActivityPlan(
        kind = OngoingActivityKind.Playback,
        title = snapshot.title,
        detail = if (snapshot.isProtected) labels.protectedMessage else snapshot.subtitle,
        progress = fraction(snapshot.positionMs, snapshot.durationMs),
        actions = listOf(
            LiveActivityAction(
                LiveActivityCommand.PlaybackToggle,
                if (snapshot.isPlaying) labels.pause else labels.resume,
            ),
            LiveActivityAction(LiveActivityCommand.PlaybackClose, labels.close),
        ),
    )

    fun call(snapshot: CallActivitySnapshot, labels: LiveActivityLabels): LiveActivityPlan = LiveActivityPlan(
        kind = OngoingActivityKind.Call,
        title = snapshot.title,
        detail = snapshot.statusLabel,
        chronometerFromEpochMs = snapshot.connectedSinceEpochMs.takeIf { snapshot.phase == CallActivityPhase.Connected },
        actions = if (snapshot.phase == CallActivityPhase.Ended) {
            emptyList()
        } else {
            listOf(
                LiveActivityAction(LiveActivityCommand.CallHangUp, labels.hangUp),
                LiveActivityAction(LiveActivityCommand.CallToggleMute, if (snapshot.isMuted) labels.unmute else labels.mute),
            )
        },
        isOngoing = snapshot.phase != CallActivityPhase.Ended,
    )
}
