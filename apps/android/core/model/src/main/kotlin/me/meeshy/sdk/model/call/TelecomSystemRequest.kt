package me.meeshy.sdk.model.call

/**
 * Ce que l'interface téléphonique du système (écran verrouillé, casque Bluetooth, montre,
 * voiture) demande à l'appel de Meeshy. Vocabulaire sans framework : la colle l'émet, la loi
 * [TelecomRequestPolicy] décide quoi en faire. Miroir Android des actions `CXAction` d'iOS.
 */
public sealed interface TelecomSystemRequest {
    /** Décrocher l'appel entrant. */
    public data object Answer : TelecomSystemRequest

    /** Raccrocher (ou refuser) depuis le système : ce chemin-là, et lui seul, envoie `call:end`. */
    public data object Disconnect : TelecomSystemRequest

    /** Le système met l'appel en attente ([onHold] = vrai) ou le reprend. */
    public data class Hold(val onHold: Boolean) : TelecomSystemRequest

    /** Le micro a été coupé ou rétabli depuis le système. */
    public data class Mute(val muted: Boolean) : TelecomSystemRequest
}

/** Pourquoi le système a mis fin à la connexion, au niveau de précision dont la loi a besoin. */
public enum class TelecomSystemDisconnectKind { Local, Remote, Rejected, Missed, Busy, Canceled, Restricted, Error, Unknown }

/**
 * Qui a mis fin à la connexion système : l'utilisateur (Local, Rejected : bouton raccrocher du
 * casque, de la montre ou de l'écran verrouillé) ou le système lui-même (destruction, restriction,
 * erreur : équivalent de `providerDidReset` sur iOS). Seul le premier cas devient une demande :
 * une destruction par le système n'émet jamais `call:end`, la grâce serveur décide.
 */
public object TelecomSystemDisconnectLaw {
    public fun requestFor(kind: TelecomSystemDisconnectKind): TelecomSystemRequest? = when (kind) {
        TelecomSystemDisconnectKind.Local,
        TelecomSystemDisconnectKind.Rejected,
        -> TelecomSystemRequest.Disconnect
        TelecomSystemDisconnectKind.Remote,
        TelecomSystemDisconnectKind.Missed,
        TelecomSystemDisconnectKind.Busy,
        TelecomSystemDisconnectKind.Canceled,
        TelecomSystemDisconnectKind.Restricted,
        TelecomSystemDisconnectKind.Error,
        TelecomSystemDisconnectKind.Unknown,
        -> null
    }
}

/**
 * Loi pure : une demande du système + l'état de l'appel => l'action de l'appel. Le micro mis en
 * attente par le système est rétabli à la reprise, jamais un micro coupé par l'utilisateur.
 */
public object TelecomRequestPolicy {

    public sealed interface Action {
        public data object None : Action
        public data object Answer : Action
        public data object Decline : Action
        public data object HangUp : Action

        /** Amener le micro à [muted] ; [byHold] = la coupure vient de la mise en attente. */
        public data class SetMuted(val muted: Boolean, val byHold: Boolean) : Action
    }

    public fun actionFor(
        request: TelecomSystemRequest,
        state: CallState,
        isMuted: Boolean,
        mutedByHold: Boolean,
    ): Action = when (request) {
        TelecomSystemRequest.Answer ->
            if (state is CallState.Ringing && !state.isOutgoing) Action.Answer else Action.None
        TelecomSystemRequest.Disconnect -> when {
            state is CallState.Ringing && !state.isOutgoing -> Action.Decline
            state.isActive -> Action.HangUp
            else -> Action.None
        }
        is TelecomSystemRequest.Mute ->
            if (state.isActive && request.muted != isMuted) Action.SetMuted(request.muted, byHold = false) else Action.None
        is TelecomSystemRequest.Hold -> when {
            !state.isActive -> Action.None
            request.onHold && !isMuted -> Action.SetMuted(true, byHold = true)
            !request.onHold && mutedByHold -> Action.SetMuted(false, byHold = false)
            else -> Action.None
        }
    }
}
