package me.meeshy.sdk.model.playback

/** Qui publie la carte du système : le lecteur de l'écran du fil, ou le moteur partagé qui survit à l'écran. */
public enum class VoicePlaybackCardOwner { Screen, Shared }

/** [owner] garde la carte ; [silence] est l'autre publieur, à faire taire (`null` : personne). */
public data class OwnershipDecision(val owner: VoicePlaybackCardOwner, val silence: VoicePlaybackCardOwner?)

/**
 * **Une seule carte à la fois.** Le système n'a qu'une session de lecture : le lecteur de l'écran et le
 * moteur partagé ne la publient jamais ensemble. Celui qui démarre prend la carte et fait taire l'autre ;
 * un publieur en pause ne vole jamais la carte ; un retrait venu d'un non-propriétaire est ignoré (la
 * carte de l'autre ne part pas).
 */
public object VoicePlaybackCardOwnership {

    public fun publish(current: VoicePlaybackCardOwner?, by: VoicePlaybackCardOwner, active: Boolean): OwnershipDecision = when {
        current == null || current == by -> OwnershipDecision(by, silence = null)
        active -> OwnershipDecision(by, silence = current)
        else -> OwnershipDecision(current, silence = null)
    }

    public fun retire(current: VoicePlaybackCardOwner?, by: VoicePlaybackCardOwner): VoicePlaybackCardOwner? =
        if (current == by) null else current

    /** Les ordres du système vont au propriétaire de la carte ; tant que personne ne la tient, au lecteur de l'écran (historique). */
    public fun routeTo(current: VoicePlaybackCardOwner?): VoicePlaybackCardOwner = current ?: VoicePlaybackCardOwner.Screen
}
