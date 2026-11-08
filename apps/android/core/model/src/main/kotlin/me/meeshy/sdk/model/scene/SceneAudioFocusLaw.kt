package me.meeshy.sdk.model.scene

/**
 * Ce que le focus audio fait au mixeur de la scène : une perte TEMPORAIRE (appel, assistant, autre lecteur) le met en
 * attente SANS perdre sa position et il reprend au retour du focus ; une perte DÉFINITIVE (autre application) ou un
 * casque débranché le laisse en pause jusqu'à ce que l'utilisateur relance. Pure : l'hôte traduit les rappels du système.
 */
public class SceneAudioFocusLaw {
    private var transientLoss = false
    private var settled = false

    /** Le mixeur est tenu au silence (sa position est conservée). */
    public val isHeld: Boolean get() = transientLoss || settled

    public fun onFocusLost(): Boolean = hold { transientLoss = true }

    /** Rend `true` quand le son doit REPRENDRE de lui-même (la perte était temporaire et rien d'autre ne le tient). */
    public fun onFocusGained(): Boolean {
        val resumes = transientLoss && !settled
        transientLoss = false
        return resumes
    }

    public fun onFocusLostForGood(): Boolean = hold { settled = true; transientLoss = false }

    /** `ACTION_AUDIO_BECOMING_NOISY` : le casque est débranché, on ne rejoue pas sur le haut-parleur sans demande. */
    public fun onBecomingNoisy(): Boolean = hold { settled = true; transientLoss = false }

    /** L'utilisateur relance : la pause définitive est levée. */
    public fun onUserResume() {
        settled = false
        transientLoss = false
    }

    private inline fun hold(change: () -> Unit): Boolean {
        val was = isHeld
        change()
        return !was
    }
}
