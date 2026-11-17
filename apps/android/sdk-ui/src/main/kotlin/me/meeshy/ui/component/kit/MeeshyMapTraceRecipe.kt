package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

@Immutable
public data class MeeshyMapTraceValues(
    val kind: MeeshyMapTraceKind,
    val dotDp: Float,
    val dotEveryDp: Float,
    val strokeDp: Float,
    val casingDp: Float,
    val haloDp: Float,
    val casingOpacity: Float,
    val opacity: Float,
    val flows: Boolean,
    val progress: Float?,
    val hasHead: Boolean,
    val showsMidLabel: Boolean,
    val flowMillis: Int,
)

/**
 * K54 · la loi du tracé de carte : un chemin entre des points d'écran déjà projetés, à la teinte donnée, sur un liseré
 * sombre. Il relie, il ne sait pas par où passer : itinéraire, distance, durée et projection sont à l'hôte.
 * Jumeau iOS : `MeeshyMapTrace`.
 */
public object MeeshyMapTraceRecipe {
    public const val LINK_DP: Float = 2.5f
    public const val HISTORY_DP: Float = 7f
    public const val HALO_DP: Float = 16f
    public const val CASING_OPACITY: Float = 0.55f
    public const val CASING_OPACITY_LIGHT: Float = 0.7f
    public const val STALE_OPACITY: Float = 0.6f
    public const val MIN_MID_LABEL_LENGTH_DP: Float = 96f
    public const val FLOW_MILLIS: Int = 1400
    public const val MID_GAP_DP: Float = 12f
    public const val UPCOMING_OPACITY: Float = 0.3f
    public const val HEAD_DP: Float = 14f
    public const val NODE_DP: Float = 12f

    @Suppress("LongParameterList")
    public fun resolve(
        kind: MeeshyMapTraceKind,
        weight: MeeshyMapTraceWeight = MeeshyMapTraceWeight.Regular,
        progress: Float? = null,
        isStale: Boolean = false,
        isAnimated: Boolean = true,
        onLightMap: Boolean = false,
        reduceMotion: Boolean = false,
        length: Float? = null,
    ): MeeshyMapTraceValues {
        val large = weight == MeeshyMapTraceWeight.Large
        val dot = if (large) 4.5f else 4f
        val bounded = progress?.takeIf { it.isFinite() }?.coerceIn(0f, 1f)
        return MeeshyMapTraceValues(
            kind = kind,
            dotDp = dot,
            dotEveryDp = if (large) 11f else 10f,
            strokeDp = when (kind) {
                MeeshyMapTraceKind.Link -> LINK_DP
                MeeshyMapTraceKind.History -> HISTORY_DP
                MeeshyMapTraceKind.Route -> dot
            },
            casingDp = if (large) 8f else 7f,
            haloDp = HALO_DP,
            casingOpacity = if (onLightMap) CASING_OPACITY_LIGHT else CASING_OPACITY,
            opacity = if (isStale) STALE_OPACITY else 1f,
            flows = kind == MeeshyMapTraceKind.Route && !isStale && isAnimated && !reduceMotion,
            progress = bounded,
            hasHead = bounded != null,
            showsMidLabel = length == null || length >= MIN_MID_LABEL_LENGTH_DP,
            flowMillis = FLOW_MILLIS,
        )
    }
}
