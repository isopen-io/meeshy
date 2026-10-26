package me.meeshy.app.chat

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.NunitoFontFamily
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshyUnreadBadge
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les mesures de l'en-tête iOS (1 pt = 1 dp) : `ConversationView+Header`, `ThemedBackButton`. */
internal object ChatHeaderMetrics {
    /** Cercle de verre des actions (MeeshyControlSize.small). */
    val ACTION_GLASS = 28.dp
    /** Cible tactile des actions (MeeshyControlSize.tapTarget). */
    val TAP_TARGET = 44.dp
    /** Glyphe des actions (IconSize.xs). */
    val ACTION_GLYPH = 12.dp
    /** Emplacement du chevron du retour (MeeshyControlSize.large). */
    val BACK_SLOT = 40.dp
    /** Chevron du retour (IconSize.md). */
    val BACK_GLYPH = 16.dp
    /** Trait vertical entre le chevron et la pastille des non-lus. */
    val BACK_DIVIDER_HEIGHT = 22.dp
    /** Ombre de l'avatar replié. */
    val AVATAR_SHADOW = 8.dp
    const val PRESSED_SCALE = 0.9f
}

/**
 * La bande REPLIÉE de l'en-tête iOS : retour (+ non-lus des autres conversations) | zone libre |
 * appel, recherche | avatar de 44 tout à droite. Pas de fond : le fil se voit autour.
 * [callSlot] porte le bouton d'appel (ou la pastille « Rejoindre »), absent pour un invité.
 */
@Composable
internal fun ChatConversationHeaderBand(
    accentColor: Color,
    actionsHidden: Boolean,
    otherUnread: Int,
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onToggle: () -> Unit,
    callSlot: @Composable () -> Unit,
    avatar: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.sm, start = MeeshySpacing.lg, end = MeeshySpacing.lg + MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ChatHeaderBackButton(unread = otherUnread, accentColor = accentColor, onClick = onBack)
        // La zone libre : un toucher y bascule l'en-tête (replié ⇄ déplié), comme iOS.
        Spacer(
            Modifier
                .weight(1f)
                .height(ChatHeaderMetrics.TAP_TARGET)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onToggle)
                .clearAndSetSemantics { },
        )
        // La grappe s'efface pendant le défilement et revient à l'arrêt (iOS `hiddenWhileScrolling`).
        val actionsAlpha by animateFloatAsState(if (actionsHidden) 0f else 1f, label = "headerActions")
        Row(
            modifier = Modifier.graphicsLayer { alpha = actionsAlpha },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            callSlot()
            ChatHeaderGlassAction(
                icon = MeeshyIcons.Search,
                contentDescription = stringResource(R.string.chat_header_search),
                accentColor = accentColor,
                onClick = onSearch,
            )
        }
        avatar()
    }
}

/**
 * Le retour iOS (`ThemedBackButton`) : chevron gras de 16 en dégradé [accent, indigo300] dans un
 * emplacement de 40, puis, s'il y a des non-lus ailleurs, un trait de 1×22 et la pastille rouge.
 * Le tout sur une capsule de verre au contour dégradé ; pressé, il se réduit à 0,9.
 */
@Composable
internal fun ChatHeaderBackButton(
    unread: Int,
    accentColor: Color,
    onClick: () -> Unit,
    compact: Boolean = false,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) ChatHeaderMetrics.PRESSED_SCALE else 1f,
        animationSpec = spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMedium),
        label = "backScale",
    )
    val haptic = LocalHapticFeedback.current
    val description = if (unread > 0) {
        pluralStringResource(R.plurals.chat_header_back_unread, unread, unread)
    } else {
        stringResource(R.string.chat_back)
    }
    val capsule = RoundedCornerShape(percent = 50)
    val showsCapsule = !compact
    val content: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(if (compact) ChatHeaderMetrics.BACK_SLOT.coerceAtMost(24.dp) else ChatHeaderMetrics.BACK_SLOT),
                contentAlignment = Alignment.Center,
            ) {
                GradientIcon(
                    icon = MeeshyIcons.ChevronBackward,
                    brush = Brush.linearGradient(listOf(accentColor, MeeshyPalette.Indigo300)),
                    modifier = Modifier.size(ChatHeaderMetrics.BACK_GLYPH + 10.dp),
                )
            }
            if (unread > 0 && !compact) {
                Box(
                    Modifier
                        .width(1.dp)
                        .height(ChatHeaderMetrics.BACK_DIVIDER_HEIGHT)
                        .background(accentColor.copy(alpha = 0.3f)),
                )
                Spacer(Modifier.width(MeeshySpacing.xsPlus))
                MeeshyUnreadBadge(count = unread, isDark = MeeshyTheme.isDark)
                Spacer(Modifier.width(MeeshySpacing.xsPlus))
            }
        }
    }
    Box(
        modifier = Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .defaultMinSize(minWidth = if (compact) 24.dp else ChatHeaderMetrics.BACK_SLOT, minHeight = ChatHeaderMetrics.BACK_SLOT)
            .clip(capsule)
            .clickable(interactionSource = interaction, indication = null, role = Role.Button) {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .clearAndSetSemantics {
                contentDescription = description
                role = Role.Button
                onClick { onClick(); true }
            },
        contentAlignment = Alignment.Center,
    ) {
        if (showsCapsule) {
            MeeshyGlassSurface(
                shape = capsule,
                modifier = Modifier
                    .shadow(6.dp, capsule, ambientColor = accentColor.copy(alpha = 0.3f), spotColor = accentColor.copy(alpha = 0.3f))
                    .border(
                        width = 1.dp,
                        brush = Brush.linearGradient(listOf(accentColor.copy(alpha = 0.5f), MeeshyPalette.Indigo300.copy(alpha = 0.5f))),
                        shape = capsule,
                    ),
            ) { content() }
        } else {
            content()
        }
    }
}

/**
 * Une action de la grappe iOS : un glyphe de 12 en dégradé [accent, secondaire] dans un cercle
 * de verre de 28 teinté de l'accent, au centre d'une cible de 44.
 */
@Composable
internal fun ChatHeaderGlassAction(
    icon: ImageVector,
    contentDescription: String,
    accentColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(ChatHeaderMetrics.TAP_TARGET)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .clearAndSetSemantics {
                this.contentDescription = contentDescription
                role = Role.Button
                onClick { onClick(); true }
            },
        contentAlignment = Alignment.Center,
    ) {
        MeeshyGlassSurface(
            modifier = Modifier.size(ChatHeaderMetrics.ACTION_GLASS),
            shape = CircleShape,
            tint = accentColor.copy(alpha = 0.4f),
        ) {
            Box(Modifier.size(ChatHeaderMetrics.ACTION_GLASS), contentAlignment = Alignment.Center) {
                GradientIcon(
                    icon = icon,
                    brush = Brush.linearGradient(listOf(accentColor, MeeshyPalette.Indigo500)),
                    modifier = Modifier.size(ChatHeaderMetrics.ACTION_GLYPH + 2.dp),
                )
            }
        }
    }
}

/**
 * Le bouton d'appel iOS : UN cercle de verre (téléphone) qui ouvre un menu de deux entrées,
 * « Appel vocal » et « Appel vidéo ». Un groupe appelle la conversation entière.
 */
@Composable
internal fun ChatHeaderCallButton(
    isGroup: Boolean,
    accentColor: Color,
    onCall: (isVideo: Boolean) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Box {
        ChatHeaderGlassAction(
            icon = MeeshyIcons.Call,
            contentDescription = stringResource(if (isGroup) R.string.chat_header_call_group else R.string.chat_header_call),
            accentColor = accentColor,
            onClick = { menuOpen = true },
        )
        DropdownMenu(
            expanded = menuOpen,
            onDismissRequest = { menuOpen = false },
            containerColor = MeeshyTheme.tokens.backgroundSecondary,
        ) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.chat_header_call_voice)) },
                leadingIcon = { Icon(MeeshyIcons.Call, contentDescription = null, tint = accentColor) },
                onClick = { menuOpen = false; onCall(false) },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.chat_header_call_video)) },
                leadingIcon = { Icon(MeeshyIcons.Video, contentDescription = null, tint = accentColor) },
                onClick = { menuOpen = false; onCall(true) },
            )
        }
    }
}

/**
 * L'avatar de l'en-tête (#10300) : le TOUCHER ouvre la fiche (profil du pair d'un direct,
 * détails de la conversation sinon) ; l'APPUI LONG d'un direct ouvre le menu « Voir le profil » /
 * « Conversation ». Un seul élément pour TalkBack, avec les entrées du menu en actions nommées.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ChatHeaderAvatar(
    name: String,
    door: ChatHeaderAvatarDoor,
    accentColor: Color,
    imageUrl: String?,
    presence: me.meeshy.sdk.model.PresenceState?,
    isUser: Boolean,
    onOpenProfile: () -> Unit,
    onOpenDetails: () -> Unit,
    onToggle: () -> Unit,
    context: AvatarContext = AvatarContext.ConversationHeaderCollapsed,
) {
    val haptic = LocalHapticFeedback.current
    var menuOpen by remember { mutableStateOf(false) }
    val open: () -> Unit = {
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        when (door) {
            ChatHeaderAvatarDoor.PROFILE -> onOpenProfile()
            ChatHeaderAvatarDoor.DETAILS -> onOpenDetails()
            ChatHeaderAvatarDoor.TOGGLE -> onToggle()
        }
    }
    val label = when (door) {
        ChatHeaderAvatarDoor.PROFILE -> stringResource(R.string.chat_header_view_profile_of, name)
        else -> stringResource(R.string.chat_header_view_conversation, name)
    }
    val profileLabel = stringResource(R.string.chat_header_menu_profile)
    val conversationLabel = stringResource(R.string.chat_header_menu_conversation)
    Box {
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .combinedClickable(
                    onClick = open,
                    onLongClick = if (door.hasLongPressMenu) {
                        {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            menuOpen = true
                        }
                    } else {
                        null
                    },
                )
                .clearAndSetSemantics {
                    contentDescription = label
                    role = Role.Button
                    onClick { open(); true }
                    if (door.hasLongPressMenu) {
                        customActions = listOf(
                            CustomAccessibilityAction(profileLabel) { onOpenProfile(); true },
                            CustomAccessibilityAction(conversationLabel) { onOpenDetails(); true },
                        )
                    }
                },
        ) {
            MeeshyAvatar(
                name = name,
                context = context,
                containerColor = accentColor,
                presence = presence,
                isUser = isUser,
                imageUrl = imageUrl,
                modifier = Modifier.shadow(ChatHeaderMetrics.AVATAR_SHADOW, CircleShape, clip = false),
            )
        }
        DropdownMenu(
            expanded = menuOpen,
            onDismissRequest = { menuOpen = false },
            containerColor = MeeshyTheme.tokens.backgroundSecondary,
        ) {
            DropdownMenuItem(
                text = { Text(profileLabel) },
                leadingIcon = { Icon(MeeshyIcons.Person, contentDescription = null, tint = accentColor) },
                onClick = { menuOpen = false; onOpenProfile() },
            )
            DropdownMenuItem(
                text = { Text(conversationLabel) },
                leadingIcon = { Icon(MeeshyIcons.Info, contentDescription = null, tint = accentColor) },
                onClick = { menuOpen = false; onOpenDetails() },
            )
        }
    }
}

/** Un glyphe peint d'un dégradé (iOS `.foregroundStyle(LinearGradient)`). */
@Composable
internal fun GradientIcon(icon: ImageVector, brush: Brush, modifier: Modifier = Modifier) {
    Icon(
        imageVector = icon,
        contentDescription = null,
        tint = Color.White,
        modifier = modifier
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithCache {
                onDrawWithContent {
                    drawContent()
                    drawRect(brush = brush, blendMode = BlendMode.SrcAtop)
                }
            },
    )
}

/**
 * La bande DÉPLIÉE de l'en-tête iOS (`ConversationExpandedHeaderBand`) : un bloc de verre de
 * rayon 22 au contour dégradé, avec le retour compact, le NOM de la conversation (13, gras
 * arrondi, deux lignes), la rangée des puces (chiffrement, frappe ou effectif) et l'avatar
 * identité à droite. Aucune action : appel et recherche n'existent que replié (arbitrage iOS
 * du 2026-08-18). Toucher le nom ouvre la fiche Conversation ; la zone libre replie.
 */
@Composable
internal fun ChatConversationExpandedBand(
    title: String,
    accentColor: Color,
    otherUnread: Int,
    encryption: ChatHeaderEncryptionBadge?,
    onBack: () -> Unit,
    onToggle: () -> Unit,
    onTitleTap: () -> Unit,
    subtitle: @Composable () -> Unit,
    avatar: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(22.dp)
    MeeshyGlassSurface(
        shape = shape,
        modifier = modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.sm, start = MeeshySpacing.sm, end = MeeshySpacing.sm)
            .shadow(8.dp, shape, clip = false, ambientColor = accentColor.copy(alpha = 0.15f), spotColor = accentColor.copy(alpha = 0.15f))
            .border(
                width = 1.dp,
                brush = Brush.linearGradient(listOf(accentColor.copy(alpha = 0.4f), MeeshyPalette.Indigo300.copy(alpha = 0.15f))),
                shape = shape,
            )
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onToggle),
    ) {
        Row(
            modifier = Modifier.padding(start = MeeshySpacing.smPlus, end = MeeshySpacing.smPlus, top = MeeshySpacing.xsPlus, bottom = MeeshySpacing.xsPlus),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ChatHeaderBackButton(unread = otherUnread, accentColor = accentColor, onClick = onBack, compact = true)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(
                    text = title,
                    fontFamily = NunitoFontFamily,
                    fontWeight = FontWeight.Bold,
                    fontSize = MeeshyFontSize.subhead,
                    color = if (MeeshyTheme.isDark) Color.White else MeeshyPalette.Indigo950,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                        onClick = onTitleTap,
                    ),
                )
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (encryption != null) {
                        ChatHeaderEncryptionChip(encryption, accentColor)
                    }
                    subtitle()
                }
            }
            avatar()
        }
    }
}

/** La puce de chiffrement : verte de bout en bout, à l'accent sur le serveur (9, semi-gras). */
@Composable
private fun ChatHeaderEncryptionChip(badge: ChatHeaderEncryptionBadge, accentColor: Color) {
    val color = if (badge == ChatHeaderEncryptionBadge.END_TO_END) MeeshyTheme.tokens.success else accentColor
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.LockFilled, contentDescription = null, tint = color, modifier = Modifier.size(10.dp))
        Text(
            text = stringResource(
                if (badge == ChatHeaderEncryptionBadge.END_TO_END) R.string.chat_header_encryption_e2ee else R.string.chat_header_encryption_server,
            ),
            color = color,
            fontSize = MeeshyFontSize.micro,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
    }
}
