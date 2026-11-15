package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.serialization.LossyListSerializer

/**
 * Une arrivée par un lien de partage — miroir de `ShareLinkArrivalEntry` et `ShareLinkArrivalStats.Arrival` (iOS).
 *
 * Tolérante : un champ absent ne fait pas échouer la ligne. `participantId` n'existe que dans les
 * statistiques ; la liste complète ne sert ni identifiant ni visage, donc l'identité d'une ligne est
 * ce qu'elle montre ([key]).
 */
@Serializable
data class ShareLinkArrivalEntry(
    val participantId: String? = null,
    val displayName: String = "",
    val avatar: String? = null,
    val language: String? = null,
    val country: String? = null,
    val isAnonymous: Boolean = false,
    val joinedAt: String = "",
) {
    val joinedAtMillis: Long get() = isoToEpochMillis(joinedAt)

    /** Deux arrivées indiscernables à l'écran n'en font qu'une. */
    val key: String
        get() = listOf(joinedAtMillis, displayName, if (isAnonymous) "1" else "0", country.orEmpty(), language.orEmpty())
            .joinToString("\u001F")
}

object LossyShareLinkArrivalsSerializer :
    kotlinx.serialization.KSerializer<List<ShareLinkArrivalEntry>> by LossyListSerializer(ShareLinkArrivalEntry.serializer())

/** Une page des arrivées d'un lien, la plus récente d'abord ; `nextCursor` est celui que la passerelle a rendu. */
@Serializable
data class ShareLinkArrivalsPage(
    @Serializable(with = LossyShareLinkArrivalsSerializer::class)
    val arrivals: List<ShareLinkArrivalEntry> = emptyList(),
    val nextCursor: String? = null,
) {
    val cursorOrNull: String? get() = nextCursor?.takeIf { it.isNotEmpty() }
}

@Serializable
data class ShareLinkLanguageCount(val language: String = "", val count: Int = 0)

@Serializable
data class ShareLinkCountryCount(val country: String = "", val count: Int = 0)

/** Visites, arrivées, langues et pays des arrivants d'UN lien (`GET /links/:linkId/stats`). */
@Serializable
data class ShareLinkArrivalStats(
    val visits: Int = 0,
    val arrivals: Int = 0,
    val anonymousArrivals: Int = 0,
    val arrivalsByLanguage: List<ShareLinkLanguageCount> = emptyList(),
    val arrivalsByCountry: List<ShareLinkCountryCount> = emptyList(),
    @Serializable(with = LossyShareLinkArrivalsSerializer::class)
    val recentArrivals: List<ShareLinkArrivalEntry> = emptyList(),
) {
    /** Les langues des arrivants, en parts du total. */
    val languageShares: List<InviteLanguageShare>
        get() = InviteLanguageShare.weighted(arrivalsByLanguage.map { it.language to it.count })
}

/** La section « Arrivées » de la fiche d'un lien : ses bornes. */
object ShareLinkArrivalsSection {
    /** Combien d'arrivées récentes la carte montre ; au-delà, « Voir les N arrivées » ouvre la liste complète. */
    const val RECENT_LIMIT = 8

    fun showsSeeAll(stats: ShareLinkArrivalStats): Boolean =
        stats.arrivals > minOf(stats.recentArrivals.size, RECENT_LIMIT)
}

/** Les trois états des statistiques d'un lien : jamais un indicateur éternel. */
sealed interface ShareLinkStatsState {
    data object Loading : ShareLinkStatsState
    data object Unavailable : ShareLinkStatsState
    data class Loaded(val stats: ShareLinkArrivalStats) : ShareLinkStatsState

    companion object {
        fun of(stats: ShareLinkArrivalStats?, refreshFailed: Boolean): ShareLinkStatsState = when {
            stats != null -> Loaded(stats)
            refreshFailed -> Unavailable
            else -> Loading
        }
    }
}
