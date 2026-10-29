package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.CarriedMedia
import me.meeshy.sdk.model.composer.ComposerCarry
import me.meeshy.sdk.model.composer.MediaDescriptionLaw

/** What the host plans from this scene: every uploaded media of the deck, in slide order, with its alt text and caption. */
internal val StoryComposerUiState.carriedMedia: List<CarriedMedia>
    get() = deck.slides.flatMap { it.mediaIds }.distinct().mapNotNull { id ->
        attachments.firstOrNull { it.id == id }?.let { CarriedMedia(it, alt = draft.mediaAlt[id], caption = draft.mediaCaption[id]) }
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
        val deck = plan.add.fold(removed) { acc, item -> acc.addMediaToSelected(item.media.id) }
        val onDeck = deck.slides.flatMap { it.mediaIds }.toSet()
        val fresh = plan.add.map { it.media }.filter { it.id !in known && it.id in onDeck }.distinctBy { it.id }
        val alts = plan.alts.entries.filter { (id, _) -> id in onDeck }
            .fold(state.draft.mediaAlt) { map, (id, text) -> MediaDescriptionLaw.with(map, id, text) }
        val captions = plan.captions.entries.filter { (id, _) -> id in onDeck }
            .fold(state.draft.mediaCaption) { map, (id, text) -> MediaDescriptionLaw.with(map, id, text) }
        val visibility = carry.audience?.takeUnless { it.requiresUserSelection } ?: state.draft.visibility
        return state.copy(
            deck = deck,
            attachments = state.attachments.filterNot { it.id in plan.remove } + fresh,
            draft = state.draft.copy(mediaAlt = alts, mediaCaption = captions, visibility = visibility),
        ).withDescriptionsPruned().mirrorDraftToSelection()
    }

    /** The carried media the deck could not take (a restored slide fuller than the host knew): said, never silent. */
    fun lost(state: StoryComposerUiState, carry: ComposerCarry): Int {
        val onDeck = state.deck.slides.flatMap { it.mediaIds }.toSet()
        return carry.plan.add.count { it.media.id !in onDeck }
    }
}
