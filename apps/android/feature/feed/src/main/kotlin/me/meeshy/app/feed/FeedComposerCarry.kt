package me.meeshy.app.feed

import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.composer.CarriedMedia
import me.meeshy.sdk.model.composer.ComposerAudienceCarry
import me.meeshy.sdk.model.composer.ComposerCarry

/**
 * Applies what the host carried from the scene onto this post draft: the already-uploaded media (server ids,
 * no re-upload), the descriptions that follow them, the audience when a post can express it. Pure.
 */
fun FeedComposerDraft.withCarry(carry: ComposerCarry): FeedComposerDraft {
    val plan = carry.plan
    val kept = plan.remove.fold(this) { draft, id -> draft.withoutMedia(id) }
    val withMedia = kept.withMedia(plan.add.map(CarriedMedia::media))
    val described = plan.alts.entries
        .filter { (id, _) -> id in withMedia.mediaIds }
        .fold(withMedia) { draft, (id, text) -> draft.withAlt(id, text) }
    val visibility = carry.audience
        ?.let(ComposerAudienceCarry::postWire)
        ?.let { wire -> FeedPostVisibility.entries.firstOrNull { it.wire == wire } }
    return visibility?.let(described::withVisibility) ?: described
}

/** The post's side of the document, as the host plans transfers from it. */
fun FeedComposerDraft.carriedMedia(): List<CarriedMedia> =
    media.map { CarriedMedia(it, mediaAlt[it.id]) }

/** A post audience as the document's one audience vocabulary. */
fun FeedPostVisibility.storyVisibility(): StoryVisibility =
    ComposerAudienceCarry.fromPostWire(wire) ?: StoryVisibility.PUBLIC
