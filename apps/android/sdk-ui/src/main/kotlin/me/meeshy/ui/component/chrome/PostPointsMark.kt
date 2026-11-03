package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.PostViewerPoints
import me.meeshy.sdk.model.format.CompactCountFormat
import me.meeshy.ui.R
import me.meeshy.ui.format.rememberReaderLocale
import me.meeshy.ui.icons.MeeshyIcons

/**
 * « · ✦+99 » à côté de la date d'un post (iOS `PostPointsMark`) : ce que ce post a rapporté au lecteur.
 * Ne paraît que pour un gain (`null` ou 0 ⇒ rien, [PostViewerPoints.shown]). [color] est l'encre de la date.
 * TalkBack lit « Ce post t'a rapporté 99 points » (singulier à 1).
 */
@Composable
public fun PostPointsMark(viewerPoints: Int?, color: Color, modifier: Modifier = Modifier) {
    val points = PostViewerPoints.shown(viewerPoints) ?: return
    val locale = rememberReaderLocale()
    val text = remember(points, locale) { "+" + CompactCountFormat.text(points, locale) }
    val description = if (points == 1) {
        stringResource(R.string.post_points_a11y_one, points.toString())
    } else {
        stringResource(R.string.post_points_a11y_other, points.toString())
    }
    val style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Normal, color = color, fontFeatureSettings = "tnum")
    Row(
        modifier = modifier.clearAndSetSemantics { contentDescription = description },
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = "·", style = style, maxLines = 1)
        Icon(MeeshyIcons.Sparkles, contentDescription = null, tint = color, modifier = Modifier.size(11.dp))
        Text(text = text, style = style, maxLines = 1)
    }
}
