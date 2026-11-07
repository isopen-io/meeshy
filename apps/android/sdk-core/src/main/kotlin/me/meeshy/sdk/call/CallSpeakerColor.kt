package me.meeshy.sdk.call

import me.meeshy.sdk.theme.DynamicColorGenerator

/**
 * The STABLE colour of a person in a call — iOS `CallSpeakerColor`: derived from the user id (never
 * from the name, which changes), the same for the caption line and the group tile rim. Palette and
 * hash are the SDK's [DynamicColorGenerator], lightened for the call screen, pinned to dark.
 *
 * Off the call screen (the post-call journal, on a light or dark thread) the SAME colour adapts to the
 * thread's scheme (#16634, `docs/product/appels-vue-finale.md` law 4): a person keeps their colour
 * before and after the call ends.
 */
object CallSpeakerColor {
    fun hex(userId: String): String = hex(userId, DynamicColorGenerator.ThemeMode.DARK)

    fun hex(userId: String, mode: DynamicColorGenerator.ThemeMode): String =
        DynamicColorGenerator.adaptedColor(DynamicColorGenerator.colorForName(userId), mode)

    /**
     * The colour of a SENTENCE: the speaker's when it serves a translation, `null` (the theme's ink)
     * for an original, the reader's own words included. The name always carries [hex].
     */
    fun textHex(
        userId: String,
        servesTranslation: Boolean,
        mode: DynamicColorGenerator.ThemeMode = DynamicColorGenerator.ThemeMode.DARK,
    ): String? = if (servesTranslation) hex(userId, mode) else null
}
