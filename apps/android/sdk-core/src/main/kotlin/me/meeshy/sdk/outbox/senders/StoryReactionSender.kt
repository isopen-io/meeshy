package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.StoryLikeRequest
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendFailureClassifier
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.StoryReactionPayload
import me.meeshy.sdk.outbox.withPayload
import me.meeshy.sdk.story.StoryReactionOutcome
import javax.inject.Inject

/**
 * `REACT_STORY` : rejoue la réaction de story posée hors ligne (`POST /posts/:id/like`, l'emoji dans le corps).
 * Le 409 `REACTION_LIMIT_REACHED` est un REFUS que rejouer ne changerait pas (le classeur commun le tiendrait pour
 * transitoire) : la ligne s'épuise tout de suite. Le reste suit le classeur commun (réseau, 401, 5xx rejoués ; 403, 404 définitifs).
 */
public class ReactStoryHandler @Inject constructor(
    private val storyApi: StoryApi,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<StoryReactionPayload>(row) { body ->
            when (val result = apiCall { storyApi.react(row.targetId, StoryLikeRequest(body.emoji)) }) {
                is NetworkResult.Success -> SendResult.Success
                is NetworkResult.Failure ->
                    if (result.error.code == StoryReactionOutcome.LIMIT_REACHED_CODE) {
                        SendResult.PermanentFailure("Refused: HTTP ${result.error.httpStatus ?: 409} ${StoryReactionOutcome.LIMIT_REACHED_CODE}")
                    } else {
                        SendFailureClassifier.classify(result.error)
                    }
            }
        }
}

@Module
@InstallIn(SingletonComponent::class)
public interface StoryReactionSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.REACT_STORY)
    public fun reactStory(handler: ReactStoryHandler): OutboxKindHandler
}
