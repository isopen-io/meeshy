package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.AppearanceScheme
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import java.util.Locale

/**
 * Le sélecteur d'accent personnel (miroir du choix d'accent iOS) : « Automatique » (l'accent calculé) puis les seize
 * teintes de la gamme, dans la teinte du schéma courant. Sans catalogue chargé il n'affiche que « Automatique ».
 */
@Composable
internal fun ConversationAccentPicker(
    catalog: AppearanceCatalog?,
    selectedKey: String?,
    autoColor: Color,
    onSelect: (String?) -> Unit,
) {
    val scheme = AppearanceScheme.of(MeeshyTheme.isDark)
    val language = remember { Locale.getDefault().language }
    val ring = MeeshyTheme.tokens.textPrimary
    LazyRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        item(key = "accent-auto") {
            AccentSwatch(
                label = stringResource(R.string.conversation_appearance_accent_auto),
                selected = selectedKey == null,
                color = autoColor,
                ring = ring,
                onClick = { onSelect(null) },
            ) { Icon(MeeshyIcons.MagicWand, null, tint = Color.White, modifier = Modifier.size(20.dp)) }
        }
        items(catalog?.gamut?.entries.orEmpty(), key = { "accent-${it.key}" }) { entry ->
            AccentSwatch(
                label = catalog?.gamutName(entry.key, language) ?: entry.name,
                selected = selectedKey == entry.key,
                color = hexColor(entry.shade(scheme).accent),
                ring = ring,
                onClick = { onSelect(entry.key) },
            ) {}
        }
    }
}

@Composable
private fun AccentSwatch(
    label: String,
    selected: Boolean,
    color: Color,
    ring: Color,
    onClick: () -> Unit,
    glyph: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label; this.selected = selected },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(color)
                .border(if (selected) 3.dp else 0.dp, if (selected) ring else Color.Transparent, CircleShape),
            contentAlignment = Alignment.Center,
        ) { glyph() }
    }
}
