package me.meeshy.sdk.model.ongoing

import me.meeshy.sdk.model.call.CallState

/** La phase d'un appel telle que la surface « appel en cours » la distingue. */
enum class OngoingCallPhase {
    Idle,
    RingingOutgoing,
    RingingIncoming,
    Connecting,
    Connected,
    Reconnecting,
    Ended,
}

/** La phase que montre la surface « appel en cours » (sous-ensemble de [OngoingCallPhase]). */
enum class CallActivityPhase { Ringing, Connecting, Connected, OnHold, Reconnecting, Ended }

/** Une phrase sous-titrée, telle que l'écran d'appel la sert déjà au lecteur. */
data class CallActivityCaption(
    val speaker: String,
    val text: String,
    val languageTag: String? = null,
    val isFinal: Boolean = true,
    val isTranslatedOnDevice: Boolean = false,
)

/** Ce qui est servi à la surface système : jamais plus que ce que la loi autorise. */
data class CallActivitySnapshot(
    val phase: CallActivityPhase,
    val title: String,
    val statusLabel: String,
    val initials: String,
    val isVideo: Boolean,
    val isMuted: Boolean,
    val connectedSinceEpochMs: Long?,
    val showsDurationInCompact: Boolean,
    val caption: CallActivityCaption?,
)

/**
 * **Quand la notification d'appel s'ouvre, ce qu'elle montre et quand elle se retire.**
 * Miroir Android de `CallActivityLaw` (iOS, Live Activity d'appel, #9782) : pure — l'état
 * de l'appel entre, une action sort — pour que la décision se joue sans framework.
 *
 *  - un appel ENTRANT qui sonne n'ouvre rien : l'écran plein écran le porte déjà ;
 *    la notification naît au décroché ;
 *  - quand le système affiche déjà l'appel, le compact ne répète pas la durée ;
 *  - un sous-titre ne part vers une surface système que s'il est SÛR
 *    ([CallSubtitleSafety]).
 */
object CallActivityLaw {

    data class Input(
        val phase: OngoingCallPhase,
        val title: String,
        val isVideo: Boolean,
        val isMuted: Boolean,
        val isOnHold: Boolean = false,
        val connectedSinceEpochMs: Long? = null,
        val systemShowsCall: Boolean = false,
        val isEndToEndEncrypted: Boolean? = null,
        val captionsActive: Boolean = false,
        val caption: CallActivityCaption? = null,
    )

    data class Wording(
        val ringing: String,
        val connecting: String,
        val audioCall: String,
        val videoCall: String,
        val onHold: String,
        val reconnecting: String,
        val ended: String,
    )

    sealed interface Action {
        data object None : Action
        data class Start(val snapshot: CallActivitySnapshot) : Action
        data class Update(val snapshot: CallActivitySnapshot) : Action
        data class End(val snapshot: CallActivitySnapshot) : Action
    }

    data class Step(val running: CallActivitySnapshot?, val action: Action)

    /** Projection TOTALE de la machine d'états sur les phases de la surface. */
    fun phaseOf(state: CallState): OngoingCallPhase = when (state) {
        is CallState.Idle -> OngoingCallPhase.Idle
        is CallState.Ringing ->
            if (state.isOutgoing) OngoingCallPhase.RingingOutgoing else OngoingCallPhase.RingingIncoming
        is CallState.Offering, is CallState.Connecting -> OngoingCallPhase.Connecting
        is CallState.Connected -> OngoingCallPhase.Connected
        is CallState.Reconnecting -> OngoingCallPhase.Reconnecting
        is CallState.Ended -> OngoingCallPhase.Ended
    }

    fun step(running: CallActivitySnapshot?, input: Input, wording: Wording): Step {
        val snapshot = snapshot(input, wording)
            ?: return if (running == null) {
                Step(null, Action.None)
            } else {
                Step(null, Action.End(ended(running, wording)))
            }
        if (running == null) return Step(snapshot, Action.Start(snapshot))
        return Step(snapshot, if (running == snapshot) Action.None else Action.Update(snapshot))
    }

    fun snapshot(input: Input, wording: Wording): CallActivitySnapshot? {
        val phase = activityPhase(input) ?: return null
        return CallActivitySnapshot(
            phase = phase,
            title = input.title,
            statusLabel = statusLabel(phase, input.isVideo, wording),
            initials = initials(input.title),
            isVideo = input.isVideo,
            isMuted = input.isMuted,
            connectedSinceEpochMs = input.connectedSinceEpochMs,
            showsDurationInCompact = !input.systemShowsCall,
            caption = servedCaption(input),
        )
    }

    /**
     * Le sous-titre qui a le droit de partir : sous-titres actifs, phrase FINALE, jamais
     * celle d'un appel chiffré ou inconnu que l'appareil n'a pas traduit lui-même.
     */
    fun servedCaption(input: Input): CallActivityCaption? {
        val caption = input.caption ?: return null
        if (!input.captionsActive || !caption.isFinal) return null
        if (!CallSubtitleSafety.maySurface(input.isEndToEndEncrypted, caption.isTranslatedOnDevice)) return null
        val text = caption.text.trim()
        if (text.isEmpty()) return null
        return caption.copy(text = CallSubtitleSafety.clipped(text))
    }

    /** « Alice Martin » -> « AM » ; une lettre pour un nom simple ; rien pour un nom vide. */
    fun initials(name: String): String =
        name.split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2)
            .joinToString("") { it.first().uppercase() }

    private fun activityPhase(input: Input): CallActivityPhase? = when (input.phase) {
        OngoingCallPhase.Idle, OngoingCallPhase.Ended, OngoingCallPhase.RingingIncoming -> null
        OngoingCallPhase.RingingOutgoing -> CallActivityPhase.Ringing
        OngoingCallPhase.Connecting -> CallActivityPhase.Connecting
        OngoingCallPhase.Connected -> if (input.isOnHold) CallActivityPhase.OnHold else CallActivityPhase.Connected
        OngoingCallPhase.Reconnecting -> CallActivityPhase.Reconnecting
    }

    private fun statusLabel(phase: CallActivityPhase, isVideo: Boolean, wording: Wording): String = when (phase) {
        CallActivityPhase.Ringing -> wording.ringing
        CallActivityPhase.Connecting -> wording.connecting
        CallActivityPhase.Connected -> if (isVideo) wording.videoCall else wording.audioCall
        CallActivityPhase.OnHold -> wording.onHold
        CallActivityPhase.Reconnecting -> wording.reconnecting
        CallActivityPhase.Ended -> wording.ended
    }

    private fun ended(running: CallActivitySnapshot, wording: Wording): CallActivitySnapshot =
        running.copy(phase = CallActivityPhase.Ended, statusLabel = wording.ended, caption = null)
}
