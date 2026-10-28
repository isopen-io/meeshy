package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.CarriedMedia
import me.meeshy.sdk.model.composer.ComposerCarry
import me.meeshy.sdk.model.composer.MediaDescriptionLaw

/** What the host plans from this scene: every uploaded media of the deck, in slide order, with its alt text. */
internal val StoryComposerUiState.carriedMedia: List<CarriedMedia>
    get() = deck.slides.flatMap { it.mediaIds }.distinct().mapNotNull { id ->
        attachments.firstOrNull { it.id == id }?.let { CarriedMedia(it, draft.mediaAlt[id]) }
    }

/** Offline-queued media have no server id yet: they cannot follow a format switch. */
internal val StoryComposerUiState.carriedPending: Int
    get() = deck.slides.flatMap { it.mediaIds }.distinct().count { id -> pendingUploads.any { it.cmid == id } }

/**
 * Lays a format switch's carry onto the scene: the post's already-uploaded media join the selected slide (no
 * re-upload, no loss), media the author removed on the post leave the deck, descriptions and audience follow.
 */
internal object StoryComposerCarryReducer {
    fun applied(state: StoryComposerUiState, carry: ComposerCarry): StoryComposerUiState {
        val plan = carry.plan
        val removed = plan.remove.fold(state.deck) { deck, id -> deck.removeMedia(id) }
        val known = state.attachments.map { it.id }.toSet()
        val fresh = plan.add.map { it.media }.filter { it.id !in known }
        val deck = plan.add.fold(removed) { acc, item -> acc.addMediaToSelected(item.media.id) }
        val onDeck = deck.slides.flatMap { it.mediaIds }.toSet()
        val alts = plan.alts.entries.filter { (id, _) -> id in onDeck }
            .fold(state.draft.mediaAlt) { map, (id, text) -> MediaDescriptionLaw.with(map, id, text) }
        val visibility = carry.audience?.takeUnless { it.requiresUserSelection } ?: state.draft.visibility
        return state.copy(
            deck = deck,
            attachments = state.attachments.filterNot { it.id in plan.remove } + fresh,
            draft = state.draft.copy(mediaAlt = alts, visibility = visibility),
        ).withDescriptionsPruned().mirrorDraftToSelection()
    }
}
