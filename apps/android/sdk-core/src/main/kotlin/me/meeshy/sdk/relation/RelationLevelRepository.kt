package me.meeshy.sdk.relation

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.RelationsApi
import me.meeshy.sdk.net.apiCall

/**
 * Le niveau de lien servi par `GET /relations/:userId` (#13998). Toute panne — réseau, refus, enveloppe en échec,
 * réponse illisible — rend `null` : l'appelant ne peint alors aucun logo, il ne devine jamais un niveau. Le budget de
 * temps reste celui de l'appelant (`StoryExportBrandResolver`).
 */
@Singleton
class RelationLevelRepository @Inject constructor(
    private val api: RelationsApi,
) : RelationLevelProvider {
    override suspend fun servedLevel(userId: String): String? =
        (apiCall { api.byUserId(userId) } as? NetworkResult.Success)?.data?.effectiveLevel
}
