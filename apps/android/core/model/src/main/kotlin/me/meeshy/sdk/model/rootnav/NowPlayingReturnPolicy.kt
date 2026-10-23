package me.meeshy.sdk.model.rootnav

/** Le contexte audio actif : la conversation et le message dont la piste joue. */
data class ActiveAudioContext(val conversationId: String, val messageId: String)

data class NowPlayingReturnTarget(val conversationId: String, val messageId: String)

/**
 * Retour depuis la notification media : Android n'emet aucun signal dedie, le signal exploitable
 * est « retour au premier plan apres un VRAI passage en arriere-plan, pendant qu'un audio de
 * conversation JOUE ». Miroir de iOS `NowPlayingReturnPolicy`.
 */
object NowPlayingReturnPolicy {

    /**
     * `null` = ne pas naviguer : lecture a l'arret ou en pause (une file en pause peut trainer des
     * heures), pas de contexte, ou id porteur qui n'est pas une conversation connue (l'audio d'un
     * post ou d'un commentaire voyage avec l'id du post).
     */
    fun target(
        context: ActiveAudioContext?,
        isPlaying: Boolean,
        isKnownConversation: (String) -> Boolean,
    ): NowPlayingReturnTarget? {
        if (!isPlaying || context == null) return null
        if (!isKnownConversation(context.conversationId)) return null
        return NowPlayingReturnTarget(context.conversationId, context.messageId)
    }

    /** Toucher le mini-lecteur navigue meme en pause : le geste est explicite. */
    fun miniPlayerTarget(context: ActiveAudioContext?): NowPlayingReturnTarget? {
        if (context == null || context.conversationId.isEmpty()) return null
        return NowPlayingReturnTarget(context.conversationId, context.messageId)
    }
}

/** Ne navigue que sur un retour depuis un vrai arriere-plan, jamais sur un simple passage inactif. */
class BackgroundReturnTracker {
    private var wasBackgrounded = false

    fun onEnteredBackground() {
        wasBackgrounded = true
    }

    /** Vrai une seule fois par passage en arriere-plan. */
    fun onBecameActive(): Boolean {
        if (!wasBackgrounded) return false
        wasBackgrounded = false
        return true
    }
}
