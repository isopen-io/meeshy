package me.meeshy.app.composer.host

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.app.composer.inbound.ComposerSeedStore
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.composer.ComposerOrigin
import me.meeshy.sdk.model.composer.postsItsOwnMatter
import me.meeshy.app.feed.PostComposerFacts
import me.meeshy.app.stories.StoryComposerFacts
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerHostState
import me.meeshy.sdk.model.composer.ComposerIntent
import me.meeshy.sdk.model.composer.ComposerProfile
import me.meeshy.sdk.model.composer.ComposerTextSelection
import me.meeshy.sdk.model.composer.sceneOpening
import javax.inject.Inject

/**
 * Le document de l'hôte unique : UN état (loi pure [ComposerHostState]) que chaque contenu — story, post/réel, mood —
 * alimente de ce qu'il sait (texte, médias, scène) et dont il lit le format qui gouverne. Aucune règle ici : ce
 * ViewModel relaie, la loi décide.
 */
@HiltViewModel
class ComposerHostViewModel @Inject constructor(
    private val saved: SavedStateHandle,
    private val seeds: ComposerSeedStore,
) : ViewModel() {
    val door: ComposerHostRoute.Door = ComposerHostRoute.door(
        wire = saved.get<String>(ComposerHostRoute.ORIGIN_ARG),
        id = saved.get<String>(ComposerHostRoute.ID_ARG),
        sub = saved.get<String>(ComposerHostRoute.SUB_ARG),
        seed = saved.get<String>(ComposerHostRoute.SEED_ARG),
    )

    private val _state = MutableStateFlow(ComposerHostState.open(ComposerIntent(door.origin, opening = door.origin.sceneOpening)))
    val state: StateFlow<ComposerHostState> = _state.asStateFlow()

    /** La porte pose elle-même la matière : le brouillon enregistré ne se restaure pas par-dessus (iOS `seededByDoor`). */
    val seededByDoor: Boolean = door.origin.postsItsOwnMatter

    /**
     * La porte a promis qu'on écrirait d'emblée (iOS `focusesContentOnAppear`) : dû jusqu'à ce que le champ ait pris le
     * clavier, UNE fois — ni une bascule de format, ni une rotation, ni la restauration après la mort du processus ne le
     * rejouent (la dette payée vit dans le [SavedStateHandle]).
     */
    val keyboardOwed: StateFlow<Boolean> =
        saved.getStateFlow(KEYBOARD_OWED_KEY, ComposerProfile.of(door.origin).opensWith.focusesContentOnAppear)

    fun onKeyboardRaised() {
        saved[KEYBOARD_OWED_KEY] = false
    }

    /**
     * Le curseur et la sélection du texte du document, là où l'auteur les a laissés : la bascule démonte une surface et en
     * monte une autre, qui les reprend au montage (iOS : le document garde son état d'édition). Ce n'est PAS de l'état
     * observé — chaque déplacement du curseur réveillerait tout l'hôte pendant la frappe — mais une valeur lue au montage.
     */
    var selection: ComposerTextSelection = ComposerTextSelection.AT_END
        private set

    fun onSelection(value: ComposerTextSelection) {
        selection = value
    }

    private val _seed = MutableStateFlow<SeedState>(if (door.origin === ComposerOrigin.Share) SeedState.Loading else SeedState.None)

    /** La matière reçue de l'extérieur, reprise UNE fois du relais ([ComposerSeedStore.take]) et rendue à la scène qui la monte. */
    val seed: StateFlow<SeedState> = _seed.asStateFlow()

    init {
        if (door.origin === ComposerOrigin.Share) {
            viewModelScope.launch {
                val items = withContext(Dispatchers.IO) { seeds.take(door.seedToken) }
                _seed.value = if (items.isEmpty()) SeedState.Lost else SeedState.Ready(items)
            }
        }
    }

    /** La scène a pris la matière : elle ne lui est jamais remise deux fois (changement de format, rotation). */
    fun onSeedApplied() {
        _seed.update { if (it is SeedState.Ready) SeedState.None else it }
    }

    fun choose(format: ComposerFormat) = _state.update { it.choose(format) }

    fun chooseLayout(mode: MosaicLayoutMode) = _state.update { it.chooseLayout(mode) }

    fun onStoryFacts(facts: StoryComposerFacts) = _state.update {
        it.withText(facts.text).withScene(facts.hasScene)
            .withSceneDocument(facts.media, facts.pending, facts.room, facts.visibility)
    }

    fun onPostFacts(facts: PostComposerFacts) = _state.update {
        it.withText(facts.text).withMedia(facts.kinds).withPostDocument(facts.media, facts.visibility)
    }

    /**
     * The target surface took what the switch carried: it is never handed over twice. [lost] counts what the
     * arrival could not take beyond the plan (a restored draft already full): `true` when it must still be SAID.
     */
    fun onCarryApplied(token: Int, lost: Int): Boolean {
        val carried = _state.value.carry?.takeIf { it.token == token }
        _state.update { it.carryApplied(token) }
        return lost > 0 && carried != null && carried.plan.leftBehind == 0
    }

    fun onMoodFacts(text: String, emoji: String?) = _state.update { it.withText(text).withMoodEmoji(emoji) }

    private companion object {
        const val KEYBOARD_OWED_KEY = "composer.keyboardOwed"
    }
}

/** Où en est la matière que la porte pose : à venir, prête, rien (pas de graine ou déjà prise), ou perdue (périmée, déjà reprise : rien à composer). */
sealed interface SeedState {
    data object Loading : SeedState
    data object None : SeedState
    data object Lost : SeedState
    data class Ready(val items: List<MediaUploadItem>) : SeedState
}
