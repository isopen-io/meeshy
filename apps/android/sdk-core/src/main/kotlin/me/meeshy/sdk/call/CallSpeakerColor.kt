package me.meeshy.sdk.call

import me.meeshy.sdk.theme.AuthorInk
import me.meeshy.sdk.theme.DynamicColorGenerator

/**
 * The STABLE colour of a person in a call — iOS `CallSpeakerColor`: derived from the user id (never
 * from the name, which changes), the same for the caption line and the group tile rim. Palette and
 * hash are the SDK's [DynamicColorGenerator], lightened for the call screen, pinned to dark.
 *
 * Off the call screen (the post-call journal, on a light or dark thread) the SAME palette colour is
 * read through [AuthorInk] (#17874, `docs/product/appels-vue-finale.md` law 4): as is when it already
 * holds 4,5:1 on what the thread paints, else the smallest step toward the theme ink — the web's and
 * iOS's tint, and the call screen's own colour is untouched.
 */
object CallSpeakerColor {
    fun hex(userId: String): String =
        DynamicColorGenerator.adaptedColor(DynamicColorGenerator.colorForName(userId), DynamicColorGenerator.ThemeMode.DARK)

    fun hex(userId: String, mode: DynamicColorGenerator.ThemeMode): String =
        AuthorInk.hex(DynamicColorGenerator.colorForName(userId), mode)

    /** The colour of a SENTENCE on the call screen: [hex], `null` (the theme's ink) for an original. */
    fun textHex(userId: String, servesTranslation: Boolean): String? = if (servesTranslation) hex(userId) else null

    /**
     * The colour of a SENTENCE: the speaker's when it serves a translation, `null` (the theme's ink)
     * for an original, the reader's own words included. The name always carries [hex].
     */
    fun textHex(userId: String, servesTranslation: Boolean, mode: DynamicColorGenerator.ThemeMode): String? =
        if (servesTranslation) hex(userId, mode) else null
}
