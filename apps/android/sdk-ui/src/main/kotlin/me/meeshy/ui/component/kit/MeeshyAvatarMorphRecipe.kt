package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

public enum class MeeshyAvatarMorphPath { Auto, Straight, Arc }

public enum class MeeshyAvatarMorphMode { Shared, Driven, Crossfade }

@Immutable
public data class MeeshyAvatarMorphValues(
    val mode: MeeshyAvatarMorphMode,
    val path: MeeshyAvatarMorphPath,
    val durationMillis: Int,
    val progress: Float?,
    val scaleFrom: Float,
    val scaleTo: Float,
    val ringInFlight: Boolean,
    val badgeInFlight: Boolean,
    val badgeLeadMillis: Int,
    val badgeReturnMillis: Int,
)

@Immutable
public data class MeeshyAvatarMorphJewels(val ringGapDp: Float, val badgeDp: Float)

/**
 * K29 · la loi de l'avatar qui voyage : un seul avatar relie deux emplacements qui portent la même identité dans la même
 * portée, jamais deux. Le composant transporte, il ne dessine rien. Sans portée, sans capacité ou sous mouvement réduit :
 * fondu enchaîné sur place. Jumeau iOS : `MeeshyAvatarMorph`.
 */
public object MeeshyAvatarMorphRecipe {
    public const val BAR: Int = 36
    public const val ROW: Int = 44
    public const val PIN: Int = 56
    public const val HERO: Int = 112
    public const val DURATION_MILLIS: Int = 560
    public const val BADGE_LEAD_MILLIS: Int = 80
    public const val BADGE_RETURN_MILLIS: Int = 120
    private const val RING_GAP_RATIO: Float = 0.045f
    private const val RING_GAP_MIN_DP: Float = 2f
    private const val BADGE_RATIO: Float = 0.25f
    private const val BADGE_MIN_DP: Float = 14f

    private fun resolvePath(requested: MeeshyAvatarMorphPath, from: Int, to: Int, dx: Float?, dy: Float?): MeeshyAvatarMorphPath {
        if (requested != MeeshyAvatarMorphPath.Auto) return requested
        if (dx == null || dy == null) return MeeshyAvatarMorphPath.Straight
        return if (min(abs(dx), abs(dy)) > max(from, to) / 2f) MeeshyAvatarMorphPath.Arc else MeeshyAvatarMorphPath.Straight
    }

    @Suppress("LongParameterList")
    public fun resolve(
        from: Int,
        to: Int,
        hasScope: Boolean,
        canTravel: Boolean = false,
        requestedPath: MeeshyAvatarMorphPath = MeeshyAvatarMorphPath.Auto,
        progress: Float? = null,
        reduceMotion: Boolean = false,
        ringTravels: Boolean = false,
        badgeTravels: Boolean = false,
        displacementX: Float? = null,
        displacementY: Float? = null,
    ): MeeshyAvatarMorphValues {
        val bounded = progress?.takeIf { it.isFinite() }?.coerceIn(0f, 1f)
        val mode = when {
            !hasScope || reduceMotion -> MeeshyAvatarMorphMode.Crossfade
            bounded != null -> MeeshyAvatarMorphMode.Driven
            canTravel -> MeeshyAvatarMorphMode.Shared
            else -> MeeshyAvatarMorphMode.Crossfade
        }
        val big = max(max(from, to), 1).toFloat()
        return MeeshyAvatarMorphValues(
            mode = mode,
            path = resolvePath(requestedPath, from, to, displacementX, displacementY),
            durationMillis = DURATION_MILLIS,
            progress = bounded,
            scaleFrom = from / big,
            scaleTo = to / big,
            ringInFlight = ringTravels,
            badgeInFlight = badgeTravels,
            badgeLeadMillis = BADGE_LEAD_MILLIS,
            badgeReturnMillis = BADGE_RETURN_MILLIS,
        )
    }

    /** Les emplacements autour du contenu : l'anneau à 4,5 % de la taille (2 au moins), la pastille à 25 % (14 au moins). */
    public fun jewels(sizeDp: Float): MeeshyAvatarMorphJewels =
        MeeshyAvatarMorphJewels(
            ringGapDp = max(sizeDp * RING_GAP_RATIO, RING_GAP_MIN_DP),
            badgeDp = max(sizeDp * BADGE_RATIO, BADGE_MIN_DP),
        )
}
