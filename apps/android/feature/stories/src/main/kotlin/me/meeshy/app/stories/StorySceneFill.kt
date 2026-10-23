package me.meeshy.app.stories

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.theme.HexColor
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.theme.hexColor

/**
 * What paints a story scene — ONE law for the composer and the reader (loi 6, #12314): the
 * slide's chosen colour or gradient, and without a readable one the author gradient (the
 * author's colour down to black), exactly what the reader shows. iOS previews the chosen
 * colour on the composer scene from the first frame (`StoryComposerView+Canvas.swift`).
 */
sealed interface StorySceneFill {
    data class Solid(val hex: String) : StorySceneFill
    data class Linear(val start: String, val end: String) : StorySceneFill
    data class AuthorGradient(val accentHex: String) : StorySceneFill

    companion object {
        fun resolve(background: StoryBackgroundValue?, accentHex: String): StorySceneFill = when (background) {
            is StoryBackgroundValue.Hex ->
                if (readable(background.hex)) Solid(background.hex) else AuthorGradient(accentHex)
            is StoryBackgroundValue.Gradient ->
                if (readable(background.start) && readable(background.end)) {
                    Linear(background.start, background.end)
                } else {
                    AuthorGradient(accentHex)
                }
            null -> AuthorGradient(accentHex)
        }

        /** The author colour the story tray gives an author: display name, else username. */
        fun authorAccentHex(user: MeeshyUser?): String =
            DynamicColorGenerator.colorForName(
                user?.displayName?.takeIf { it.isNotBlank() } ?: user?.username.orEmpty(),
            )

        private fun readable(hex: String): Boolean = HexColor.parse(hex) != null
    }
}

/** The Compose brush of a [StorySceneFill] — glue, shared by the composer scene and the reader. */
internal fun StorySceneFill.brush(): Brush = when (this) {
    is StorySceneFill.Solid -> SolidColor(hexColor(hex))
    is StorySceneFill.Linear -> Brush.linearGradient(listOf(hexColor(start), hexColor(end)))
    is StorySceneFill.AuthorGradient -> Brush.verticalGradient(listOf(hexColor(accentHex, Color.Black), Color.Black))
}
