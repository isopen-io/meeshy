package me.meeshy.app.feed

import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.composer.CarriedMedia
import me.meeshy.sdk.model.composer.ComposerAudienceCarry
import me.meeshy.sdk.model.composer.ComposerCarry

/** A carry laid on a post draft, and how many carried media it could not take ([lost], said by the host). */
data class FeedCarryResult(val draft: FeedComposerDraft, val lost: Int)

/**
 * Applies what the host carried from the scene onto this post draft: the already-uploaded media (server ids,
 * no re-upload, never twice), the descriptions that follow them, the audience when a post can express it. A
 * restored draft fuller than the host knew keeps its own media; the overflow is counted, never silent. Pure.
 */
fun FeedComposerDraft.withCarry(carry: ComposerCarry): FeedCarryResult {
    val plan = carry.plan
    val kept = plan.remove.fold(this) { draft, id -> draft.withoutMedia(id) }
    val incoming = plan.add.map(CarriedMedia::media).filter { it.id !in kept.mediaIds }.distinctBy { it.id }
    val withMedia = kept.withMedia(incoming)
    val described = plan.alts.entries
        .filter { (id, _) -> id in withMedia.mediaIds }
        .fold(withMedia) { draft, (id, text) -> draft.withAlt(id, text) }
    val visibility = carry.audience
        ?.let(ComposerAudienceCarry::postWire)
        ?.let { wire -> FeedPostVisibility.entries.firstOrNull { it.wire == wire } }
    val lost = incoming.count { it.id !in withMedia.mediaIds }
    return FeedCarryResult(visibility?.let(described::withVisibility) ?: described, lost)
}

/** The post's side of the document, as the host plans transfers from it. */
fun FeedComposerDraft.carriedMedia(): List<CarriedMedia> =
    media.map { CarriedMedia(it, mediaAlt[it.id]) }

/** A post audience as the document's one audience vocabulary. */
fun FeedPostVisibility.storyVisibility(): StoryVisibility =
    ComposerAudienceCarry.fromPostWire(wire) ?: StoryVisibility.PUBLIC
