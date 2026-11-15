package me.meeshy.sdk.model.ongoing

import kotlin.math.abs

/**
 * **Quand l'activité d'un vocal en lecture s'ouvre, ce qu'elle montre et quand elle se ferme** —
 * miroir de iOS `VoicePlaybackActivityLaw` (#9783). Pure : l'état entre, une action sort.
 *
 *  - la progression ne réveille pas l'activité à chaque tic : la position est datée, la loi ne met à
 *    jour qu'aux ruptures — pause, reprise, piste, langue, débit, et SAUT (une position qui s'écarte
 *    de la projection de plus de [SEEK_TOLERANCE_MS]) ;
 *  - la langue affichée est celle de la piste jouée, élue par la langue du texte SERVI (Prisme) :
 *    l'appelant la fournit, la loi ne redescend rien ;
 *  - un message protégé (éphémère, vue unique, flouté, chiffré) dit un libellé neutre à la place de la
 *    conversation : aucun texte du message ne part vers l'écran verrouillé.
 */
object VoicePlaybackActivityLaw {

    const val SEEK_TOLERANCE_MS: Long = 1_500L
    const val SKIP_MS: Long = 15_000L

    data class Track(
        val attachmentId: String,
        val messageId: String,
        val conversationId: String,
        val conversationName: String,
        val senderName: String,
        val accentHex: String,
        val isProtected: Boolean,
        val trackLanguage: String?,
        val isTranslatedTrack: Boolean,
        val durationHintMs: Long,
    )

    data class Input(
        val track: Track?,
        val isPlaying: Boolean,
        val positionMs: Long,
        val durationMs: Long,
        val rate: Double,
        val upNextCount: Int,
        val nowEpochMs: Long,
    )

    data class Wording(val voiceMessage: String, val protectedMessage: String)

    sealed interface Action {
        data object None : Action
        data class Start(val snapshot: VoicePlaybackPresentation) : Action
        data class Update(val snapshot: VoicePlaybackPresentation) : Action
        data class End(val snapshot: VoicePlaybackPresentation) : Action
    }

    data class Step(val running: VoicePlaybackPresentation?, val action: Action)

    fun step(running: VoicePlaybackPresentation?, input: Input, wording: Wording): Step {
        val next = snapshot(input, wording)
        if (next == null) {
            if (running == null) return Step(null, Action.None)
            val final = running.copy(
                positionMs = projectedPosition(running, input.nowEpochMs),
                anchorEpochMs = input.nowEpochMs,
                isPlaying = false,
            )
            return Step(null, Action.End(final))
        }
        if (running == null) return Step(next, Action.Start(next))
        if (!needsUpdate(running, next)) return Step(running, Action.None)
        return Step(next, Action.Update(next))
    }

    fun snapshot(input: Input, wording: Wording): VoicePlaybackPresentation? {
        val track = input.track ?: return null
        val duration = if (input.durationMs > 0L) input.durationMs else track.durationHintMs
        val sender = track.senderName.trim()
        return VoicePlaybackPresentation(
            messageId = track.messageId,
            conversationId = track.conversationId,
            title = sender.ifEmpty { wording.voiceMessage },
            subtitle = if (track.isProtected) wording.protectedMessage else track.conversationName,
            initials = CallActivityLaw.initials(sender),
            accentHex = track.accentHex,
            isPlaying = input.isPlaying,
            positionMs = input.positionMs.coerceIn(0L, duration.coerceAtLeast(0L)),
            durationMs = duration.coerceAtLeast(0L),
            rate = if (input.rate > 0.0) input.rate else 1.0,
            anchorEpochMs = input.nowEpochMs,
            trackLanguage = track.trackLanguage?.uppercase(),
            isTranslatedTrack = track.isTranslatedTrack,
            upNextCount = input.upNextCount.coerceAtLeast(0),
        )
    }

    /** Où la barre en est à [atEpochMs], d'après ce que l'activité affiche. */
    fun projectedPosition(snapshot: VoicePlaybackPresentation, atEpochMs: Long): Long {
        if (!snapshot.isPlaying) return snapshot.positionMs
        val elapsed = ((atEpochMs - snapshot.anchorEpochMs).coerceAtLeast(0L) * snapshot.rate).toLong()
        return minOf(snapshot.durationMs, snapshot.positionMs + elapsed)
    }

    /** La fraction que vise un saut de [offsetMs] depuis [positionMs], bornée à la piste ; `null` sans durée. */
    fun seekFraction(positionMs: Long, durationMs: Long, offsetMs: Long): Double? {
        if (durationMs <= 0L) return null
        return ((positionMs + offsetMs).toDouble() / durationMs).coerceIn(0.0, 1.0)
    }

    private fun needsUpdate(running: VoicePlaybackPresentation, next: VoicePlaybackPresentation): Boolean {
        val comparable = next.copy(positionMs = running.positionMs, anchorEpochMs = running.anchorEpochMs)
        if (comparable != running) return true
        return abs(projectedPosition(running, next.anchorEpochMs) - next.positionMs) > SEEK_TOLERANCE_MS
    }
}
