package me.meeshy.app.stories

import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryItem

/**
 * Picks the blur-placeholder ThumbHash a story slide paints behind its
 * background image while the full image loads — an instant, low-cost preview
 * instead of a black flash on cold load (Instant-App: cache/skeleton-first, no
 * blank frame when a cheap approximation is available). Ports iOS
 * `StorySlideRenderer`, which decodes `StorySlide.effects.thumbHash` for exactly
 * this.
 *
 * This object only RESOLVES the hash STRING; decoding it into pixels
 * (`ThumbHash.decodeBase64`) and painting it (`rememberThumbHashPainter`) are the
 * viewer's Compose glue — so the decision of *which* hash to show stays pure and
 * unit-tested, and there is one source of truth for it.
 *
 * The hash only ever backs the IMAGE background branch: a video background paints
 * an ExoPlayer surface with no placeholder slot, so its poster hash (if any) is
 * deliberately not offered here.
 */
object StorySlidePlaceholder {

    /**
     * Resolves the placeholder hash from the two candidate sources, in priority
     * order:
     *
     * 1. [effectsThumbHash] — the slide-level hash a modern composer writes onto
     *    `StoryEffects.thumbHash`; the primary source (matches iOS).
     * 2. [backgroundImageThumbHash] — the per-media hash carried on the flat
     *    `FeedMedia` backing a legacy/RAW-published image background.
     *
     * The first **non-blank** candidate (trimmed) wins; a present-but-blank hash
     * falls through to the next rather than painting an empty blur, and all
     * candidates absent/blank resolves to `null` (the viewer keeps its plain
     * background — no placeholder).
     */
    fun resolve(effectsThumbHash: String?, backgroundImageThumbHash: String?): String? =
        listOfNotNull(effectsThumbHash, backgroundImageThumbHash)
            .map { it.trim() }
            .firstOrNull { it.isNotEmpty() }

    /**
     * Convenience overload resolving straight from a [StoryItem]. The
     * background-image candidate mirrors the viewer's own image-background
     * selection (`StoryViewerViewModel.resolveBackgroundMedia`'s legacy fallback:
     * the first IMAGE media that carries a url), so the placeholder shown is the
     * blur of the very image that is loading.
     */
    fun resolve(item: StoryItem): String? = resolve(
        effectsThumbHash = item.storyEffects?.thumbHash,
        backgroundImageThumbHash = item.media
            .firstOrNull { it.type == FeedMediaType.IMAGE && it.url != null }
            ?.thumbHash,
    )
}
