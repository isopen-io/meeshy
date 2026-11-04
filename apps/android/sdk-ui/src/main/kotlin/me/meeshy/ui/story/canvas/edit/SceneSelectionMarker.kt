package me.meeshy.ui.story.canvas.edit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius

/** Le dessin du marqueur de sélection (miroir de `StoryCanvasUIView+SelectionMarker`, vue `1c`). */
public object SceneSelectionStyle {
    public val FRAME_WIDTH: Dp = 2.dp
    public val FRAME_RADIUS: Dp = MeeshyRadius.xs
    public val HANDLE_SIZE: Dp = 10.dp
    public val BADGE_HEIGHT: Dp = 18.dp
    public val BADGE_GAP: Dp = 6.dp
    public val BADGE_RADIUS: Dp = 5.dp
    public const val BADGE_ALPHA: Float = 0.75f
}

/**
 * Le cadre de l'objet sélectionné : trait de marque, quatre poignées d'angle, et le badge sombre posé au-dessus
 * (« TEXT · PLAN FG · z 2 »). À poser dans les bornes de l'objet : il en épouse la boîte, donc suit déplacement,
 * échelle et rotation. [announcement] est la phrase lue par TalkBack ; le badge visuel est alors muet pour
 * ne pas être lu deux fois. [tint] vient des jetons de marque, jamais d'un littéral.
 */
@Composable
public fun SceneSelectionMarker(
    badge: String,
    announcement: String,
    modifier: Modifier = Modifier,
    tint: Color = MeeshyPalette.Indigo400,
    showFrame: Boolean = true,
) {
    val handle = SceneSelectionStyle.HANDLE_SIZE
    Box(modifier.semantics { contentDescription = announcement }) {
        if (showFrame) {
            Box(
                Modifier
                    .fillMaxSize()
                    .border(SceneSelectionStyle.FRAME_WIDTH, tint, RoundedCornerShape(SceneSelectionStyle.FRAME_RADIUS)),
            )
            listOf(Alignment.TopStart, Alignment.TopEnd, Alignment.BottomStart, Alignment.BottomEnd).forEach { corner ->
                Box(
                    Modifier
                        .align(corner)
                        .offset(
                            x = if (corner == Alignment.TopStart || corner == Alignment.BottomStart) -handle / 2 else handle / 2,
                            y = if (corner == Alignment.TopStart || corner == Alignment.TopEnd) -handle / 2 else handle / 2,
                        )
                        .size(handle)
                        .clip(CircleShape)
                        .background(Color.White)
                        .border(SceneSelectionStyle.FRAME_WIDTH, tint, CircleShape),
                )
            }
        }
        Text(
            text = badge,
            color = tint,
            fontSize = 9.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = FontFamily.Monospace,
            letterSpacing = 0.7.sp,
            modifier = Modifier
                .align(Alignment.TopStart)
                .offset(y = -(SceneSelectionStyle.BADGE_HEIGHT + SceneSelectionStyle.BADGE_GAP))
                .clip(RoundedCornerShape(SceneSelectionStyle.BADGE_RADIUS))
                .background(Color.Black.copy(alpha = SceneSelectionStyle.BADGE_ALPHA))
                .padding(horizontal = 7.dp, vertical = 3.dp)
                .clearAndSetSemantics { },
        )
    }
}
