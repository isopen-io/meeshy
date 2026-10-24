package me.meeshy.app.conversations

import me.meeshy.sdk.model.displayedAvatar
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.theme.LentilleMetrics
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Le dessin de la rangée plate Lentille — sans fond, sans bordure, sans ombre (la hauteur de 84 dp,
 * la sourdine, la barre de sélection et les gestes sont l'affaire de [ConversationRowContainer]).
 * Avatar de 44 dp dans son anneau d'accent, puis trois lignes: le titre (nom, glyphes, points
 * d'étiquettes, pastille de non-lus ou bouton « Rejoindre » l'appel en cours), la ligne 2
 * (frappe > brouillon > aperçu) et la date à droite.
 * Tout ce qu'elle dessine arrive résolu; l'accent est un paramètre, jamais une couleur codée.
 */
@Composable
internal fun ConversationFlatRow(
    model: ConversationRowModel,
    title: String,
    accent: Color,
    secondary: Color,
    isPinned: Boolean,
    isMuted: Boolean,
    reaction: String?,
    tags: List<String>,
    rowPreview: RowPreview,
    line2: RowLine2,
    timeLabel: String?,
    modifier: Modifier = Modifier,
    onJoinCall: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(
                horizontal = LentilleMetrics.Row.paddingHorizontal,
                vertical = LentilleMetrics.Row.paddingVertical,
            ),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ConversationRowAvatar(
            name = title,
            accent = accent,
            secondary = secondary,
            presence = ConversationRowPrecedence.presence(model.presence, isTyping = line2 == RowLine2.TYPING),
            storyRing = model.storyRing,
            moodEmoji = model.moodEmoji,
            here = model.here,
            imageUrl = model.conversation.displayedAvatar(model.currentUserId),
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        ) {
            ConversationRowTitleLine(
                title = title,
                isPinned = isPinned,
                isMuted = isMuted,
                isLocked = model.isLocked,
                reaction = reaction,
                tags = tags,
                unreadCount = model.conversation.unreadCount,
                accent = accent,
                onJoinCall = onJoinCall,
            )
            ConversationRowLine2(line2 = line2, preview = rowPreview, accent = accent)
            ConversationRowDateLine(timeLabel = timeLabel)
        }
    }
}
