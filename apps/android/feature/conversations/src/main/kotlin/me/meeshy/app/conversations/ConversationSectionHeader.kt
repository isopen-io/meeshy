package me.meeshy.app.conversations

import android.content.Context
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.conversationlist.ConversationListSectionDefaults
import me.meeshy.sdk.model.reading.mode.LentilleFeatureFlags
import me.meeshy.sdk.reading.LentilleFeatureFlagsStore
import me.meeshy.ui.component.CollapsibleSectionHeader
import me.meeshy.ui.component.StickerSectionHeader
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.hexColor

/**
 * L'en-tête d'une section de la liste (iOS `ConversationListSectionHeader`) : UNE vue logique, deux peaux.
 * Interrupteur de la liste Lentille allumé : le sticker majuscules, épinglé par la liste ; éteint : l'en-tête
 * classique au disque d'icône. Le chevron et la pastille de non-lus cachés n'existent que sur une section
 * repliable ; l'état est annoncé par TalkBack (« Développée » / « Réduite, N non lus »).
 */
@Composable
internal fun ConversationSectionHeader(
    section: ConversationSection,
    expanded: Boolean,
    foldedUnread: Int,
    stickerSkin: Boolean,
    onToggle: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val title = section.title ?: stringResource(section.kind.titleRes())
    val description = sectionStateDescription(expanded, foldedUnread)
    val collapsible = ConversationListSectionDefaults.isCollapsible(section.sectionId)
    if (stickerSkin) {
        StickerSectionHeader(
            title = title,
            expanded = expanded,
            foldedUnread = foldedUnread,
            stateDescription = description,
            onToggle = if (collapsible) ({ onToggle(!expanded) }) else null,
            modifier = modifier,
        )
        return
    }
    CollapsibleSectionHeader(
        title = title,
        color = section.containerColor(),
        expanded = expanded,
        count = section.items.size,
        foldedUnread = foldedUnread,
        stateDescription = description,
        onToggle = { onToggle(!expanded) },
        modifier = modifier,
        icon = {
            Icon(
                section.glyph(),
                contentDescription = null,
                tint = section.containerColor(),
                modifier = Modifier.size(16.dp),
            )
        },
    )
}

/** La peau Lentille de la liste (iOS `LentilleFeatureFlag.isLentilleListEnabled`) ; allumée hors application Hilt. */
@Composable
internal fun rememberLentilleListSkin(): Boolean {
    val context: Context = LocalContext.current.applicationContext
    val store = remember(context) {
        runCatching {
            EntryPointAccessors.fromApplication(context, LentilleListSkinEntryPoint::class.java).flagsStore()
        }.getOrNull()
    } ?: return LentilleFeatureFlags().lentilleList
    val flags by store.flags.collectAsState()
    return flags.lentilleList
}

@EntryPoint
@InstallIn(SingletonComponent::class)
internal interface LentilleListSkinEntryPoint {
    fun flagsStore(): LentilleFeatureFlagsStore
}

internal fun ConversationSectionKind.titleRes(): Int = when (this) {
    ConversationSectionKind.PINNED -> R.string.conversations_section_pinned
    // Un en-tête de CATÉGORIE rend le nom de la catégorie (section.title) ; cette ressource n'est que le repli du `when`.
    ConversationSectionKind.CATEGORY -> R.string.conversations_section_all
    ConversationSectionKind.ALL -> R.string.conversations_section_all
}

internal fun ConversationSection.glyph() = when (kind) {
    ConversationSectionKind.PINNED -> Icons.Filled.PushPin
    ConversationSectionKind.CATEGORY -> categoryIconFor(icon)
    ConversationSectionKind.ALL -> Icons.AutoMirrored.Filled.Chat
}

/** La couleur de la section : celle de la catégorie quand elle en a une, sinon la teinte du genre. */
@Composable
internal fun ConversationSection.containerColor(): Color = when (kind) {
    ConversationSectionKind.PINNED -> MeeshyPalette.Error
    ConversationSectionKind.CATEGORY -> color?.let { hexColor(it, MeeshyPalette.Indigo500) } ?: MeeshyPalette.Indigo500
    ConversationSectionKind.ALL -> MeeshyPalette.Indigo500
}

/** La valeur TalkBack de l'en-tête (iOS `SectionFoldedUnread.accessibilityValue`) : « Développée » ou « Réduite, N non lus ». */
@Composable
internal fun sectionStateDescription(expanded: Boolean, foldedUnread: Int): String {
    if (expanded) return stringResource(R.string.links_section_expanded)
    val state = stringResource(R.string.links_section_collapsed)
    if (foldedUnread <= 0) return state
    return "$state, ${pluralStringResource(R.plurals.row_a11y_unread_count, foldedUnread, foldedUnread)}"
}
