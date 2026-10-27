package me.meeshy.app.chat

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.EphemeralLifecycle
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.sdk.model.reading.summary.ConversationEpisode
import me.meeshy.sdk.model.reading.summary.DayLabelKey
import me.meeshy.sdk.model.reading.summary.DeterministicConversationDigest
import me.meeshy.sdk.model.reading.summary.EpisodeTitle
import me.meeshy.sdk.model.reading.summary.EpisodeTitleText
import me.meeshy.sdk.model.reading.summary.FaceRampEntry
import me.meeshy.sdk.model.reading.summary.SummaryEntryAction
import me.meeshy.sdk.model.reading.summary.SummaryProtectionBadge
import me.meeshy.sdk.model.reading.summary.SummaryProtectionEntry
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

@Composable
private fun surfaceTint(): Color {
    val dark = MeeshyTheme.isDark
    val alpha = if (dark) FocalMetrics.SurfaceTint.DARK_FILL else FocalMetrics.SurfaceTint.LIGHT_FILL
    return (if (dark) Color.White else Color.Black).copy(alpha = alpha.toFloat())
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        fontSize = MeeshyFontSize.subhead,
        fontWeight = FontWeight.ExtraBold,
        color = MeeshyTheme.tokens.textPrimary.copy(alpha = 0.92f),
        modifier = Modifier.semantics { heading() },
    )
}

/** L'ÉTAT d'abord : le titre, « 312 messages · 9 personnes », et le partiel dit partiel. */
@Composable
internal fun SummaryHeader(digest: DeterministicConversationDigest) {
    val tokens = MeeshyTheme.tokens
    val messages = stringResource(R.string.summary_header_messages_count, digest.messageCount)
    val people = stringResource(R.string.summary_header_people_count, digest.participantCount)
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Text(
            text = stringResource(R.string.summary_header_title),
            fontSize = MeeshyFontSize.title3,
            fontWeight = FontWeight.ExtraBold,
            color = tokens.textPrimary,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = "$messages · $people",
            fontSize = MeeshyFontSize.label,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textSecondary,
        )
        if (!digest.isComplete) {
            Text(
                text = stringResource(R.string.summary_header_partial_window, digest.messageCount),
                fontSize = MeeshyFontSize.small,
                fontWeight = FontWeight.Medium,
                color = MeeshyPalette.Indigo500,
            )
        }
    }
}

/** « Ce qui va disparaître » : chaque message protégé encore vivant, désigné — jamais son texte. */
@Composable
internal fun SummaryProtectionsSection(entries: List<SummaryProtectionEntry>) {
    val tint = surfaceTint()
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionTitle(stringResource(R.string.summary_protected_title))
        entries.forEach { entry -> key(entry.id) { ProtectionRow(entry, tint) } }
    }
}

/** Une ligne par message protégé : seule celle dont le décompte change se recompose. */
@Composable
private fun ProtectionRow(entry: SummaryProtectionEntry, tint: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tint)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = entry.senderDisplayName,
            modifier = Modifier.weight(1f),
            fontSize = MeeshyFontSize.subhead,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary.copy(alpha = 0.9f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        entry.badges.forEach { ProtectionBadge(it) }
    }
}

@Composable
private fun ProtectionBadge(badge: SummaryProtectionBadge) {
    val accent = MeeshyTheme.tokens.textSecondary
    val (icon, label) = when (badge) {
        is SummaryProtectionBadge.Ephemeral -> MeeshyIcons.Timer to stringResource(R.string.summary_protection_ephemeral)
        SummaryProtectionBadge.ViewOnce -> MeeshyIcons.Eye to stringResource(R.string.summary_protection_view_once)
        SummaryProtectionBadge.Blurred -> MeeshyIcons.EyeOff to stringResource(R.string.summary_protection_hidden)
    }
    val countdown = (badge as? SummaryProtectionBadge.Ephemeral)?.remainingSeconds?.let(EphemeralLifecycle::format)
    Row(
        modifier = Modifier.semantics { contentDescription = listOfNotNull(label, countdown).joinToString(" ") },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(16.dp))
        countdown?.let { Text(it, fontSize = MeeshyFontSize.footnote, fontWeight = FontWeight.SemiBold, color = accent) }
    }
}

/**
 * « Ils t'attendent » : un rail de visages classé par la loi (jamais alphabétique — cette vue ne
 * retrie rien). Le badge dit `awaitingCount`, jamais le score de tri. Le toucher cite la première
 * preuve ; l'appui long ouvre « Aller au message · Répondre ».
 */
@Composable
internal fun FaceRampSection(
    entries: List<FaceRampEntry>,
    menu: SummaryEntryMenu,
    onTap: (FaceRampEntry) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionTitle(stringResource(R.string.summary_ramp_title))
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = MeeshySpacing.xxs),
        ) {
            items(entries, key = { it.id }) { entry ->
                FaceRampItem(entry, menu) { onTap(entry) }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FaceRampItem(entry: FaceRampEntry, menu: SummaryEntryMenu, onTap: () -> Unit) {
    val haptic = LocalHapticFeedback.current
    val target = SummaryEntryAction.target(entry)
    var menuOpen by remember { mutableStateOf(false) }
    val label = stringResource(R.string.summary_ramp_entry_a11y_label, entry.displayName, entry.awaitingCount)
    val actions = target?.let(menu.offered).orEmpty()
    val actionLabels = actions.map { entryActionLabel(it) }
    Box {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .combinedClickable(
                    onClick = onTap,
                    onLongClick = {
                        if (target != null) {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            menuOpen = true
                        }
                    },
                )
                .semantics(mergeDescendants = false) {
                    contentDescription = label
                    role = Role.Button
                    customActions = actions.mapIndexed { i, action ->
                        CustomAccessibilityAction(actionLabels[i]) { target?.let { menu.run(action, it) }; true }
                    }
                }
                .padding(MeeshySpacing.xxs),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Box {
                MeeshyAvatar(
                    name = entry.displayName,
                    size = (FocalMetrics.Avatar.SIZE * 2).dp,
                    containerColor = hexColor(entry.colorHex, MeeshyPalette.Indigo500),
                    presence = rememberPresence(entry.id),
                    imageUrl = entry.avatarUrl,
                )
                if (entry.awaitingCount > 0) {
                    CountBadge(entry.awaitingCount, Modifier.align(Alignment.TopEnd))
                }
            }
            Text(
                text = entry.displayName,
                fontSize = MeeshyFontSize.footnote,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(max = (FocalMetrics.Avatar.SIZE * 2.2).dp),
            )
        }
        if (target != null) {
            EntryMenu(expanded = menuOpen, actions = actions, onDismiss = { menuOpen = false }) { action ->
                menuOpen = false
                menu.run(action, target)
            }
        }
    }
}

@Composable
private fun CountBadge(count: Int, modifier: Modifier) {
    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(MeeshyPalette.Indigo500)
            .padding(horizontal = MeeshySpacing.xs)
            .height(16.dp)
            .widthIn(min = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = count.toString(),
            color = MeeshyPalette.White,
            fontSize = MeeshyFontSize.caption,
            fontWeight = FontWeight.ExtraBold,
        )
    }
}

/** « Ce qui s'est passé » : chaque ligne s'ouvre sur les messages qui la prouvent. */
@Composable
internal fun EpisodeSection(
    episodes: List<ConversationEpisode>,
    menu: SummaryEntryMenu,
    onTap: (ConversationEpisode) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionTitle(stringResource(R.string.summary_episodes_title))
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            episodes.forEach { episode -> key(episode.id) { EpisodeRow(episode, menu) { onTap(episode) } } }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun EpisodeRow(episode: ConversationEpisode, menu: SummaryEntryMenu, onTap: () -> Unit) {
    val haptic = LocalHapticFeedback.current
    val tint = surfaceTint()
    val locale = LocalConfiguration.current.locales[0]
    val resources = androidx.compose.ui.platform.LocalContext.current.resources
    val today = stringResource(R.string.summary_day_today)
    val yesterday = stringResource(R.string.summary_day_yesterday)
    val dayBefore = stringResource(R.string.summary_day_day_before_yesterday)
    val title = episode.agentTitle ?: EpisodeTitleText.format(
        title = episode.deterministicTitle,
        locale = locale,
        relative = {
            when (it) {
                DayLabelKey.TODAY -> today
                DayLabelKey.YESTERDAY -> yesterday
                DayLabelKey.DAY_BEFORE_YESTERDAY -> dayBefore
            }
        },
        messages = { key, count ->
            val res = if (key == EpisodeTitle.MESSAGES_ONE_KEY) {
                R.string.summary_episode_messages_one
            } else {
                R.string.summary_episode_messages_other
            }
            resources.getString(res, count)
        },
    )
    val hint = stringResource(R.string.summary_episode_a11y_hint)
    val target = SummaryEntryAction.target(episode)
    var menuOpen by remember { mutableStateOf(false) }
    val actions = target?.let(menu.offered).orEmpty()
    val actionLabels = actions.map { entryActionLabel(it) }
    Box {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(tint)
                .combinedClickable(
                    onClick = onTap,
                    onLongClick = {
                        if (target != null) {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            menuOpen = true
                        }
                    },
                )
                .semantics {
                    contentDescription = title
                    stateDescription = hint
                    role = Role.Button
                    customActions = actions.mapIndexed { i, action ->
                        CustomAccessibilityAction(actionLabels[i]) { target?.let { menu.run(action, it) }; true }
                    }
                }
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            if (episode.isAgentTitled) {
                Text("✦", fontSize = MeeshyFontSize.small, fontWeight = FontWeight.ExtraBold, color = MeeshyPalette.Indigo500)
            }
            Text(
                text = title,
                modifier = Modifier.weight(1f),
                fontSize = MeeshyFontSize.subhead,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary.copy(alpha = 0.88f),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Icon(
                MeeshyIcons.ChevronForward,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textSecondary.copy(alpha = 0.6f),
                modifier = Modifier.size(16.dp),
            )
        }
        if (target != null) {
            EntryMenu(expanded = menuOpen, actions = actions, onDismiss = { menuOpen = false }) { action ->
                menuOpen = false
                menu.run(action, target)
            }
        }
    }
}

@Composable
private fun entryActionLabel(action: SummaryEntryAction): String = stringResource(
    when (action) {
        SummaryEntryAction.GO_TO_MESSAGE -> R.string.summary_action_go_to_message
        SummaryEntryAction.REPLY -> R.string.chat_action_reply
    },
)

@Composable
private fun EntryMenu(
    expanded: Boolean,
    actions: List<SummaryEntryAction>,
    onDismiss: () -> Unit,
    onPick: (SummaryEntryAction) -> Unit,
) {
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundSecondary,
    ) {
        actions.forEach { action ->
            DropdownMenuItem(
                text = { Text(entryActionLabel(action)) },
                leadingIcon = {
                    Icon(
                        when (action) {
                            SummaryEntryAction.GO_TO_MESSAGE -> MeeshyIcons.TextBubble
                            SummaryEntryAction.REPLY -> MeeshyIcons.Reply
                        },
                        contentDescription = null,
                    )
                },
                onClick = { onPick(action) },
            )
        }
    }
}

/** Le panneau de l'agent — SÉPARÉ, jamais mélangé aux comptes déterministes (contour pointillé). */
@Composable
internal fun AgentPanel(text: String) {
    val border = MeeshyBorder.emphasis
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .drawBehind {
                drawRoundRect(
                    color = MeeshyPalette.Indigo500,
                    cornerRadius = CornerRadius(FocalMetrics.Agent.RADIUS.dp.toPx()),
                    style = Stroke(
                        width = border.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx())),
                    ),
                )
            }
            .padding(MeeshySpacing.md)
            .semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
            Text("✦", fontSize = MeeshyFontSize.small, fontWeight = FontWeight.ExtraBold, color = MeeshyPalette.Indigo500)
            Text(
                text = stringResource(R.string.summary_agent_title),
                fontSize = MeeshyFontSize.small,
                fontWeight = FontWeight.ExtraBold,
                color = MeeshyPalette.Indigo500,
            )
        }
        Text(
            text = text,
            fontSize = MeeshyFontSize.subhead,
            color = MeeshyTheme.tokens.textPrimary.copy(alpha = 0.85f),
        )
    }
}

/** Trois barres qui respirent — UNIQUEMENT sur cache vide ; jamais un écran vide. */
@Composable
internal fun LivingSummarySkeleton() {
    val reduceMotion = LocalReduceMotion.current
    val label = stringResource(R.string.summary_skeleton_a11y_label)
    val pulse = if (reduceMotion) {
        1f
    } else {
        val transition = rememberInfiniteTransition(label = "summary-skeleton")
        val alpha by transition.animateFloat(
            initialValue = 0.55f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(durationMillis = 900), RepeatMode.Reverse),
            label = "summary-skeleton-alpha",
        )
        alpha
    }
    val tint = surfaceTint()
    Column(
        modifier = Modifier.semantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        repeat(3) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(16.dp)
                    .graphicsLayer { alpha = pulse }
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(tint),
            )
        }
    }
}
