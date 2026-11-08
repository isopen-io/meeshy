package me.meeshy.ui.component.people

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le champ de recherche des écrans Personnes (iOS `ContactsSearchField`) : fond `inputBackground`, rayon
 * 10 dp, loupe, ni correction automatique ni majuscule, clavier de recherche. La croix d'effacement
 * n'existe que si le texte est non vide.
 */
@Composable
public fun PeopleSearchField(
    query: String,
    onQueryChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val clearLabel = stringResource(R.string.common_clear_search)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(tokens.inputBackground, RoundedCornerShape(MeeshyRadius.sm))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        Icon(
            imageVector = MeeshyIcons.Search,
            contentDescription = null,
            tint = tokens.textMuted,
            modifier = Modifier.size(MeeshyFontSize.label.value.dp),
        )
        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (query.isEmpty()) {
                Text(text = placeholder, color = tokens.textMuted, fontSize = MeeshyFontSize.label)
            }
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = TextStyle(color = tokens.textPrimary, fontSize = MeeshyFontSize.label),
                cursorBrush = SolidColor(MeeshyPalette.Indigo500),
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.None,
                    autoCorrectEnabled = false,
                    imeAction = ImeAction.Search,
                ),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (query.isNotEmpty()) {
            Box(
                modifier = Modifier
                    .size(MeeshyControlSize.minTouchTarget)
                    .clickable(role = Role.Button) { onQueryChange("") }
                    .semantics { contentDescription = clearLabel },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = MeeshyIcons.CloseCircleFilled,
                    contentDescription = null,
                    tint = tokens.textMuted,
                    modifier = Modifier.size(MeeshyFontSize.label.value.dp),
                )
            }
        }
    }
}
