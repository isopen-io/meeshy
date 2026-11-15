package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.story.StoryRepostDestination
import me.meeshy.sdk.model.story.StoryRepostFailure
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.RepostPostRequest
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.RepostPayload
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.withPayload
import me.meeshy.sdk.story.StoryRepository
import javax.inject.Inject

/**
 * `REPOST_POST` (#15067) : republie la source que l'appareil a mise en file, sous le `cmid` de la ligne en
 * `X-Client-Mutation-Id` — le MutationLog de la passerelle resservit le résultat d'un rejeu, une réponse perdue ne
 * republie donc jamais deux fois. Une republication en story rejoint la barre aussitôt. Un refus que la même requête
 * rencontrerait de nouveau, dit par l'enveloppe de la passerelle (source disparue, audience élargie ; un 404 de proxy n'en est pas un), épuise la ligne sans rejeu ; réseau, 401, 408, 429 et 5xx
 * se rejouent. Un 410 `MUTATION_RESULT_GONE` dit que le geste a DÉJÀ été appliqué.
 */
public class RepostPostHandler @Inject constructor(
    private val postApi: PostApi,
    private val json: Json,
    private val storyRepository: StoryRepository,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<RepostPayload>(row) { repost ->
            val request = RepostPostRequest(content = repost.content, isQuote = repost.isQuote, targetType = repost.targetType)
            when (val result = apiCall { postApi.repost(row.targetId, request, row.cmid) }) {
                is NetworkResult.Success -> {
                    if (StoryRepostDestination.fromTargetType(repost.targetType) == StoryRepostDestination.STORY) {
                        runCatching { storyRepository.adoptRepost(result.data) }
                    }
                    SendResult.Success
                }
                is NetworkResult.Failure -> result.error.httpStatus.toRepostFailure(result.error.code)
            }
        }

    private fun Int?.toRepostFailure(code: String?): SendResult = when {
        this == HTTP_GONE && code == MUTATION_RESULT_GONE -> SendResult.Success
        StoryRepostFailure.isFinal(this) && code != "HTTP_$this" -> SendResult.PermanentFailure("Repost refused: HTTP $this")
        else -> SendResult.TransientFailure
    }

    private companion object {
        const val HTTP_GONE = 410
        const val MUTATION_RESULT_GONE = "MUTATION_RESULT_GONE"
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface RepostSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.REPOST_POST)
    public fun repostPost(handler: RepostPostHandler): OutboxKindHandler
}
