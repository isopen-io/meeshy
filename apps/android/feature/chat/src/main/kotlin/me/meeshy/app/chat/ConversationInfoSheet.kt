package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.NunitoFontFamily

/** Une entrée de la fiche Conversation : elle ouvre une feuille existante. */
internal class ConversationInfoEntry(val icon: ImageVector, val label: String, val onClick: () -> Unit)

/**
 * La fiche Conversation (pendant minimal de `ConversationInfoSheet` iOS) : ouverte par le
 * toucher de l'avatar d'un groupe ou l'entrée « Conversation » du menu de l'avatar. Elle
 * accueille ce que l'en-tête iOS ne montre pas : membres, statistiques, analyse, lien de
 * partage et réglages, chacun ouvrant sa feuille.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationInfoSheet(
    title: String,
    subtitle: String?,
    avatarUrl: String?,
    accentColor: Color,
    entries: List<ConversationInfoEntry>,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        // La barre de navigation système (bouton à trois touches du S8 compris) ne recouvre
        // jamais la dernière entrée.
        contentWindowInsets = { WindowInsets.navigationBars },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            MeeshyAvatar(
                name = title,
                size = 80.dp,
                containerColor = accentColor,
                imageUrl = avatarUrl,
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
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(MeeshySpacing.lg))
                    .padding(vertical = MeeshySpacing.xs),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
            ) {
                entries.forEach { entry ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(MeeshySpacing.md))
                            .clickable(role = Role.Button, onClick = entry.onClick)
                            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.md),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(entry.icon, contentDescription = null, tint = accentColor, modifier = Modifier.size(22.dp))
                        Spacer(Modifier.width(MeeshySpacing.md))
                        Text(
                            text = entry.label,
                            modifier = Modifier.weight(1f),
                            fontSize = MeeshyFontSize.body,
                            color = MeeshyTheme.tokens.textPrimary,
                        )
                        Icon(
                            MeeshyIcons.ChevronForward,
                            contentDescription = null,
                            tint = MeeshyTheme.tokens.textSecondary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
    }
}
