package me.meeshy.ui.component

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.indication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.LentilleMetrics
import me.meeshy.ui.theme.MeeshyMotion
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * A collapsible list section (parity plan §4.4) — the port of the iOS conversation-list
 * groups (Épingles / dossiers / Mes conversations). The header shows a coloured rounded
 * icon chip, the title, a count pill, and a chevron that rotates as the section opens;
 * folded, it also shows [foldedUnread] — the unread messages its hidden rows carry (iOS
 * `SectionFoldedUnread`, #8694) — in the section's colour;
 * the body reveals its child rows with a size animation.
 *
 * Uncontrolled by default (owns a saveable fold state); a host that keeps the state itself
 * passes [expanded] and hears the user's gesture through [onExpandedChange]. [stateDescription]
 * is the localized value TalkBack reads after the title (« Développée » / « Réduite, 3 non lus »).
 *
 * SDK-pure: the icon and the rows are opaque slots, the accent is a plain [Color], and
 * the component owns only its own expand/collapse UI state. The product decision of what
 * a section contains stays app-side.
 */
@Composable
public fun CollapsibleSection(
    title: String,
    modifier: Modifier = Modifier,
    iconContainerColor: Color = MeeshyPalette.Indigo500,
    count: Int = 0,
    foldedUnread: Int = 0,
    foldedUnreadDescription: String? = null,
    initiallyExpanded: Boolean = true,
    expanded: Boolean? = null,
    onExpandedChange: ((Boolean) -> Unit)? = null,
    stateDescription: String? = null,
    icon: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    var ownExpanded by rememberSaveable { mutableStateOf(initiallyExpanded) }
    val isExpanded = expanded ?: ownExpanded
    val fold: () -> Unit = {
        val next = !isExpanded
        if (expanded == null) ownExpanded = next
        onExpandedChange?.invoke(next)
    }
    val chevronRotation by animateFloatAsState(
        targetValue = if (isExpanded) 0f else -90f,
        label = "collapsible-chevron",
    )
    val tokens = MeeshyTheme.tokens

    Column(modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .foldsOnShortTap(stateDescription, fold)
                .padding(vertical = MeeshySpacing.sm, horizontal = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(RoundedCornerShape(MeeshyRadius.sm))
                        .background(iconContainerColor),
                    contentAlignment = Alignment.Center,
                    content = { icon() },
                )
                Spacer(Modifier.width(MeeshySpacing.md))
            }
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = tokens.textPrimary,
                modifier = Modifier.weight(1f),
            )
            if (!isExpanded && foldedUnread > 0) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(MeeshyRadius.pill))
                        .background(iconContainerColor)
                        .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp)
                        .semantics { foldedUnreadDescription?.let { contentDescription = it } },
                ) {
                    Text(
                        text = foldedUnread.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyPalette.White,
                    )
                }
                Spacer(Modifier.width(MeeshySpacing.sm))
            }
            if (count > 0) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(MeeshyRadius.pill))
                        .background(tokens.backgroundTertiary)
                        .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
                ) {
                    Text(
                        text = count.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.textSecondary,
                    )
                }
                Spacer(Modifier.width(MeeshySpacing.sm))
            }
            Icon(
                imageVector = Icons.Filled.KeyboardArrowDown,
                contentDescription = null,
                tint = tokens.textMuted,
                modifier = Modifier.rotate(chevronRotation),
            )
        }
        AnimatedVisibility(visible = isExpanded) {
            Column(content = content)
        }
    }
}

/**
 * Replie ou déplie sur un TOUCHER bref seulement : un appui long sur l'en-tête ne replie pas la section
 * (critère de #12497 — recette S8 : « Personal tests » se repliait sous le doigt qui cherchait un menu). Le
 * geste long est consommé sans effet ; TalkBack garde l'action « activer » par la sémantique. Le doigt posé
 * garde le retour visuel d'un bouton (indication du thème), que `clickable` donnait.
 */
@Composable
private fun Modifier.foldsOnShortTap(stateDescription: String?, onFold: () -> Unit): Modifier {
    val fold by rememberUpdatedState(onFold)
    val interaction = remember { MutableInteractionSource() }
    return this
        .semantics(mergeDescendants = true) {
            role = Role.Button
            stateDescription?.let { this.stateDescription = it }
            onClick { fold(); true }
        }
        .indication(interaction, LocalIndication.current)
        .pointerInput(interaction) {
            detectTapGestures(
                onPress = { offset ->
                    val press = PressInteraction.Press(offset)
                    interaction.emit(press)
                    val released = tryAwaitRelease()
                    interaction.emit(if (released) PressInteraction.Release(press) else PressInteraction.Cancel(press))
                },
                onLongPress = {},
                onTap = { fold() },
            )
        }
}

private const val PRESS_HOLD_MILLIS = 150L
private const val PRESS_DISC_SCALE = 1.2f
private const val PRESS_ICON_SCALE = 1.15f
private const val PRESS_CAPSULE_SCALE = 1.1f
private const val HALO_ALPHA = 0.15f
private const val CHEVRON_QUARTER_TURN = 90f

/**
 * L'en-tête classique d'une section (iOS `SectionHeaderView`) — SEUL, sans ses rangs : la liste virtualisée
 * pose ses lignes comme items frères, jamais dans le corps d'une section. Disque d'icône teinté au halo
 * lumineux quand la section est dépliée, titre, capsule de compte, pastille des non-lus cachés (repliée
 * seulement) et chevron directionnel qui pivote de 90 degrés. Le toucher bref replie : ressort 0,25 / 0,6
 * sur le disque, l'icône et la capsule, haptique légère. [stateDescription] est la valeur lue par TalkBack.
 */
@Composable
public fun CollapsibleSectionHeader(
    title: String,
    color: Color,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    count: Int = 0,
    foldedUnread: Int = 0,
    stateDescription: String? = null,
    icon: (@Composable () -> Unit)? = null,
) {
    val tokens = MeeshyTheme.tokens
    val haptics = rememberMeeshyHaptics()
    val scope = rememberCoroutineScope()
    var tapped by remember { mutableStateOf(false) }
    val press = remember { spring<Float>(dampingRatio = 0.6f, stiffness = MeeshyMotion.stiffnessForResponse(0.25f)) }
    val discScale by animateFloatAsState(if (tapped) PRESS_DISC_SCALE else 1f, press, label = "section-disc")
    val iconScale by animateFloatAsState(if (tapped) PRESS_ICON_SCALE else 1f, press, label = "section-icon")
    val capsuleScale by animateFloatAsState(if (tapped) PRESS_CAPSULE_SCALE else 1f, press, label = "section-capsule")
    val halo by animateFloatAsState(if (expanded) HALO_ALPHA else 0f, tween(400), label = "section-halo")
    val reading = LocalLayoutDirection.current
    val quarterTurn = if (reading == LayoutDirection.Rtl) -CHEVRON_QUARTER_TURN else CHEVRON_QUARTER_TURN
    val chevron by animateFloatAsState(if (expanded) quarterTurn else 0f, tween(200), label = "section-chevron")
    val fold: () -> Unit = {
        haptics.light()
        tapped = true
        scope.launch {
            delay(PRESS_HOLD_MILLIS)
            tapped = false
        }
        onToggle()
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(if (expanded) color.copy(alpha = MeeshyOpacity.faint) else Color.Transparent)
            .foldsOnShortTap(stateDescription, fold)
            .padding(vertical = MeeshySpacing.sm, horizontal = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(HALO_SIZE)) {
                Box(Modifier.size(HALO_SIZE).blur(4.dp).background(color.copy(alpha = halo), CircleShape))
                Box(
                    modifier = Modifier
                        .size(DISC_SIZE)
                        .scale(discScale)
                        .background(color.copy(alpha = DISC_ALPHA), CircleShape),
                )
                Box(Modifier.scale(iconScale), contentAlignment = Alignment.Center) { icon() }
            }
            Spacer(Modifier.width(MeeshySpacing.md))
        }
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textPrimary,
        )
        if (count > 0) {
            Spacer(Modifier.width(MeeshySpacing.md))
            Box(
                modifier = Modifier
                    .scale(capsuleScale)
                    .clip(CircleShape)
                    .background(color.copy(alpha = CAPSULE_ALPHA))
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
            ) {
                Text(text = count.toString(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = color)
            }
        }
        Spacer(Modifier.weight(1f))
        if (!expanded && foldedUnread > 0) {
            Box(Modifier.clearAndSetSemantics {}) { MeeshyUnreadBadge(count = foldedUnread) }
            Spacer(Modifier.width(MeeshySpacing.sm))
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = color,
            modifier = Modifier.rotate(chevron),
        )
    }
}

/**
 * Le sticker de section de la Lentille (iOS `LentilleSticker`) : titre en majuscules 10,5 sp très gras,
 * interlettrage 0,1 em, padding 4/13 sur le fond secondaire, pleine largeur — fait pour être ÉPINGLÉ en haut
 * par la liste. [onToggle] nul ⇒ section calculée : ni chevron, ni pastille, ni geste. Le chevron suit le
 * sens de lecture (RTL compris) ; la pastille des non-lus cachés n'apparaît que repliée.
 */
@Composable
public fun StickerSectionHeader(
    title: String,
    expanded: Boolean,
    modifier: Modifier = Modifier,
    foldedUnread: Int = 0,
    stateDescription: String? = null,
    onToggle: (() -> Unit)? = null,
) {
    val tokens = MeeshyTheme.tokens
    val haptics = rememberMeeshyHaptics()
    val size = LentilleMetrics.Sticker.size
    val tracking = (size.value * LentilleMetrics.Sticker.letterSpacingEm).sp
    val interactive = if (onToggle == null) {
        Modifier
    } else {
        Modifier.foldsOnShortTap(stateDescription) {
            haptics.light()
            onToggle()
        }
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(tokens.backgroundSecondary)
            .then(interactive)
            .padding(vertical = LentilleMetrics.Sticker.paddingVertical, horizontal = LentilleMetrics.Sticker.paddingHorizontal),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title.uppercase(),
            fontSize = size,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = tracking,
            color = tokens.textSecondary,
            modifier = Modifier.weight(1f),
        )
        if (onToggle != null) {
            if (!expanded && foldedUnread > 0) {
                Box(Modifier.clearAndSetSemantics {}) { MeeshyUnreadBadge(count = foldedUnread) }
                Spacer(Modifier.width(6.dp))
            }
            Icon(
                imageVector = if (expanded) Icons.Filled.KeyboardArrowDown else Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = tokens.textSecondary,
                modifier = Modifier.size(StickerChevronSize),
            )
        }
    }
}

private val HALO_SIZE = 40.dp
private val DISC_SIZE = 30.dp
private val StickerChevronSize = 14.dp
private const val DISC_ALPHA = 0.2f
private const val CAPSULE_ALPHA = 0.17f
