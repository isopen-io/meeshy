package me.meeshy.app.stories

import androidx.lifecycle.ViewModel
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.story.StoryViewerParticipationMark
import me.meeshy.sdk.session.PerAccountCache

/**
 * **La mémoire de session des gestes du lecteur sur les stories** (iOS `StoryViewerParticipationStore`) : la passerelle
 * ne sert pas le commentaire, l'envoi ni la republication du lecteur sur une story. Notée aux sites où le geste PART, lue
 * par le rail qui dessine le contour de l'auteur. Elle appartient au compte : la déconnexion la vide.
 */
@Singleton
class StoryViewerParticipationStore @Inject constructor() : PerAccountCache {

    private val _marks = MutableStateFlow<Map<String, Set<StoryViewerParticipationMark>>>(emptyMap())
    val marks: StateFlow<Map<String, Set<StoryViewerParticipationMark>>> = _marks.asStateFlow()

    /** Un geste déjà noté ne publie rien : aucun rail ne se redessine pour rien. */
    fun note(mark: StoryViewerParticipationMark, storyId: String) {
        if (storyId.isEmpty()) return
        _marks.update { current ->
            if (current[storyId]?.contains(mark) == true) current
            else current + (storyId to (current[storyId].orEmpty() + mark))
        }
    }

    override suspend fun clear() {
        _marks.update { if (it.isEmpty()) it else emptyMap() }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class StoryViewerParticipationModule {
    @Binds
    @IntoSet
    abstract fun bindPerAccountCache(store: StoryViewerParticipationStore): PerAccountCache
}

/** Donne la mémoire de session au lecteur, sans rien ajouter à `StoryViewerViewModel`. */
@HiltViewModel
class StoryRailParticipationViewModel @Inject constructor(
    private val store: StoryViewerParticipationStore,
) : ViewModel() {
    val marks: StateFlow<Map<String, Set<StoryViewerParticipationMark>>> get() = store.marks

    fun note(mark: StoryViewerParticipationMark, storyId: String?) {
        storyId?.let { store.note(mark, it) }
    }
}
