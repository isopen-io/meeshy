package me.meeshy.sdk.model.scene

public enum class EditClockRegime { FULL, IDLE }

/**
 * Décision de repos de l'horloge d'édition à haute cadence — miroir d'`EditClockThrottle.swift` (#3906).
 * Une scène ouverte sans interaction ne tient plus l'écran à pleine cadence après [DEFAULT_IDLE_DELAY_SECONDS].
 * Un média explicitement lancé par l'utilisateur garde toujours le plein régime ; une horloge qui recule se lit
 * « encore dans la grâce ». Le repos ne suspend ni l'image ni le son (#13864).
 */
public object SceneEditClockThrottle {
    public const val DEFAULT_IDLE_DELAY_SECONDS: Double = 4.0

    public fun regime(
        now: Double,
        lastInteractionAt: Double,
        isMediaActivelyPlaying: Boolean,
        idleDelay: Double = DEFAULT_IDLE_DELAY_SECONDS,
    ): EditClockRegime {
        if (isMediaActivelyPlaying) return EditClockRegime.FULL
        return if (now - lastInteractionAt >= idleDelay) EditClockRegime.IDLE else EditClockRegime.FULL
    }

    /** Un canvas préchargé (invisible, non interactif) n'arme aucun lien d'édition. */
    public fun shouldArm(isEditing: Boolean, isInteractive: Boolean): Boolean = isEditing && isInteractive
}
