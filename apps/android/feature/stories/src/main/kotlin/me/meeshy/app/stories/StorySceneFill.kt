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
 * author's colour down to black, on the diagonal of every authored gradient), exactly what the
 * reader shows. The composer writes that floor into the published scene
 * ([StoryBackgroundValue.authorGradient], #14244), so it paints like the gradient it becomes.
 * iOS previews the chosen colour on the composer scene from the first frame
 * (`StoryComposerView+Canvas.swift`).
 */
sealed interface StorySceneFill {
    /** Le sol noir d'un réel (iOS `ReelCardSceneBackdrop`) : sans fond déclaré, la scène se lit sur du noir. */
    data object Black : StorySceneFill

    data class Solid(val hex: String) : StorySceneFill
    data class Linear(val start: String, val end: String) : StorySceneFill
    data class AuthorGradient(val accentHex: String) : StorySceneFill

    companion object {
        fun resolve(
            background: StoryBackgroundValue?,
            accentHex: String,
            floor: SceneFloor = SceneFloor.AUTHOR_GRADIENT,
        ): StorySceneFill {
            val fallback = when (floor) {
                SceneFloor.AUTHOR_GRADIENT -> AuthorGradient(accentHex)
                SceneFloor.BLACK -> Black
            }
            return when (background) {
                is StoryBackgroundValue.Hex -> if (readable(background.hex)) Solid(background.hex) else fallback
                is StoryBackgroundValue.Gradient ->
                    if (readable(background.start) && readable(background.end)) Linear(background.start, background.end) else fallback
                null -> fallback
            }
        }

        /** The author colour the story tray gives an author: display name, else username. */
        fun authorAccentHex(user: MeeshyUser?): String =
            DynamicColorGenerator.colorForName(
                user?.displayName?.takeIf { it.isNotBlank() } ?: user?.username.orEmpty(),
            )

        private fun readable(hex: String): Boolean = HexColor.parse(hex) != null
    }
}

/** Ce qui se lit sous une scène qui ne déclare aucun fond : le dégradé d'auteur du lecteur de stories, ou le noir d'un réel. */
enum class SceneFloor { AUTHOR_GRADIENT, BLACK }

/** The Compose brush of a [StorySceneFill] — glue, shared by the composer scene and the reader. */
internal fun StorySceneFill.brush(): Brush = when (this) {
    is StorySceneFill.Solid -> SolidColor(hexColor(hex))
    is StorySceneFill.Linear -> Brush.linearGradient(listOf(hexColor(start), hexColor(end)))
    StorySceneFill.Black -> SolidColor(Color.Black)
    is StorySceneFill.AuthorGradient -> Brush.linearGradient(listOf(hexColor(accentHex, Color.Black), Color.Black))
}
