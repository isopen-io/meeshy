package me.meeshy.app.stories

import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.PostReferenceDisplay
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.composer.AudienceCandidate
import me.meeshy.sdk.model.composer.ComposerSceneReferences
import java.util.UUID

/** Les intentions des feuilles « Mentionner », « Hashtags » et « Lieu » du « ⋯ » (#13846) : chacune passe par l'historique. */
internal fun StoryComposerViewModel.onMentionsChosen(people: List<AudienceCandidate>, display: PostReferenceDisplay) {
    if (people.isEmpty()) return
    onSceneReduce { StoryComposerReferencesReducer.mentionsChosen(it, people, display) { UUID.randomUUID().toString() } }
}

/** « OK » de la feuille Mentionner : la liste « Déjà référencées » telle que l'auteur l'a laissée, puis ceux qu'il a choisis. */
internal fun StoryComposerViewModel.onReferencesEdited(kept: List<PostMentionInput>, added: List<AudienceCandidate>, display: PostReferenceDisplay) =
    onSceneReduce { StoryComposerReferencesReducer.referencesEdited(it, kept, added, display) { UUID.randomUUID().toString() } }

/** Les personnes que la diapo nomme, tous modes : ses pastilles ÉPINGLÉES d'abord, puis le reste — ce que la feuille retrouve. */
internal val StoryComposerUiState.referenced: List<PostMentionInput>
    get() = ComposerSceneReferences.declaredFor(draft.mentions, deck.selectedSlide.badges)

internal fun StoryComposerViewModel.onToggleHashtag(tag: String) = onSceneReduce { StoryComposerReferencesReducer.hashtagToggled(it, tag) }

internal fun StoryComposerViewModel.onRestoreHashtags(before: List<String>) =
    onSceneReduce { StoryComposerReferencesReducer.hashtagsRestored(it, before) }

internal fun StoryComposerViewModel.onPosePlace(place: SharedPlace) = UUID.randomUUID().toString().let { id ->
    onSceneReduce { StoryComposerReferencesReducer.placePosed(it, place, id) }
}

internal fun StoryComposerViewModel.onSelectPlace(id: String) = onSceneReduce { StoryComposerReferencesReducer.selected(it, id) }

/** Le glissé d'une pastille : un seul cran d'historique pour tout le geste. */
internal fun StoryComposerViewModel.onPlaceMoved(id: String, dx: Float, dy: Float) =
    onSceneGesture("place:$id") { StoryComposerReferencesReducer.moved(it, id, dx, dy) }

internal fun StoryComposerViewModel.onRemovePlace(id: String) = onSceneReduce { StoryComposerReferencesReducer.removed(it, id) }

/** La pastille de lieu touchée, si elle vit encore sur la slide sélectionnée. */
internal val StoryComposerUiState.selectedPlace: StoryLocationObject?
    get() = selectedPlaceId?.let { id -> deck.selectedSlide.places.firstOrNull { it.id == id } }
