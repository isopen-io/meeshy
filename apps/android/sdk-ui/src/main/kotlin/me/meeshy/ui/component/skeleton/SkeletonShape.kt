package me.meeshy.ui.component.skeleton

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshyTheme

/** Teinte de remplissage d'un placeholder : blanc 8 % en sombre, noir 4 % en clair (iOS `placeholderColor`). */
@Composable
internal fun skeletonPlaceholderColor(): Color =
    if (MeeshyTheme.isDark) Color.White.copy(alpha = MeeshyOpacity.subtle) else Color.Black.copy(alpha = MeeshyOpacity.faint)

@Composable
internal fun skeletonCardBackground(): Color =
    if (MeeshyTheme.isDark) Color.White.copy(alpha = MeeshyOpacity.faint) else Color.Black.copy(alpha = 0.02f)

@Composable
internal fun skeletonRingColor(): Color =
    if (MeeshyTheme.isDark) Color.White.copy(alpha = MeeshyOpacity.subtle) else Color.Black.copy(alpha = MeeshyOpacity.subtle)

/** Miroir de `SkeletonShape` (iOS) : rectangle arrondi textMuted 15 % + reflet, masque a TalkBack. */
@Composable
public fun SkeletonShape(
    modifier: Modifier = Modifier,
    width: Dp? = null,
    height: Dp = 16.dp,
    cornerRadius: Dp = MeeshyRadius.md,
) {
    SkeletonBlock(modifier = modifier, width = width, height = height, shape = RoundedCornerShape(cornerRadius))
}

/** Bloc de squelette de forme libre (cercle, anneau) avec le meme remplissage et le meme reflet. */
@Composable
public fun SkeletonBlock(
    modifier: Modifier = Modifier,
    width: Dp? = null,
    height: Dp = 16.dp,
    shape: Shape = RoundedCornerShape(MeeshyRadius.md),
    color: Color = MeeshyTheme.tokens.textMuted.copy(alpha = MeeshyOpacity.light),
) {
    val sized = (if (width != null) Modifier.width(width) else Modifier).height(height)
    Box(
        modifier = modifier
            .then(sized)
            .clip(shape)
            .background(color)
            .skeletonShimmer()
            .clearAndSetSemantics {},
    )
}
