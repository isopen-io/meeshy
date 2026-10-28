package me.meeshy.app.feed

import me.meeshy.sdk.model.StoryBackgroundPalette

/** The scene a post is born with when its author picks a background (iOS `ComposerDocumentSurface.showsScene`, view `1b`). */
internal object PostSceneLaw {
    /** The shared story palette — never a copy: a colour chosen here reads the same on a story. */
    val swatches: List<String> get() = StoryBackgroundPalette.SOLID_COLORS

    /** A swatch is named by its rank — « Colour 3 of 17 » (iOS `BackgroundColorPalette.positionLabel`). */
    fun swatchRank(index: Int): Pair<Int, Int> = (index + 1) to swatches.size

    /** Under a scene the text is the compact description (iOS `sceneDescriptionField`); alone, the long body. */
    fun contentMinLines(showsScene: Boolean): Int = if (showsScene) SCENE_DESCRIPTION_LINES else DOCUMENT_BODY_LINES

    private const val SCENE_DESCRIPTION_LINES = 2
    private const val DOCUMENT_BODY_LINES = 6
}

/** The entries of the `⋯` of the top corridor (iOS `ComposerOverflowEntry`; preview and export come with the scene machinery). */
internal enum class PostOverflowEntry { REMOVE_BACKGROUND, CLEAR_ALL }

/** What the post composer's `⋯` offers and what each entry does (iOS `ComposerOverflowPolicy` + `perform`), one rule for every presentation. */
internal object PostOverflowLaw {
    /**
     * An absent entry is never greyed; an empty list means no button at all. Clearing is always last — the only destructive
     * entry stays away from the thumb — and is not offered on a blank document, which has nothing to lose.
     */
    fun entries(draft: FeedComposerDraft): List<PostOverflowEntry> = buildList {
        if (draft.showsScene) add(PostOverflowEntry.REMOVE_BACKGROUND)
        val hasSomething = draft.showsScene || draft.text.isNotBlank() || draft.media.isNotEmpty() || draft.location != null
        if (hasSomething) add(PostOverflowEntry.CLEAR_ALL)
    }

    fun perform(entry: PostOverflowEntry, draft: FeedComposerDraft): FeedComposerDraft = when (entry) {
        PostOverflowEntry.REMOVE_BACKGROUND -> draft.withBackground(null)
        PostOverflowEntry.CLEAR_ALL -> draft.cleared()
    }
}

private const val CONTENT_FOCUS_FRAMES = 3

/**
 * The keyboard debt of a door that promised writing (iOS `focusesContentOnAppear`), shared by every presentation of the
 * post composer: the field takes focus once laid out — retried frame by frame, it may be attached a frame late — then the
 * keyboard rises, and [onPaid] settles the debt whatever happened so a later remount never raises it again.
 */
internal suspend fun payKeyboardDebt(
    requestFocus: () -> Boolean,
    nextFrame: suspend () -> Unit,
    showKeyboard: () -> Unit,
    onPaid: () -> Unit,
) {
    var focused = false
    for (attempt in 0 until CONTENT_FOCUS_FRAMES) {
        focused = requestFocus()
        if (focused) break
        if (attempt < CONTENT_FOCUS_FRAMES - 1) nextFrame()
    }
    if (focused) showKeyboard()
    onPaid()
}
