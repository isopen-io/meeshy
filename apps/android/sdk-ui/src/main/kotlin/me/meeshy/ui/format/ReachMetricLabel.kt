package me.meeshy.ui.format

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.format.CompactCountFormat
import me.meeshy.sdk.model.format.LocalizedNumber

/**
 * Un compteur de portée — icône, nombre abrégé — présenté à TalkBack comme UN élément nommé :
 * `contentDescription` = le libellé (« Vues »), `stateDescription` = le nombre EXACT, jamais
 * l'abrégé (miroir de `ReachMetricLabel` iOS). Le texte visible fait 11 sp.
 */
@Composable
public fun ReachMetricLabel(
    icon: ImageVector,
    count: Int,
    label: String,
    tint: Color,
    modifier: Modifier = Modifier,
) {
    val locale = rememberReaderLocale()
    val visible = remember(count, locale) { CompactCountFormat.text(count, locale) }
    val spoken = remember(count, locale) { LocalizedNumber.exact(count, locale) }
    Row(
        modifier = modifier.clearAndSetSemantics {
            contentDescription = label
            stateDescription = spoken
        },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(11.dp))
        Text(
            text = visible,
            color = tint,
            style = LocalTextStyle.current.copy(fontSize = 11.sp, fontWeight = FontWeight.Medium),
        )
    }
}
