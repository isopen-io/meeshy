package me.meeshy.app.stories

import androidx.annotation.StringRes
import me.meeshy.feature.stories.R
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.story.StoryReactionDelivery
import me.meeshy.sdk.story.StoryReactionOutcome
import me.meeshy.sdk.story.StoryReactionPublisher
import me.meeshy.sdk.story.StoryRepository

/**
 * Ce qu'on fait d'une réaction de story que le POST direct a tentée — iOS `StoryReactionRecovery`. Une panne de
 * transport est déjà en file durable ([StoryReactionDelivery.Queued]) : l'emoji affiché reste vrai. Un REFUS du
 * serveur (409 `REACTION_LIMIT_REACHED`, 403, 404…) rembobine EXACTEMENT le tap et le dit en clair.
 */
internal sealed interface StoryReactionRecovery {
    /** La réaction a tenu (posée, ou en file pour le retour du réseau). */
    data object Keep : StoryReactionRecovery

    /** Restaurer l'état d'avant le tap sur la story d'origine, puis dire [messageRes]. */
    data class Rollback(@StringRes val messageRes: Int) : StoryReactionRecovery

    companion object {
        fun decide(delivery: StoryReactionDelivery): StoryReactionRecovery = when (delivery) {
            StoryReactionDelivery.Delivered, StoryReactionDelivery.Queued -> Keep
            is StoryReactionDelivery.Refused -> Rollback(messageFor(delivery))
        }

        private fun messageFor(refusal: StoryReactionDelivery.Refused): Int = when {
            refusal.limitReached -> R.string.story_reaction_limit_reached
            refusal.httpStatus in UNAVAILABLE_STATUSES -> R.string.story_reaction_unavailable
            else -> R.string.story_reaction_failed
        }

        private val UNAVAILABLE_STATUSES = setOf(403, 404, 410)
    }
}

/** Le lecteur sans file : un échec de transport n'a nulle part où attendre, il se rend comme un refus. */
internal fun StoryRepository.asReactionPublisher(): StoryReactionPublisher = StoryReactionPublisher { storyId, emoji ->
    when (val result = react(storyId, emoji)) {
        is NetworkResult.Success -> StoryReactionDelivery.Delivered
        is NetworkResult.Failure -> result.error.asRefusal()
    }
}

private fun ApiError.asRefusal(): StoryReactionDelivery.Refused =
    StoryReactionDelivery.Refused(httpStatus, limitReached = code == StoryReactionOutcome.LIMIT_REACHED_CODE)
