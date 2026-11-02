package me.meeshy.app.stories

import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject

/** Une story telle que la passerelle la sert : le post, et son blob `storyEffects` tel qu'elle le tient. */
internal data class ServedStory(val post: ApiPost, val effects: ServedStoryEffects)

/**
 * Relit une story à la passerelle pour l'éditer (#13632) : UNE requête, dont le post se décode comme toute lecture et
 * dont le blob `storyEffects` est gardé brut — la seule base d'où l'enregistrement peut réécrire la story sans perdre ce
 * que le modèle Android ne tient pas. `null` : injoignable, ou réponse illisible.
 */
internal class StoryServedReader @Inject constructor(private val api: PostApi) {

    suspend fun read(storyId: String): ServedStory? {
        val served = (apiCall { api.getPostDocument(storyId) } as? NetworkResult.Success)?.data ?: return null
        val post = runCatching { MeeshyApi.json.decodeFromJsonElement(ApiPost.serializer(), served) }.getOrNull() ?: return null
        return ServedStory(post, ServedStoryEffects(served["storyEffects"] as? JsonObject))
    }
}
