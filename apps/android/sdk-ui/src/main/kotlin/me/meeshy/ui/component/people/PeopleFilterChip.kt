package me.meeshy.ui.component.people

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** Le libellé d'une pastille de filtre : « Titre » ou « Titre (n) », le compteur nul ou absent est masqué. */
public object PeopleFilterLabel {
    public fun compose(title: String, count: Int? = null): String =
        if (count != null && count > 0) "$title ($count)" else title
}

/**
 * La pastille de filtre des écrans Personnes (iOS `ContactsFilterChip`) : capsule indigo500 pleine si
 * sélectionnée, contour indigo900 sinon. [hitTarget] porte la cible à 44 dp DANS la zone sensible tout en
 * gardant la capsule compacte. Le libellé n'est jamais coupé : la rangée ([PeopleFilterRow]) défile.
 */
@Composable
public fun PeopleFilterChip(
    title: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    count: Int? = null,
    hitTarget: Boolean = false,
) {
    val shape = RoundedCornerShape(MeeshyRadius.pill)
    val label = PeopleFilterLabel.compose(title, count)
    Box(
        modifier = modifier
            .defaultMinSize(minHeight = if (hitTarget) MeeshyControlSize.tapTarget else MeeshyControlSize.small)
            .clip(shape)
            .clickable(role = Role.Tab, onClick = onClick)
            .semantics { selected = isSelected },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (isSelected) Color.White else MeeshyPalette.Indigo500,
            fontSize = MeeshyFontSize.subhead,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier
                .background(if (isSelected) MeeshyPalette.Indigo500 else Color.Transparent, shape)
                .border(
                    BorderStroke(MeeshyBorder.regular, if (isSelected) Color.Transparent else MeeshyPalette.Indigo900.copy(alpha = MeeshyOpacity.medium)),
                    shape,
                )
                .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.xsPlus),
        )
    }
}

/** La rangée de pastilles : défile horizontalement plutôt que de couper un libellé. */
@Composable
public fun PeopleFilterRow(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier = modifier
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}
