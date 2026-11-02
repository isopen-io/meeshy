package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import me.meeshy.sdk.model.theme.ChromeScheme
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.meeshyText

/**
 * Qui a publié, et quand — avatar, nom, date — posé sur le média. L'avatar est fourni par l'hôte
 * (en général `MeeshyAvatar`, dont il choisit le contexte et l'accent) ; [accessory] porte ce que
 * la surface ajoute sous le nom (crédit d'un son, attribution d'une republication). Une seule
 * annonce TalkBack pour toute la rangée.
 */
@Composable
public fun FullscreenIdentityRow(
    name: String,
    avatar: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    accessory: @Composable () -> Unit = {},
) {
    val halo = legibilityHaloShadow(ChromeScheme.Dark)
    Row(
        modifier.semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        avatar()
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = name,
                    style = meeshyText(MeeshyFontSize.body, FontWeight.SemiBold).withShadow(halo),
                    color = MeeshyMediaChromeColors.ChromeForeground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (subtitle != null) {
                    Text(
                        text = subtitle,
                        style = meeshyText(MeeshyFontSize.small, FontWeight.Medium).withShadow(halo),
                        color = MeeshyMediaChromeColors.ChromeTertiary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            accessory()
        }
    }
}

private fun TextStyle.withShadow(shadow: androidx.compose.ui.graphics.Shadow): TextStyle = copy(shadow = shadow)
