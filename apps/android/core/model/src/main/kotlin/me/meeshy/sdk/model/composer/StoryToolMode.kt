package me.meeshy.sdk.model.composer

/**
 * The tools of the story composer — port of iOS `StoryToolMode`. [FILTERS] stays in the
 * enum for the rendering of already-filtered stories but is never part of
 * [composerOrder]: filters are applied per media.
 */
enum class StoryToolMode {
    MEDIA,
    AUDIO,
    DRAWING,
    TEXT,
    FILTERS,
    TIMELINE,
    TEXTURE;

    companion object {
        /**
         * The single canonical order of the composer tools — creation (media, text,
         * drawing), dressing (sound, background), editing (timeline). The tool row is its
         * reference; every other surface follows it.
         */
        val composerOrder: List<StoryToolMode> = listOf(MEDIA, TEXT, DRAWING, AUDIO, TEXTURE, TIMELINE)

        /**
         * **A tool without a panel is not served**: the canonical tools restricted to
         * those the host can actually open, canonical order kept.
         */
        fun served(withPanel: Set<StoryToolMode>): List<StoryToolMode> =
            composerOrder.filter { it in withPanel }
    }
}
