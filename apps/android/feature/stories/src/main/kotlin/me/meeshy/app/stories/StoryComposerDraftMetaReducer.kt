package me.meeshy.app.stories

import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.composer.AudienceCandidate
import me.meeshy.sdk.model.composer.ComposerAudienceSelection
import me.meeshy.sdk.model.composer.MediaDescriptionLaw

/** Pure reducers behind the draft's publication metadata: audience list, mentions and media descriptions. */
internal object StoryComposerDraftMetaReducer {

    fun audienceIdsChanged(state: StoryComposerUiState, ids: List<String>): StoryComposerUiState =
        state.copy(draft = state.draft.withVisibilityUserIds(ids.distinct().take(ComposerAudienceSelection.MAX_USERS)))

    fun mentionAdded(state: StoryComposerUiState, person: AudienceCandidate): StoryComposerUiState {
        val mentions = state.draft.mentions
        if (mentions.size >= StoryComposerViewModel.MAX_MENTIONS) return state
        if (mentions.any { it.username.equals(person.username, ignoreCase = true) }) return state
        val mention = PostMentionInput(
            userId = person.id,
            username = person.username,
            display = StoryComposerViewModel.MENTION_DISPLAY,
        )
        return state.copy(draft = state.draft.copy(mentions = mentions + mention))
    }

    fun mentionRemoved(state: StoryComposerUiState, username: String): StoryComposerUiState =
        state.copy(draft = state.draft.copy(mentions = state.draft.mentions.filterNot { it.username.equals(username, ignoreCase = true) }))

    fun mediaAltChanged(state: StoryComposerUiState, mediaId: String, text: String): StoryComposerUiState =
        state.copy(draft = state.draft.copy(mediaAlt = MediaDescriptionLaw.with(state.draft.mediaAlt, mediaId, text)))

    fun mediaCaptionChanged(state: StoryComposerUiState, mediaId: String, text: String): StoryComposerUiState =
        state.copy(draft = state.draft.copy(mediaCaption = MediaDescriptionLaw.with(state.draft.mediaCaption, mediaId, text)))
}
