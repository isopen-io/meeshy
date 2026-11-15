package me.meeshy.sdk.model.audioedit

import kotlin.math.abs
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Une étape d'édition audio réversible et non destructive — miroir de
 * `AudioEditOperation` (iOS). Une opération ne porte aucune donnée audio : le moteur la
 * rend en fichier, le [AudioEditDocument] garde l'historique.
 */
@Serializable
public sealed interface AudioEditOperation {

    /** La source intacte : toujours la version 0 d'un document. */
    @Serializable
    @SerialName("original")
    public data object Original : AudioEditOperation

    /** Garde `[start, end]` (secondes), jette le reste. */
    @Serializable
    @SerialName("trim")
    public data class Trim(val start: Double, val end: Double) : AudioEditOperation

    /** Retire `[start, end]` (secondes) en gardant la tête et la queue. */
    @Serializable
    @SerialName("removeRange")
    public data class RemoveRange(val start: Double, val end: Double) : AudioEditOperation

    /** Fondu au début et/ou à la fin. */
    @Serializable
    @SerialName("fade")
    public data class Fade(val fadeIn: Boolean, val fadeOut: Boolean) : AudioEditOperation

    /** Change la vitesse (0,25 à 3,0), la hauteur est conservée. */
    @Serializable
    @SerialName("speed")
    public data class Speed(val rate: Double) : AudioEditOperation

    /** Multiplie le volume (0 à 4) ; 1,0 ne change rien. */
    @Serializable
    @SerialName("gain")
    public data class Gain(val multiplier: Double) : AudioEditOperation

    /** `true` quand l'opération laisserait l'audio identique. */
    public val isIdentity: Boolean
        get() = when (this) {
            Original -> true
            is Fade -> !fadeIn && !fadeOut
            is Speed -> abs(rate - 1.0) < IDENTITY_EPSILON
            is Gain -> abs(multiplier - 1.0) < IDENTITY_EPSILON
            is Trim, is RemoveRange -> false
        }

    public companion object {
        public const val IDENTITY_EPSILON: Double = 0.001
    }
}
