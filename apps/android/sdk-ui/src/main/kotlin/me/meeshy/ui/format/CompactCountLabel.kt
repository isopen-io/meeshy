package me.meeshy.ui.format

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.TextStyle
import androidx.core.os.ConfigurationCompat
import java.util.Locale
import me.meeshy.sdk.model.format.CompactCountFormat

/** La locale du lecteur telle que l'appareil la rapporte (première de la liste). */
@Composable
public fun rememberReaderLocale(): Locale {
    val configuration = LocalConfiguration.current
    return remember(configuration) {
        ConfigurationCompat.getLocales(configuration).get(0) ?: Locale.getDefault()
    }
}

/** L'abrégé « 1,5 k » d'un compteur, dans la locale du lecteur — miroir de `CompactCountLabel` iOS. */
@Composable
public fun CompactCountLabel(
    count: Int,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    style: TextStyle = LocalTextStyle.current,
) {
    val locale = rememberReaderLocale()
    val text = remember(count, locale) { CompactCountFormat.text(count, locale) }
    Text(text = text, modifier = modifier, color = color, style = style)
}
