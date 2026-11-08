package me.meeshy.app.stories

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.story.StoryCommentDraft
import me.meeshy.sdk.model.story.StoryCommentDrafts
import me.meeshy.sdk.model.story.StoryCommentPiece
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Inject
import javax.inject.Singleton

/**
 * **Le brouillon de commentaire de chaque story** (iOS `storyDrafts`) : un texte par story, restauré à la réouverture,
 * supprimé à l'envoi, et rendu — daté — quand la file refuse le commentaire. Le compte l'emporte avec lui : la
 * déconnexion vide tout, les mots de A ne se retrouvent jamais sous B. Les transitions sont [StoryCommentDrafts].
 */
@Singleton
class StoryCommentDraftStore @Inject constructor() : PerAccountCache {

    private val _drafts = MutableStateFlow(StoryCommentDrafts())
    val drafts: StateFlow<StoryCommentDrafts> = _drafts.asStateFlow()

    fun draftOf(storyId: String): StoryCommentDraft? = _drafts.value.draftOf(storyId)

    fun save(storyId: String, text: String, pieces: List<StoryCommentPiece> = emptyList(), place: SharedPlace? = null) =
        _drafts.update { it.saved(storyId, text, pieces, place) }

    fun sent(storyId: String) = _drafts.update { it.sent(storyId) }

    fun refused(
        storyId: String,
        text: String,
        atMillis: Long,
        pieces: List<StoryCommentPiece> = emptyList(),
        place: SharedPlace? = null,
    ) = _drafts.update { it.refused(storyId, text, atMillis, pieces, place) }

    override suspend fun clear() {
        _drafts.update { if (it.byStory.isEmpty()) it else StoryCommentDrafts() }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class StoryCommentDraftModule {
    @Binds
    @IntoSet
    abstract fun bindPerAccountCache(store: StoryCommentDraftStore): PerAccountCache
}
