package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Un mot-dièse et son usage — `GET /hashtags/trending` rend `[{ tag, usageCount }]`. */
@Serializable
data class ApiHashtag(
    val tag: String,
    val usageCount: Int = 0,
)

/** Une cellule de la carte de densité « À proximité » (`GET /posts/nearby/density`). */
@Serializable
data class NearbyDensityCell(
    val cellLat: Double,
    val cellLng: Double,
    val count: Int = 0,
)

/**
 * Les seuls pas de grille que la passerelle sait rendre : elle cale tout `cellSizeKm` reçu sur l'un
 * d'eux sans le dire. Demander 37 km rendrait des cellules de 100 km étiquetées 37.
 */
enum class NearbyDensityCellSize(val kilometers: Double) {
    NEIGHBORHOOD(1.0),
    CITY(10.0),
    REGION(100.0),
}

/**
 * Le reçu de `POST /posts/{id}/share` : le compteur est toujours là ; [shortUrl] et [token] ne
 * viennent que si l'appelant a demandé un lien suivi (`generateLink`).
 */
@Serializable
data class PostShareResult(
    val shared: Boolean = false,
    val shareCount: Int = 0,
    val shortUrl: String? = null,
    val token: String? = null,
)

/** Le reçu de `POST /social/events` : ce qui a été écrit, ce qui a été écarté. */
@Serializable
data class SocialEventsReceipt(
    val recorded: Int = 0,
    val rejected: Int = 0,
)

/** Le reçu d'un geste de modération de publications — seuls les champs lus. */
@Serializable
data class PublicationModerationReceipt(
    val action: String? = null,
    val results: List<Result> = emptyList(),
) {
    @Serializable
    data class Result(val postId: String, val outcome: String)

    /** `updated` : appliqué ; `unchanged` : la publication était déjà dans l'état visé. */
    fun isApplied(postId: String): Boolean =
        results.firstOrNull { it.postId == postId }?.outcome in APPLIED_MODERATION_OUTCOMES
}

/**
 * Hors du type : un `private companion object` sur une classe `@Serializable` porte aussi son
 * `serializer()`, que Retrofit ne peut plus atteindre par réflexion.
 */
private val APPLIED_MODERATION_OUTCOMES = setOf("updated", "unchanged")
