package me.meeshy.app.composer.host

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.app.feed.PostComposerFacts
import me.meeshy.app.stories.StoryComposerFacts
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerHostState
import me.meeshy.sdk.model.composer.ComposerIntent
import javax.inject.Inject

/**
 * Le document de l'hôte unique : UN état (loi pure [ComposerHostState]) que chaque contenu — story, post/réel, mood —
 * alimente de ce qu'il sait (texte, médias, scène) et dont il lit le format qui gouverne. Aucune règle ici : ce
 * ViewModel relaie, la loi décide.
 */
@HiltViewModel
class ComposerHostViewModel @Inject constructor(
    saved: SavedStateHandle,
) : ViewModel() {
    private val _state = MutableStateFlow(
        ComposerHostState.open(ComposerIntent(ComposerHostRoute.origin(saved.get<String>(ComposerHostRoute.ORIGIN_ARG)))),
    )
    val state: StateFlow<ComposerHostState> = _state.asStateFlow()

    fun choose(format: ComposerFormat) = _state.update { it.choose(format) }

    fun onStoryFacts(facts: StoryComposerFacts) = _state.update {
        it.withText(facts.text).withScene(facts.hasScene)
            .withSceneDocument(facts.media, facts.pending, facts.room, facts.visibility)
    }

    fun onPostFacts(facts: PostComposerFacts) = _state.update {
        it.withText(facts.text).withMedia(facts.kinds).withPostDocument(facts.media, facts.visibility)
    }

    /** The target surface took what the switch carried: it is never handed over twice. */
    fun onCarryApplied(token: Int) = _state.update { it.carryApplied(token) }

    fun onMoodFacts(text: String, emoji: String?) = _state.update { it.withText(text).withMoodEmoji(emoji) }
}
