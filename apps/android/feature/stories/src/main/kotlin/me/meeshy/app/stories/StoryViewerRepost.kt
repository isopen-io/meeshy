package me.meeshy.app.stories

import androidx.annotation.StringRes
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.story.StoryRepostDestination
import me.meeshy.sdk.model.story.StoryRepostFailure
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.story.StoryDirectRepostOutcome
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.StoryRepostPublisher
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastRequest

/**
 * « Republier » dans le lecteur (#14443, iOS `StoryDirectRepost`) : le compteur et la marque bougent au geste, le
 * réseau confirme, un refus les rend. [delta] compte, par story, les republications de ce lecteur qui tiennent ; une
 * story dont la republication est encore [inFlight] ne repart pas sur un second toucher.
 */
internal data class StoryRepostMarks(
    val delta: Map<String, Int> = emptyMap(),
    val inFlight: Set<String> = emptySet(),
) {
    /** Le geste, ou `null` tant que la republication précédente de cette story n'a pas eu sa réponse. */
    fun begun(storyId: String): StoryRepostMarks? =
        if (storyId in inFlight) null else copy(delta = delta + (storyId to countOf(storyId) + 1), inFlight = inFlight + storyId)

    fun confirmed(storyId: String): StoryRepostMarks = copy(inFlight = inFlight - storyId)

    fun refused(storyId: String): StoryRepostMarks {
        val left = countOf(storyId) - 1
        return copy(delta = if (left > 0) delta + (storyId to left) else delta - storyId, inFlight = inFlight - storyId)
    }

    fun count(storyId: String?, served: Int): Int = served + (storyId?.let(::countOf) ?: 0)

    fun has(storyId: String?): Boolean = storyId != null && countOf(storyId) > 0

    private fun countOf(storyId: String): Int = delta[storyId] ?: 0
}

/** Pourquoi la passerelle refuse une republication — le message que l'auteur LIT, mot pour mot celui d'iOS (`RepostFailure`). */
internal enum class StoryRepostRefusal(@StringRes val messageRes: Int) {
    SOURCE_GONE(R.string.story_repost_error_unavailable),
    AUDIENCE_WIDENING(R.string.story_repost_error_forbidden),
    OTHER(R.string.story_repost_error_generic),
    ;

    companion object {
        fun of(error: ApiError): StoryRepostRefusal = of(StoryRepostFailure.classify(error.httpStatus))

        fun of(failure: StoryRepostFailure): StoryRepostRefusal = when (failure) {
            StoryRepostFailure.SOURCE_GONE -> SOURCE_GONE
            StoryRepostFailure.AUDIENCE_WIDENING -> AUDIENCE_WIDENING
            StoryRepostFailure.OTHER -> OTHER
        }
    }
}

/** La republication a tenu (publiée, ou en file pour le retour du réseau) : la marque et le compteur du lecteur restent. */
internal val StoryDirectRepostOutcome.isDone: Boolean
    get() = this is StoryDirectRepostOutcome.Published || this is StoryDirectRepostOutcome.Queued

/** Ce que le lecteur DIT d'une republication, par destination ; un geste avalé en double ne dit rien. */
internal fun StoryDirectRepostOutcome.toast(destination: StoryRepostDestination): FeedbackToastRequest? = when (this) {
    StoryDirectRepostOutcome.Published, StoryDirectRepostOutcome.Queued ->
        FeedbackToastRequest(successMessage(destination), FeedbackKind.Success)
    StoryDirectRepostOutcome.Duplicate -> null
    is StoryDirectRepostOutcome.Refused -> FeedbackToastRequest(StoryRepostRefusal.of(failure).messageRes, FeedbackKind.Error)
}

@StringRes
internal fun successMessage(destination: StoryRepostDestination): Int = when (destination) {
    StoryRepostDestination.STORY -> R.string.my_stories_repost_success
    StoryRepostDestination.POST -> R.string.story_repost_success
    StoryRepostDestination.REEL -> R.string.story_repost_success_reel
}

/** Le lecteur sans file : la republication en story par le dépôt, un refus nommé par son statut (le repli du constructeur). */
internal fun StoryRepository.asRepostPublisher(): StoryRepostPublisher = StoryRepostPublisher { storyId, _ ->
    when (val result = repost(storyId)) {
        is NetworkResult.Success -> StoryDirectRepostOutcome.Published
        is NetworkResult.Failure -> StoryDirectRepostOutcome.Refused(StoryRepostFailure.classify(result.error.httpStatus))
    }
}
