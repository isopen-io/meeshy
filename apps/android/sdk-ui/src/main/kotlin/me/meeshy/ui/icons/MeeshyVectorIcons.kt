package me.meeshy.ui.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * Vecteurs maison des SF Symbols de messagerie sans équivalent Material fidèle (queue de bulle,
 * traduction, micro à ondes...). Grille 24 x 24 dp, un seul tracé plein teinté par `LocalContentColor` ;
 * les rôles dont la forme a un sens de lecture (queue de bulle) sont AutoMirrored.
 */
public object MeeshyVectorIcons {
    /** `bubble.left.fill` : bulle pleine, queue en bas à gauche. */
    public val BubbleTail: ImageVector by lazy {
        icon(name = "Meeshy.BubbleTail", autoMirror = true) {
            fillPath { bubbleOutline() }
        }
    }

    /** `bubble.right` : contour de bulle, queue en bas à gauche (miroir RTL pour la bulle sortante). */
    public val BubbleTailOutline: ImageVector by lazy {
        icon(name = "Meeshy.BubbleTailOutline", autoMirror = true) {
            fillPath(PathFillType.EvenOdd) {
                bubbleOutline()
                bubbleInline()
            }
        }
    }

    /** `character.bubble` : bulle pleine dont un « A » est évidé, signe de traduction. */
    public val TranslateBubble: ImageVector by lazy {
        icon(name = "Meeshy.TranslateBubble", autoMirror = true) {
            fillPath(PathFillType.EvenOdd) {
                bubbleOutline()
                moveTo(12f, 6.5f)
                lineTo(16.2f, 15f)
                horizontalLineTo(14.5f)
                lineTo(13.7f, 13.2f)
                horizontalLineTo(10.3f)
                lineTo(9.5f, 15f)
                horizontalLineTo(7.8f)
                close()
                moveTo(12f, 9.2f)
                lineTo(13.1f, 11.6f)
                horizontalLineTo(10.9f)
                close()
            }
        }
    }

    /** `waveform.and.mic` : micro encadré de deux barres d'onde. */
    public val WaveformMic: ImageVector by lazy {
        icon(name = "Meeshy.WaveformMic") {
            fillPath {
                moveTo(12f, 2f)
                arcToRelative(3f, 3f, 0f, false, false, -3f, 3f)
                verticalLineToRelative(6f)
                arcToRelative(3f, 3f, 0f, false, false, 6f, 0f)
                verticalLineTo(5f)
                arcToRelative(3f, 3f, 0f, false, false, -3f, -3f)
                close()
                rect(11f, 15f, 2f, 4f)
                rect(8f, 19f, 8f, 2f)
                rect(2.5f, 8f, 2f, 6f)
                rect(19.5f, 8f, 2f, 6f)
                rect(6f, 5f, 2f, 10f)
                rect(16f, 5f, 2f, 10f)
            }
        }
    }

    /** `star.slash` : étoile pleine barrée d'une diagonale. */
    public val StarSlash: ImageVector by lazy {
        icon(name = "Meeshy.StarSlash") {
            fillPath {
                moveTo(12f, 17.27f)
                lineTo(18.18f, 21f)
                lineToRelative(-1.64f, -7.03f)
                lineTo(22f, 9.24f)
                lineToRelative(-7.19f, -0.61f)
                lineTo(12f, 2f)
                lineTo(9.19f, 8.63f)
                lineTo(2f, 9.24f)
                lineToRelative(5.46f, 4.73f)
                lineTo(5.82f, 21f)
                close()
            }
            fillPath {
                moveTo(3.3f, 2.4f)
                lineTo(2f, 3.7f)
                lineTo(20.7f, 22.4f)
                lineTo(22f, 21.1f)
                close()
            }
        }
    }

    /** `person.and.background.dotted` : silhouette devant un cadre pointillé (détourage). */
    public val PersonBackgroundDotted: ImageVector by lazy {
        icon(name = "Meeshy.PersonBackgroundDotted") {
            fillPath {
                moveTo(12f, 5f)
                arcToRelative(3f, 3f, 0f, true, false, 0f, 6f)
                arcToRelative(3f, 3f, 0f, true, false, 0f, -6f)
                close()
                moveTo(6f, 19f)
                curveTo(6f, 16f, 9f, 14f, 12f, 14f)
                reflectiveCurveTo(18f, 16f, 18f, 19f)
                close()
                rect(2f, 2f, 3f, 2f)
                rect(2f, 2f, 2f, 3f)
                rect(19f, 2f, 3f, 2f)
                rect(20f, 2f, 2f, 3f)
                rect(2f, 20f, 3f, 2f)
                rect(2f, 19f, 2f, 3f)
                rect(19f, 20f, 3f, 2f)
                rect(20f, 19f, 2f, 3f)
            }
        }
    }
}

private fun icon(name: String, autoMirror: Boolean = false, block: ImageVector.Builder.() -> Unit): ImageVector =
    ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
        autoMirror = autoMirror,
    ).apply(block).build()

private fun ImageVector.Builder.fillPath(
    fillType: PathFillType = PathFillType.NonZero,
    block: PathBuilder.() -> Unit,
) {
    path(fill = SolidColor(Color.Black), pathFillType = fillType, pathBuilder = block)
}

private fun PathBuilder.rect(x: Float, y: Float, width: Float, height: Float) {
    moveTo(x, y)
    horizontalLineToRelative(width)
    verticalLineToRelative(height)
    horizontalLineToRelative(-width)
    close()
}

private fun PathBuilder.bubbleOutline() {
    moveTo(7f, 3f)
    horizontalLineTo(17f)
    arcToRelative(4f, 4f, 0f, false, true, 4f, 4f)
    verticalLineToRelative(6f)
    arcToRelative(4f, 4f, 0f, false, true, -4f, 4f)
    horizontalLineTo(10f)
    lineTo(3f, 21.5f)
    verticalLineTo(7f)
    arcToRelative(4f, 4f, 0f, false, true, 4f, -4f)
    close()
}

private fun PathBuilder.bubbleInline() {
    moveTo(7f, 4.8f)
    horizontalLineTo(17f)
    arcToRelative(2.2f, 2.2f, 0f, false, true, 2.2f, 2.2f)
    verticalLineToRelative(6f)
    arcToRelative(2.2f, 2.2f, 0f, false, true, -2.2f, 2.2f)
    horizontalLineTo(9.4f)
    lineTo(4.8f, 18.2f)
    verticalLineTo(7f)
    arcToRelative(2.2f, 2.2f, 0f, false, true, 2.2f, -2.2f)
    close()
}
