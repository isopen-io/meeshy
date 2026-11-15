package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.health.ReadyProbe
import me.meeshy.sdk.net.NeverRetried
import retrofit2.http.GET

/**
 * La sonde de disponibilité `GET /health/ready` (S0, anonyme) : 200 `{ status: "ready" }` ou 503
 * `not-ready`, sans aucun détail d'infrastructure. **Jamais réessayée** ([NeverRetried]) : un
 * diagnostic qui rejoue un 503 retarde la réponse qu'il doit donner, et le verdict est mémoïsé 2 s
 * côté serveur.
 */
@NeverRetried
interface HealthApi {
    @GET("health/ready")
    suspend fun ready(): ApiResponse<ReadyProbe>
}
