package me.meeshy.sdk.call

import me.meeshy.sdk.theme.DynamicColorGenerator

/**
 * The STABLE colour of a person in a call — iOS `CallSpeakerColor`: derived from the user id (never
 * from the name, which changes), the same for the caption line and the group tile rim. Palette and
 * hash are the SDK's [DynamicColorGenerator], lightened for the call screen, pinned to dark.
 */
object CallSpeakerColor {
    fun hex(userId: String): String =
        DynamicColorGenerator.adaptedColor(DynamicColorGenerator.colorForName(userId), DynamicColorGenerator.ThemeMode.DARK)
}
