package me.meeshy.ui.component.bubble

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import me.meeshy.ui.theme.MeeshyMessageStateColors
import me.meeshy.ui.component.protection.FlameEyeGlyph
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.DisplayName
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.ui.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberConversationHere
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.format.bubbleClockLabel
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * Le pied d'une bulle, port d'iOS `BubbleFooter` (mode `.row`) :
 *  - sans identité : `[metaLeading] Spacer(min 4) [metaTrailing]` ;
 *  - avec identité (dernière bulle d'une suite reçue, en groupe) : l'avatar 32 de l'auteur, puis
 *    une colonne — ligne 1 : nom tronqué à 16 graphèmes en 13 sp semi-gras, méta à gauche, heure à
 *    droite ; ligne 2 : « @pseudo » en 11 sp. Tap sur l'avatar → fiche profil ; appui long → menu
 *    « Voir le profil ».
 *
 * metaLeading = compte à rebours éphémère, marque-page, puis la rangée de drapeaux compacts — ou,
 * s'il n'y a aucun drapeau, le glyphe « traduit » indigo. metaTrailing = crayon « modifié », heure
 * `HH:mm` en 12 sp medium, puis la coche d'un message envoyé.
 */
@Composable
internal fun BubbleFooterRow(
    content: BubbleContent,
    onColor: Color,
    onFlagTap: ((String) -> Unit)? = null,
    onTranslate: (() -> Unit)? = null,
    onSenderTap: (() -> Unit)? = null,
    onShowReadStatus: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val metaColor = if (content.isOutgoing) onColor.copy(alpha = 0.7f) else MeeshyTheme.tokens.textMuted
    val identityName = content.senderName?.takeIf { content.showSenderName && !content.isOutgoing }
    if (identityName != null) {
        BubbleIdentityFooter(
            content = content,
            name = identityName,
            onColor = onColor,
            metaColor = metaColor,
            onFlagTap = onFlagTap,
            onTranslate = onTranslate,
            onSenderTap = onSenderTap,
            onShowReadStatus = onShowReadStatus,
            modifier = modifier,
        )
    } else {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = modifier) {
            BubbleMetaLeading(content, onColor, metaColor, onFlagTap, onTranslate)
            Spacer(Modifier.weight(1f).widthIn(min = MeeshySpacing.xs))
            BubbleMetaTrailing(content, metaColor, onShowReadStatus = onShowReadStatus)
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun BubbleIdentityFooter(
    content: BubbleContent,
    name: String,
    onColor: Color,
    metaColor: Color,
    onFlagTap: ((String) -> Unit)?,
    onTranslate: (() -> Unit)?,
    onSenderTap: (() -> Unit)?,
    onShowReadStatus: (() -> Unit)?,
    modifier: Modifier,
) {
    val senderColor = content.senderColorHex?.let { hexColor(it, MeeshyPalette.Indigo500) } ?: MeeshyPalette.Indigo500
    var menuOpen by remember { mutableStateOf(false) }
    val profileLabel = stringResource(R.string.bubble_view_profile)
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        modifier = modifier,
    ) {
        Box {
            val avatarModifier = Modifier
                .clip(CircleShape)
                .let { base ->
                    if (onSenderTap == null) base
                    else base.combinedClickable(
                        onClickLabel = profileLabel,
                        onClick = onSenderTap,
                        onLongClick = { menuOpen = true },
                    )
                }
            if (content.senderIsAnonymous) {
                BubbleSenderGhost(size = AvatarContext.MessageBubble.size.dp, color = senderColor, modifier = avatarModifier)
            } else {
                MeeshyAvatar(
                    name = name,
                    context = AvatarContext.MessageBubble,
                    containerColor = senderColor,
                    imageUrl = content.senderAvatarUrl,
                    presence = rememberPresence(content.senderProfile?.userId),
                    here = rememberConversationHere(content.senderProfile?.userId, content.viewingConversationId),
                    decorRing = content.senderRing,
                    modifier = avatarModifier,
                )
            }
            if (onSenderTap != null) {
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(
                        text = { Text(profileLabel) },
                        onClick = {
                            menuOpen = false
                            onSenderTap()
                        },
                    )
                }
            }
        }
        Column(
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
            modifier = Modifier.weight(1f, fill = false),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Le nom cède sa place (ellipse) avant l'heure : l'heure ne se rogne jamais.
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        text = DisplayName.truncated(name),
                        fontSize = MeeshyFontSize.subhead,
                        fontWeight = FontWeight.SemiBold,
                        color = onColor,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false).padding(end = MeeshySpacing.xs),
                    )
                    BubbleMetaLeading(content, onColor, metaColor, onFlagTap, onTranslate)
                }
                Spacer(Modifier.width(MeeshySpacing.xs))
                BubbleMetaTrailing(content, metaColor, onShowReadStatus = onShowReadStatus)
            }
            content.senderUsername?.let { username ->
                Text(
                    text = "@$username",
                    fontSize = MeeshyFontSize.footnote,
                    color = metaColor.copy(alpha = metaColor.alpha * 0.85f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun BubbleMetaLeading(
    content: BubbleContent,
    onColor: Color,
    metaColor: Color,
    onFlagTap: ((String) -> Unit)?,
    onTranslate: (() -> Unit)?,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        if (!content.isDeleted && !content.isAfterRead) {
            EphemeralCountdownBadge(expiresAtIso = content.expiresAtIso)
        }
        if (content.isAfterRead) {
            val afterReadLabel = stringResource(R.string.bubble_protection_after_read)
            FlameEyeGlyph(
                size = 12.dp,
                tint = MeeshyMessageStateColors.Ephemeral,
                modifier = Modifier.semantics { contentDescription = afterReadLabel },
            )
        }
        if (content.isStarred && !content.isDeleted) {
            Icon(
                imageVector = Icons.Filled.Bookmark,
                contentDescription = stringResource(R.string.bubble_starred),
                tint = metaColor,
                modifier = Modifier.size(12.dp),
            )
        }
        val chips = if (content.isDeleted) emptyList() else BubbleVoiceStackFooter.chips(content)
        // iOS `metaLeading` : le bouton traduire vient TOUJOURS en premier (position stable) et ne vit que là où
        // AUCUN drapeau ne dit déjà la traduction ; les drapeaux suivent à sa droite.
        if (chips.isEmpty() && !content.isDeleted && onTranslate != null && offersTranslation(content)) {
            TranslateButton(onTranslate)
        }
        if (chips.isNotEmpty()) {
            chips.forEach { chip -> CompactFlagChip(chip, onColor, onFlagTap, isWaiting = chip.code in content.translatingCodes) }
        } else if (content.isTranslated && onTranslate == null) {
            Icon(
                imageVector = Icons.Filled.Translate,
                contentDescription = stringResource(R.string.bubble_translated),
                tint = MeeshyPalette.Indigo400,
                modifier = Modifier.size(12.dp),
            )
        }
    }
}

private fun offersTranslation(content: BubbleContent): Boolean = BubbleFooterBuilder.build(content).showsTranslate

/** Le bouton traduire du pied : ouvre l'explorateur des langues, haptique léger, cible de 22 dp. */
@Composable
private fun TranslateButton(onTranslate: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val label = stringResource(R.string.bubble_footer_translation_request)
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .sizeIn(minWidth = 22.dp, minHeight = 22.dp)
            .clip(RoundedCornerShape(MeeshySpacing.xs))
            .clickable(onClickLabel = label) {
                haptics.light()
                onTranslate()
            }
            .semantics { role = Role.Button; contentDescription = label },
    ) {
        Icon(
            imageVector = Icons.Filled.Translate,
            contentDescription = null,
            tint = MeeshyPalette.Indigo400,
            modifier = Modifier.size(12.dp),
        )
    }
}

/**
 * Drapeau compact du registre de pied (iOS `LanguageFlagChip` compact) : le drapeau seul dans une
 * cible de 22 dp, souligné de la couleur de sa langue quand c'est la langue affichée ; une langue
 * configurée encore sans traduction se lit atténuée.
 */
@Composable
internal fun CompactFlagChip(
    chip: LanguageChip,
    onColor: Color,
    onFlagTap: ((String) -> Unit)?,
    isWaiting: Boolean = false,
) {
    val accent = chip.info?.colorHex?.let { hexColor(it, onColor) } ?: onColor
    val label = chip.info?.name ?: chip.code
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier
            .sizeIn(minWidth = 22.dp, minHeight = 22.dp)
            .clip(RoundedCornerShape(MeeshySpacing.xs))
            .let { base ->
                if (onFlagTap == null) base
                else base.clickable { onFlagTap(chip.code) }.semantics { role = Role.Button }
            }
            .semantics(mergeDescendants = true) { contentDescription = label },
    ) {
        if (isWaiting) {
            CircularProgressIndicator(
                modifier = Modifier.size(12.dp),
                strokeWidth = 1.5.dp,
                color = accent,
            )
        } else {
            Text(
                text = chip.info?.flag ?: chip.code.uppercase(),
                fontSize = MeeshyFontSize.small,
                modifier = Modifier.alpha(if (chip.isTranslatable) 0.45f else 1f),
            )
        }
        Box(
            modifier = Modifier
                .width(12.dp)
                .height(2.dp)
                .clip(RoundedCornerShape(1.dp))
                .background(if (chip.isActive) accent else Color.Transparent),
        )
    }
}
