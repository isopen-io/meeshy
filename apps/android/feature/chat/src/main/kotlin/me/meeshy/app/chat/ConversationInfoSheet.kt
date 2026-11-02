package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberConversationHere
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.NunitoFontFamily

/** Une entrée de la fiche Conversation : elle ouvre une feuille existante. */
internal class ConversationInfoEntry(
    val icon: ImageVector,
    val label: String,
    val onClick: () -> Unit,
    val subtitle: String? = null,
)

/**
 * La fiche Conversation (pendant de `ConversationInfoSheet` iOS) : ouverte par le toucher de
 * l'avatar d'un groupe ou l'entrée « Conversation » du menu de l'avatar. Même hiérarchie qu'iOS
 * (#13785) : l'en-tête, [headerActions] (Bloquer, Partager, Quitter), les [entries] qui ouvrent une
 * feuille (chiffrement, numéro de sécurité, réglages), l'aperçu des épinglés, puis les onglets
 * Membres, Médias, Stats et Options ([tabs]). L'en-tête défile seul s'il est trop haut ; l'onglet
 * prend la place qui reste.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationInfoSheet(
    title: String,
    subtitle: String?,
    avatarUrl: String?,
    accentColor: Color,
    peerUserId: String?,
    conversationId: String?,
    entries: List<ConversationInfoEntry>,
    tabs: ConversationInfoTabSlots,
    onDismiss: () -> Unit,
    pinnedPreview: ConversationInfoPinnedPreview? = null,
    onOpenPinned: () -> Unit = {},
    headerActions: @Composable () -> Unit = {},
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        // La barre de navigation système (bouton à trois touches du S8 compris) ne recouvre
        // jamais le bas de l'onglet.
        contentWindowInsets = { WindowInsets.navigationBars },
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                ConversationInfoAvatar(
                    title = title,
                    accentColor = accentColor,
                    avatarUrl = avatarUrl,
                    peerUserId = peerUserId,
                    conversationId = conversationId,
                )
                Spacer(Modifier.size(MeeshySpacing.md))
                Text(
                    text = title,
                    fontFamily = NunitoFontFamily,
                    fontWeight = FontWeight.Bold,
                    fontSize = MeeshyFontSize.title3,
                    color = MeeshyTheme.tokens.textPrimary,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (subtitle != null) {
                    Text(
                        text = subtitle,
                        fontSize = MeeshyFontSize.footnote,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
                Spacer(Modifier.size(MeeshySpacing.lg))
                headerActions()
                Spacer(Modifier.size(MeeshySpacing.sm))
                entries.forEach { entry -> ConversationInfoEntryRow(entry, accentColor) }
                pinnedPreview?.let { preview ->
                    Spacer(Modifier.size(MeeshySpacing.sm))
                    ConversationInfoPinnedPreviewCard(preview, accentColor, onOpenPinned)
                }
                Spacer(Modifier.size(MeeshySpacing.md))
            }
            ConversationInfoTabbedArea(
                accentColor = accentColor,
                slots = tabs,
                modifier = Modifier.fillMaxWidth().weight(1f),
            )
        }
    }
}

/** Une entrée de la fiche : l'icône à l'accent de la conversation, le libellé, le sous-titre, le chevron. */
@Composable
internal fun ConversationInfoEntryRow(entry: ConversationInfoEntry, accentColor: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshySpacing.md))
            .clickable(role = Role.Button, onClick = entry.onClick)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(entry.icon, contentDescription = null, tint = accentColor, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(MeeshySpacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Text(text = entry.label, fontSize = MeeshyFontSize.body, color = MeeshyTheme.tokens.textPrimary)
            entry.subtitle?.let {
                Text(text = it, fontSize = MeeshyFontSize.footnote, color = MeeshyTheme.tokens.textSecondary)
            }
        }
        Icon(
            MeeshyIcons.ChevronForward,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(18.dp),
        )
    }
}

/** Le grand avatar de la feuille : le point du pair d'une directe, « ici » s'il regarde CETTE conversation. */
@Composable
internal fun ConversationInfoAvatar(
    title: String,
    accentColor: Color,
    avatarUrl: String?,
    peerUserId: String?,
    conversationId: String?,
) {
    MeeshyAvatar(
        name = title,
        size = 80.dp,
        containerColor = accentColor,
        imageUrl = avatarUrl,
        presence = rememberPresence(peerUserId),
        here = rememberConversationHere(peerUserId, conversationId),
    )
}
