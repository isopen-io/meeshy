package me.meeshy.app.stories

import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.PostReferenceDisplay
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.composer.AudienceCandidate
import me.meeshy.sdk.model.composer.ComposerHashtags
import me.meeshy.sdk.model.composer.ComposerSceneReferences
import me.meeshy.sdk.model.scene.StoryTextBackground

/**
 * Ce que la publication nomme, posé depuis « ⋯ » (#13846, miroir de `StoryComposerViewModel+References` et
 * `+StickersAndPlaces` iOS). Une mention ÉPINGLÉE est une pastille — un texte qui porte sa personne, et qui hérite de tout
 * ce qu'un texte sait faire ; les mentions référencées ou silencieuses nomment la publication sans rien poser. Changer de
 * mode et en choisir un sont le même geste. Un hashtag s'écrit dans le texte de la diapo : il classe la publication, il ne
 * se voit pas sur la scène. Un lieu est une pastille posée en bas de la scène, en cascade.
 */
internal object StoryComposerReferencesReducer {

    private const val BADGE_Y = 0.62f
    private const val BADGE_STEP = 0.06f
    private const val PLACE_Y = 0.8
    private const val PLACE_STEP = 0.04
    private const val CASCADE = 5

    fun mentionsChosen(
        state: StoryComposerUiState,
        people: List<AudienceCandidate>,
        display: PostReferenceDisplay,
        newId: () -> String,
    ): StoryComposerUiState = people.fold(state) { current, person ->
        if (display == PostReferenceDisplay.PINNED) pinned(current, person, newId()) else declared(current, person, display)
    }

    /**
     * « OK » de la feuille Mentionner (iOS `applyReferences`) : qui a quitté la liste « Déjà référencées » n'est plus nommé
     * — sa pastille part avec lui —, qui y a changé de mode le prend, puis les personnes choisies arrivent dans [display].
     */
    fun referencesEdited(
        state: StoryComposerUiState,
        kept: List<PostMentionInput>,
        added: List<AudienceCandidate>,
        display: PostReferenceDisplay,
        newId: () -> String,
    ): StoryComposerUiState {
        val keptNames = kept.mapNotNull { it.username?.lowercase() }.toSet()
        val pruned = state.referenced.filterNot { it.username?.lowercase() in keptNames }.fold(state, ::unnamed)
        val remoded = kept.filterNot { it in state.referenced }.fold(pruned) { current, mention ->
            val mode = PostReferenceDisplay.entries.firstOrNull { it.wire == mention.display } ?: return@fold current
            mentionsChosen(current, listOf(mention.asCandidate()), mode, newId)
        }
        return mentionsChosen(remoded, added, display, newId)
    }

    private fun unnamed(state: StoryComposerUiState, mention: PostMentionInput): StoryComposerUiState {
        val person = mention.asCandidate()
        val deck = state.deck.selectedSlide.elements
            .filter { badge -> badge.referenceUserId != null && (badge.referenceUserId == person.id || badge.text.equals("@${person.username}", ignoreCase = true)) }
            .fold(state.deck) { current, badge -> current.removeTextElement(badge.id) }
        return state.copy(draft = state.draft.copy(mentions = state.draft.mentions.filterNot { it.names(person) }), deck = deck)
    }

    private fun PostMentionInput.asCandidate(): AudienceCandidate = AudienceCandidate(id = userId.orEmpty(), username = username.orEmpty())

    private fun pinned(state: StoryComposerUiState, person: AudienceCandidate, id: String): StoryComposerUiState {
        val slide = state.deck.selectedSlide
        val undeclared = state.draft.copy(mentions = state.draft.mentions.filterNot { it.names(person) })
        if (slide.elements.any { it.referenceUserId == person.id }) return state.copy(draft = undeclared)
        if (!state.deck.selectedCanAddTextElement) return state.copy(errorMessage = StoryComposerViewModel.TEXT_ELEMENT_LIMIT)
        val posed = slide.elements.count { it.referenceUserId != null }
        val badge = StoryTextElement(
            id = id,
            text = "@${person.username}",
            size = StoryTextSize.SMALL,
            background = StoryTextBackground.Solid(ComposerSceneReferences.BADGE_BACKGROUND_HEX),
            y = BADGE_Y + (posed % CASCADE) * BADGE_STEP,
            referenceUserId = person.id,
        )
        return state.copy(draft = undeclared, deck = state.deck.addTextElementToSelected(badge), errorMessage = null)
    }

    private fun declared(state: StoryComposerUiState, person: AudienceCandidate, display: PostReferenceDisplay): StoryComposerUiState {
        val mention = PostMentionInput(userId = person.id, username = person.username, display = display.wire)
        val mentions = state.draft.mentions
        val next = if (mentions.any { it.names(person) }) mentions.map { if (it.names(person)) mention else it }
        else (mentions + mention).take(ComposerSceneReferences.MAX_MENTIONS)
        val unbadged = state.deck.selectedSlide.elements.filter { it.referenceUserId == person.id }
            .fold(state.deck) { deck, badge -> deck.removeTextElement(badge.id) }
        return state.copy(draft = state.draft.copy(mentions = next), deck = unbadged)
    }

    private fun PostMentionInput.names(person: AudienceCandidate): Boolean =
        (person.id.isNotEmpty() && userId == person.id) || username.equals(person.username, ignoreCase = true)

    /** Une bascule : la même balise retire ce qu'elle a posé, de toutes les diapos ; sinon elle s'écrit à la fin de la diapo. */
    fun hashtagToggled(state: StoryComposerUiState, tag: String): StoryComposerUiState {
        val clean = tag.trim().trim('#', ' ')
        if (clean.isEmpty()) return state
        val present = state.hashtags.any { it.equals(clean, ignoreCase = true) }
        val deck = if (present) state.deck.mapSlideTexts { ComposerHashtags.removing(clean, it) }
        else state.deck.updateSelectedText(ComposerHashtags.inserting(clean, state.deck.selectedSlide.text))
        return state.withDeckTransform { deck }
    }

    /** « Annuler » de la feuille : rejouer exactement la différence avec ce qu'elle a trouvé en s'ouvrant. */
    fun hashtagsRestored(state: StoryComposerUiState, before: List<String>): StoryComposerUiState =
        ComposerHashtags.togglesRestoring(state.hashtags, before).fold(state, ::hashtagToggled)

    fun placePosed(state: StoryComposerUiState, place: SharedPlace, id: String): StoryComposerUiState {
        if (!state.deck.selectedCanAddPlace) return state
        val posed = state.deck.selectedSlide.places.size
        val pastille = StoryLocationObject(id = id, place = place, x = 0.5, y = PLACE_Y - (posed % CASCADE) * PLACE_STEP)
        return selected(state.copy(deck = state.deck.addPlaceToSelected(pastille)), id)
    }

    fun selected(state: StoryComposerUiState, id: String): StoryComposerUiState =
        if (state.deck.selectedSlide.places.none { it.id == id }) state
        else state.copy(
            selectedPlaceId = id, selectedTextElementId = null, framedTextElementId = null, selectedStickerId = null,
            selectedMediaId = null, selectedSoundId = null,
        )

    fun moved(state: StoryComposerUiState, id: String, dx: Float, dy: Float): StoryComposerUiState =
        state.copy(deck = state.deck.updatePlace(id) { it.copy(x = it.x + dx, y = it.y + dy) })

    fun removed(state: StoryComposerUiState, id: String): StoryComposerUiState =
        state.copy(deck = state.deck.removePlace(id), selectedPlaceId = state.selectedPlaceId?.takeIf { it != id })
}
