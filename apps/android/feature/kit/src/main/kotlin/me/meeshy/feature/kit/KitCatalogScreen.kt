package me.meeshy.feature.kit

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogTile
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val MinTouchTarget = 48.dp
private const val LargeFontScale = 2f

/** Les réglages du détail : clair ou sombre, LTR ou RTL, grande police. Ils ne touchent jamais la liste. */
@Immutable
internal data class KitCatalogSettings(
    val isDark: Boolean = true,
    val isRightToLeft: Boolean = false,
    val isLargeFont: Boolean = false,
)

/**
 * Le catalogue du kit : la liste des composants LIVRÉS, et le détail de l'un d'eux. Ses contrôles sont ceux du
 * système, car il existe avant le verre du kit. Ni réseau, ni session, ni donnée. Le retour est celui du système.
 *
 * [initialKey] ouvre le détail d'un composant livré ; une clé inconnue ou non livrée laisse la liste.
 */
@Composable
public fun KitCatalogScreen(
    modifier: Modifier = Modifier,
    initialKey: String? = null,
    entries: List<MeeshyKitCatalogEntry> = MeeshyKitCatalog.entries,
    tileContent: KitTileContent = DefaultKitTileContent,
) {
    val listed = remember(entries) { MeeshyKitCatalog.listed(entries) }
    var openKey by rememberSaveable(entries) { mutableStateOf(KitCatalogLaunch.initialKey(initialKey, entries)) }
    val open = openKey?.let { key -> listed.firstOrNull { it.key == key } }
    BackHandler(enabled = open != null) { openKey = null }

    Column(modifier.fillMaxSize().background(MeeshyTheme.tokens.backgroundPrimary).systemBarsPadding()) {
        if (open == null) {
            KitCatalogList(entries = listed, onOpen = { openKey = it.key })
        } else {
            KitCatalogDetail(entry = open, tileContent = tileContent, onBack = { openKey = null })
        }
    }
}

@Composable
private fun KitCatalogList(entries: List<MeeshyKitCatalogEntry>, onOpen: (MeeshyKitCatalogEntry) -> Unit) {
    KitCatalogHeader(title = KitCatalogLabels.TITLE)
    if (entries.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { MeeshyKitCatalogEmptyState() }
        return
    }
    LazyColumn(Modifier.fillMaxSize()) {
        items(entries, key = { it.key }) { entry ->
            Text(
                text = entry.accessibilityName,
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = MinTouchTarget)
                    .clickable(role = Role.Button) { onOpen(entry) }
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.smPlus),
            )
        }
    }
}

@Composable
private fun KitCatalogDetail(entry: MeeshyKitCatalogEntry, tileContent: KitTileContent, onBack: () -> Unit) {
    var settings by remember { mutableStateOf(KitCatalogSettings()) }
    val density = LocalDensity.current
    val tiles = remember(entry) { entry.tiles }
    MeeshyTheme(darkTheme = settings.isDark) {
        CompositionLocalProvider(
            LocalLayoutDirection provides if (settings.isRightToLeft) LayoutDirection.Rtl else LayoutDirection.Ltr,
            LocalDensity provides if (settings.isLargeFont) Density(density.density, fontScale = LargeFontScale) else density,
        ) {
            Column(Modifier.fillMaxSize().background(MeeshyTheme.tokens.backgroundPrimary)) {
                KitCatalogHeader(
                    title = entry.accessibilityName,
                    onBack = onBack,
                    settings = settings,
                    onSettings = { settings = it },
                )
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(MeeshySpacing.lg),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
                ) {
                    items(tiles, key = { it.id }) { tile -> KitCatalogTile(key = entry.key, tile = tile, content = tileContent) }
                }
            }
        }
    }
}

@Composable
private fun KitCatalogHeader(
    title: String,
    onBack: (() -> Unit)? = null,
    settings: KitCatalogSettings? = null,
    onSettings: (KitCatalogSettings) -> Unit = {},
) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack) {
                Icon(MeeshyIcons.Back, contentDescription = KitCatalogLabels.BACK, tint = MeeshyTheme.tokens.textPrimary)
            }
        }
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = MeeshySpacing.md)
                .semantics { heading() },
        )
        if (settings != null) KitCatalogSettingsMenu(settings = settings, onSettings = onSettings)
    }
}

@Composable
private fun KitCatalogSettingsMenu(settings: KitCatalogSettings, onSettings: (KitCatalogSettings) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { expanded = true }) {
            Icon(MeeshyIcons.Tune, contentDescription = KitCatalogLabels.SETTINGS, tint = MeeshyTheme.tokens.textPrimary)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            SettingRow(KitCatalogLabels.SETTING_DARK, settings.isDark) { onSettings(settings.copy(isDark = it)) }
            SettingRow(KitCatalogLabels.SETTING_RTL, settings.isRightToLeft) { onSettings(settings.copy(isRightToLeft = it)) }
            SettingRow(KitCatalogLabels.SETTING_LARGE_FONT, settings.isLargeFont) { onSettings(settings.copy(isLargeFont = it)) }
        }
    }
}

@Composable
private fun SettingRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    DropdownMenuItem(
        text = { Text(label) },
        leadingIcon = { Checkbox(checked = checked, onCheckedChange = null) },
        onClick = { onChange(!checked) },
        modifier = Modifier.heightIn(min = MinTouchTarget),
    )
}

/** Une tuile du détail : la légende (`id`, vue de la planche, `isPressed`), puis le composant sur le fond de l'état. */
@Composable
private fun KitCatalogTile(key: String, tile: MeeshyKitCatalogTile, content: KitTileContent) {
    val legend = remember(tile) {
        listOfNotNull(tile.state.id, tile.state.boardView, KitCatalogLabels.PRESSED_LEGEND.takeIf { tile.isPressed })
            .joinToString(KitCatalogLabels.LEGEND_SEPARATOR)
    }
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            text = legend,
            style = MaterialTheme.typography.labelMedium.copy(fontFamily = FontFamily.Monospace),
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.semantics { heading() },
        )
        MeeshyKitCatalogStage(
            key = key,
            state = tile.state,
            isPressed = tile.isPressed,
            content = content,
            modifier = Modifier.clip(RoundedCornerShape(MeeshyRadius.md)),
        )
    }
}
