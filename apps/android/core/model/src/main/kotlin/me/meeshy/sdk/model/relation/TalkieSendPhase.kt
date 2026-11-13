package me.meeshy.sdk.model.relation

/** Où en est une prise de parole émise (#17150, iso `TalkieSender.Phase`). */
public sealed interface TalkieSendPhase {
    public data object Idle : TalkieSendPhase

    public data class Starting(val toUserId: String) : TalkieSendPhase

    public data class Talking(val toUserId: String, val talkieId: String) : TalkieSendPhase

    /** Le talkie n'a pas pu passer : la voix s'enregistre pour partir en message vocal. */
    public data class RecordingCopy(val toUserId: String) : TalkieSendPhase
}

/**
 * L'apparence d'un bouton talkie (#17093) : enfoncé dès que le doigt se pose, sans attendre le réseau ; vivant tant que
 * la voix part ; au repos sinon.
 */
public enum class TalkieHoldLook {
    IDLE,
    PRESSED,
    LIVE,
    ;

    public companion object {
        /** En deçà, l'appui était un toucher : on rappelle qu'il faut maintenir. */
        public const val QUICK_TAP_LIMIT_MS: Long = 300L

        public fun resolve(pressed: Boolean, phase: TalkieSendPhase): TalkieHoldLook = when {
            phase is TalkieSendPhase.Talking || phase is TalkieSendPhase.RecordingCopy -> LIVE
            pressed -> PRESSED
            else -> IDLE
        }

        public fun isQuickTap(heldForMs: Long): Boolean = heldForMs < QUICK_TAP_LIMIT_MS
    }
}

/**
 * Quand le talkie se propose (#16927, #17093) : dès Proche ; jamais dans l'en-tête d'un direct chiffré, que la passerelle
 * refuse, ni dans un aperçu.
 */
public object TalkieOfferRule {
    public fun offers(link: RelationLink): Boolean = offers(link.effectiveLevel)

    public fun offers(level: RelationLevel): Boolean = level >= RelationLevel.CLOSE

    public fun mayShowInHeader(encryptionMode: String?, isPreview: Boolean = false): Boolean =
        encryptionMode != "e2ee" && !isPreview
}
