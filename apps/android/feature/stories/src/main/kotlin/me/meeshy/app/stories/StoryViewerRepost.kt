package me.meeshy.app.stories

import androidx.annotation.StringRes
import me.meeshy.feature.stories.R
import me.meeshy.sdk.net.ApiError
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
        fun of(error: ApiError): StoryRepostRefusal = when (error.httpStatus) {
            HTTP_NOT_FOUND -> SOURCE_GONE
            HTTP_FORBIDDEN -> AUDIENCE_WIDENING
            else -> OTHER
        }

        /** Ce que le lecteur dit une fois la réponse venue : la republication faite, ou la raison du refus. */
        fun toast(refusal: StoryRepostRefusal?): FeedbackToastRequest =
            refusal?.let { FeedbackToastRequest(it.messageRes, FeedbackKind.Error) }
                ?: FeedbackToastRequest(R.string.my_stories_repost_success, FeedbackKind.Success)

        private const val HTTP_FORBIDDEN = 403
        private const val HTTP_NOT_FOUND = 404
    }
}
