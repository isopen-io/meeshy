package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.net.api.CreateStoryRequest

/**
 * Ce qui qualifie la requête d'une slide selon le format ciblé (miroir de `targetTypePayload` / `alsoAsReelPayload` d'iOS,
 * #9476) : le TYPE que le serveur pose, et « aussi en réel », que le serveur n'accepte qu'avec une story.
 */
internal object StoryPublishRequestBuilder {

    /** Le réel n'accompagne qu'une STORY non republiée : demandé sous un autre type ou sur un repost, il ne part pas. */
    fun publishedAlsoAsReel(requested: Boolean, format: ComposerFormat, repostOfId: String?): Boolean =
        requested && format == ComposerFormat.STORY && repostOfId.isNullOrBlank()

    /** La requête portant le type du format ciblé, et `alsoAsReel` seulement s'il part (jamais `false` sur le fil). */
    fun targeting(request: CreateStoryRequest, format: ComposerFormat, alsoAsReel: Boolean = false): CreateStoryRequest =
        request.copy(
            type = format.postType.name,
            alsoAsReel = true.takeIf { publishedAlsoAsReel(alsoAsReel, format, request.repostOfId) },
        )
}
