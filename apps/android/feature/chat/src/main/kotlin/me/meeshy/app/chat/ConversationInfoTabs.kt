package me.meeshy.app.chat

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les onglets de la fiche Conversation, dans l'ordre d'iOS (`ConversationInfoSheet.InfoTab`). */
internal enum class ConversationInfoTab(val labelRes: Int) {
    MEMBERS(R.string.conversation_info_tab_members),
    MEDIA(R.string.conversation_info_tab_media),
    STATS(R.string.conversation_info_tab_stats),
    OPTIONS(R.string.conversation_info_tab_options),
}

/** Ce que montre chaque onglet ; chaque contenu reçoit la place qui reste sous la barre d'onglets. */
internal class ConversationInfoTabSlots(
    val members: @Composable (Modifier) -> Unit,
    val media: @Composable (Modifier) -> Unit,
    val stats: @Composable (Modifier) -> Unit,
    val options: @Composable (Modifier) -> Unit,
) {
    @Composable
    fun Content(tab: ConversationInfoTab, modifier: Modifier) = when (tab) {
        ConversationInfoTab.MEMBERS -> members(modifier)
        ConversationInfoTab.MEDIA -> media(modifier)
        ConversationInfoTab.STATS -> stats(modifier)
        ConversationInfoTab.OPTIONS -> options(modifier)
    }
}

/** L'aperçu des épinglés au-dessus des onglets (iOS `pinnedPreview`) : les deux plus récents, puis « Voir les N ». */
internal data class ConversationInfoPinnedPreview(val rows: List<PinnedMessageRow>, val seeAllCount: Int?) {
    companion object {
        private const val SHOWN = 2

        fun of(pins: List<PinnedMessageRow>): ConversationInfoPinnedPreview? =
            if (pins.isEmpty()) null else ConversationInfoPinnedPreview(pins.take(SHOWN), pins.size.takeIf { it > SHOWN })
    }
}

/** La barre d'onglets puis le contenu de l'onglet choisi (Membres d'abord, comme iOS). */
@Composable
internal fun ConversationInfoTabbedArea(
    accentColor: Color,
    slots: ConversationInfoTabSlots,
    modifier: Modifier = Modifier,
) {
    var selected by rememberSaveable { mutableStateOf(ConversationInfoTab.MEMBERS) }
    Column(modifier = modifier) {
        ConversationInfoTabBar(selected = selected, accentColor = accentColor, onSelect = { selected = it })
        Crossfade(targetState = selected, modifier = Modifier.fillMaxWidth().weight(1f, fill = false), label = "info-tab") { tab ->
            slots.Content(tab, Modifier.fillMaxSize())
        }
    }
}

@Composable
private fun ConversationInfoTabBar(selected: ConversationInfoTab, accentColor: Color, onSelect: (ConversationInfoTab) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg)
            .selectableGroup(),
    ) {
        ConversationInfoTab.entries.forEach { tab ->
            val isSelected = tab == selected
            Column(
                modifier = Modifier
                    .weight(1f)
                    .selectable(selected = isSelected, role = Role.Tab, onClick = { onSelect(tab) })
                    .padding(top = MeeshySpacing.sm),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = stringResource(tab.labelRes),
                    fontSize = MeeshyFontSize.subhead,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (isSelected) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(MeeshySpacing.xsPlus))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(2.dp)
                        .clip(RoundedCornerShape(1.dp))
                        .background(if (isSelected) accentColor else Color.Transparent),
                )
            }
        }
    }
}

/** La carte des épinglés : un toucher ouvre la liste complète (iOS `showAllPinnedMessages`). */
@Composable
internal fun ConversationInfoPinnedPreviewCard(
    preview: ConversationInfoPinnedPreview,
    accentColor: Color,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(MeeshyRadius.smPlus)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(accentColor.copy(alpha = if (MeeshyTheme.isDark) 0.08f else 0.05f))
            .border(1.dp, accentColor.copy(alpha = 0.2f), shape)
            .clickable(role = Role.Button, onClick = onOpen)
            .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.xs),
    ) {
        preview.rows.forEach { row -> PinnedPreviewRow(row, accentColor) }
        preview.seeAllCount?.let { count ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xsPlus),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.conversation_info_pinned_see_all, count),
                    fontSize = MeeshyFontSize.footnote,
                    fontWeight = FontWeight.SemiBold,
                    color = accentColor,
                )
                Icon(MeeshyIcons.ChevronForward, contentDescription = null, tint = accentColor, modifier = Modifier.size(12.dp))
            }
        }
    }
}

@Composable
private fun PinnedPreviewRow(row: PinnedMessageRow, accentColor: Color) {
    val sender = row.senderName ?: if (row.isOutgoing) stringResource(R.string.chat_pinned_you) else "?"
    val body = when (val snippet = row.snippet) {
        is PinnedSnippet.Text -> snippet.value
        PinnedSnippet.Image -> stringResource(R.string.chat_unread_photo)
        PinnedSnippet.File -> stringResource(R.string.chat_unread_attachment)
        PinnedSnippet.Empty -> stringResource(R.string.chat_pinned_message)
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        Icon(MeeshyIcons.PinFilled, contentDescription = null, tint = accentColor, modifier = Modifier.size(12.dp).rotate(45f))
        Text(
            text = sender,
            fontSize = MeeshyFontSize.small,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
        )
        Text(
            text = body,
            fontSize = MeeshyFontSize.small,
            color = MeeshyTheme.tokens.textSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}
