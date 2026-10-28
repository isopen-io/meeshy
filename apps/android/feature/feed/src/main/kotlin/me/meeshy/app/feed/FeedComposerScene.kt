package me.meeshy.app.feed

import me.meeshy.sdk.model.StoryBackgroundPalette

/** The scene a post is born with when its author picks a background (iOS `ComposerDocumentSurface.showsScene`, view `1b`). */
internal object PostSceneLaw {
    /** The shared story palette — never a copy: a colour chosen here reads the same on a story. */
    val swatches: List<String> get() = StoryBackgroundPalette.SOLID_COLORS

    /** Taps on the colour already painted take the scene away; any other colour paints (or repaints) it. */
    fun pick(current: String?, tapped: String): String? = tapped.takeUnless { it == current }

    /** A swatch is named by its rank — « Colour 3 of 17 » (iOS `BackgroundColorPalette.positionLabel`). */
    fun swatchRank(index: Int): Pair<Int, Int> = (index + 1) to swatches.size

    /** Under a scene the text is the compact description (iOS `sceneDescriptionField`); alone, the long body. */
    fun contentMinLines(showsScene: Boolean): Int = if (showsScene) SCENE_DESCRIPTION_LINES else DOCUMENT_BODY_LINES

    private const val SCENE_DESCRIPTION_LINES = 2
    private const val DOCUMENT_BODY_LINES = 6
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
