package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.routes.ApiRoutesLens
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Le partenaire VÉRIFIÉ d'une lens (#11327). [id] est l'identifiant OPAQUE de son profil — jamais son compte — et
 * l'adresse de son logo (`lens/partners/{partnerId}/logo`, une image consommée par son URL).
 */
@Serializable
data class LensCreditPartner(
    val id: String,
    val name: String,
    val logo: String? = null,
)

/** Ce que le filigrane compose : celui de Meeshy toujours, le logo du partenaire vérifié en plus (#11251). */
@Serializable
data class LensCreditWatermark(
    val meeshy: Boolean = true,
    val partnerLogo: String? = null,
)

/** « Lens par X » d'une lens publiée ; [partner] nul quand son auteur n'a pas d'identité vérifiée. */
@Serializable
data class LensCredit(
    val slug: String,
    val name: String,
    val partner: LensCreditPartner? = null,
    val watermark: LensCreditWatermark = LensCreditWatermark(),
)

/** Une surface où la lens a joué : `camera`, `story`, `message`, `call`. */
@Serializable
data class LensUsageBody(val surface: String)

/** `counted: false` : le dédoublonnage n'a pas répondu, rien n'a été compté (k-anonymat). */
@Serializable
data class LensUsageRecorded(val counted: Boolean)

/**
 * Le crédit des médias reçus et le comptage de l'usage d'une lens (#11327) — la couche réseau que #14096 branchera
 * sur la bulle et la caméra. La gestion du profil partenaire et sa vérification vivent dans la console web.
 */
interface LensCreditApi {
    /** [slugs] séparés par des virgules (au plus 50), ceux que portent les médias reçus (`lensSlug`). */
    @GET(ApiRoutesLens.CREDITS)
    suspend fun credits(@Query("slugs") slugs: String): ApiResponse<List<LensCredit>>

    @POST(ApiRoutesLens.USAGE_BY_SLUG)
    suspend fun recordUsage(
        @Path("slug") slug: String,
        @Body body: LensUsageBody,
    ): ApiResponse<LensUsageRecorded>
}
