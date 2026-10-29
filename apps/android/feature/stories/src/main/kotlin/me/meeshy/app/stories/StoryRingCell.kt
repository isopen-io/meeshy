package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Collections
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import me.meeshy.feature.stories.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * Une cellule du plateau : avatar [StoryEntryMetrics.avatar] dans son anneau, points de comptage,
 * libellé. Tap = ouverture avec haptique ; appui long = menu « Voir les stories / Voir le profil ».
 * Reçoit des instantanés immuables (jamais un flux) : une présence ou un statut qui change ne
 * recompose que sa cellule.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun StoryRingCell(
    ring: StoryRing,
    label: String,
    cascadeIndex: Int,
    moodEmoji: String?,
    showAddBadge: Boolean,
    onOpen: () -> Unit,
    onShowProfile: (() -> Unit)?,
    onAppeared: (String?) -> Unit,
    onAdd: (() -> Unit)? = null,
    onManage: (() -> Unit)? = null,
    onAddStatus: (() -> Unit)? = null,
    onMoodTap: (() -> Unit)? = null,
) {
    val haptics = rememberMeeshyHaptics()
    var menuOpen by remember { mutableStateOf(false) }
    val openDescription = stringResource(R.string.stories_open, label)
    val reveal = remember { Animatable(if (StoryEntryMetrics.cascadeDelayMillis(cascadeIndex) == null) 1f else 0f) }

    LaunchedEffect(Unit) {
        StoryEntryMetrics.cascadeDelayMillis(cascadeIndex)?.let {
            delay(it)
            reveal.animateTo(1f, tween(CASCADE_DURATION_MILLIS))
        }
    }
    LaunchedEffect(Unit) { onAppeared(ring.displayedStoryId) }

    Column(
        modifier = Modifier
            .width(StoryEntryMetrics.labelWidth)
            .graphicsLayer {
                alpha = reveal.value
                val scale = CASCADE_START_SCALE + (1f - CASCADE_START_SCALE) * reveal.value
                scaleX = scale
                scaleY = scale
            }
            .combinedClickable(
                onClick = {
                    haptics.medium()
                    onOpen()
                },
                onLongClick = {
                    haptics.light()
                    menuOpen = true
                },
            )
            .semantics { role = Role.Button; contentDescription = openDescription },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(contentAlignment = Alignment.Center) {
            StoryRingFrame(ring) {
                StoryAvatar(ring)
                if (showAddBadge) AddBadge(onClick = onAdd)
                when {
                    showAddBadge && onAddStatus != null -> StatusBadge(moodEmoji, onClick = onAddStatus)
                    !moodEmoji.isNullOrEmpty() -> MoodBadge(moodEmoji, onClick = onMoodTap)
                    else -> PresenceDot(ring)
                }
            }
            StoryRingMenu(
                expanded = menuOpen,
                onDismiss = { menuOpen = false },
                onViewStories = { menuOpen = false; onOpen() },
                onShowProfile = onShowProfile?.let { open -> { menuOpen = false; open() } },
                selfActions = if (onAdd != null) {
                    StoryTraySelfMenu.actions(ring, canChangeMood = onAddStatus != null, canViewProfile = onShowProfile != null)
                } else {
                    null
                },
                onAdd = { menuOpen = false; onAdd?.invoke() },
                onManage = { menuOpen = false; onManage?.invoke() },
                onChangeMood = { menuOpen = false; onAddStatus?.invoke() },
            )
        }
        StoryCountDotsRow(
            dots = StoryCountDots.from(ring.storyCount, ring.unviewedCount),
            accentHex = ring.accentHex,
            unviewedCount = ring.unviewedCount,
            storyCount = ring.storyCount,
        )
        StoryLabel(label, unread = ring.hasUnviewed)
    }
}

@Composable
internal fun StoryRingMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    onViewStories: () -> Unit,
    onShowProfile: (() -> Unit)?,
    selfActions: List<StoryTraySelfAction>? = null,
    onAdd: () -> Unit = {},
    onManage: () -> Unit = {},
    onChangeMood: () -> Unit = {},
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        if (selfActions != null) {
            selfActions.forEach { action ->
                when (action) {
                    StoryTraySelfAction.ViewMyStory -> DropdownMenuItem(
                        text = { Text(stringResource(R.string.stories_tray_view_my_story)) },
                        leadingIcon = { Icon(Icons.Filled.PlayArrow, contentDescription = null) },
                        onClick = onViewStories,
                    )
                    StoryTraySelfAction.ManageStories -> DropdownMenuItem(
                        text = { Text(stringResource(R.string.stories_tray_manage)) },
                        leadingIcon = { Icon(Icons.Filled.Collections, contentDescription = null) },
                        onClick = onManage,
                    )
                    StoryTraySelfAction.AddStory -> DropdownMenuItem(
                        text = { Text(stringResource(R.string.stories_tray_add_story)) },
                        leadingIcon = { Icon(Icons.Filled.Add, contentDescription = null) },
                        onClick = onAdd,
                    )
                    StoryTraySelfAction.ChangeMood -> DropdownMenuItem(
                        text = { Text(stringResource(R.string.story_tray_a11y_changeMood)) },
                        leadingIcon = { Icon(MeeshyIcons.Emoji, contentDescription = null) },
                        onClick = onChangeMood,
                    )
                    StoryTraySelfAction.ViewProfile -> DropdownMenuItem(
                        text = { Text(stringResource(R.string.story_tray_menu_profile)) },
                        leadingIcon = { Icon(Icons.Filled.Person, contentDescription = null) },
                        onClick = { onShowProfile?.invoke() },
                    )
                }
            }
            return@DropdownMenu
        }
        DropdownMenuItem(
            text = { Text(stringResource(R.string.story_tray_menu_viewStories)) },
            leadingIcon = { Icon(Icons.Filled.PlayArrow, contentDescription = null) },
            onClick = onViewStories,
        )
        if (onShowProfile != null) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.story_tray_menu_profile)) },
                leadingIcon = { Icon(Icons.Filled.Person, contentDescription = null) },
                onClick = onShowProfile,
            )
        }
    }
}

@Composable
private fun StoryAvatar(ring: StoryRing) {
    MeeshyAvatar(
        name = ring.displayName,
        size = StoryEntryMetrics.avatar,
        containerColor = hexColor(ring.accentHex),
        imageUrl = ring.avatarUrl,
    )
}

/** Le « + » de « Votre story », en coin haut-gauche (iOS `MyStoryButton`) : pastille de 20 dp, cible de 48 dp. */
@Composable
private fun BoxScope.AddBadge(onClick: (() -> Unit)? = null) {
    val addLabel = stringResource(R.string.stories_tray_add_story)
    Box(
        modifier = Modifier
            .align(Alignment.TopStart)
            .offset(x = -ADD_TARGET_BLEED, y = -ADD_TARGET_BLEED)
            .size(BADGE_TARGET)
            .then(
                if (onClick != null) {
                    Modifier.clickable(onClick = onClick).semantics { role = Role.Button; contentDescription = addLabel }
                } else {
                    Modifier
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(ADD_BADGE)
                .clip(CircleShape)
                .background(MeeshyPalette.Indigo500),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Add, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(14.dp))
        }
    }
}

/** L'humeur posée sur l'avatar ; appuyée, elle ouvre le statut (cible de 48 dp, pastille de 32 dp). */
@Composable
private fun BoxScope.MoodBadge(emoji: String, onClick: (() -> Unit)? = null) {
    val moodLabel = "${stringResource(R.string.stories_mood_kind)} $emoji"
    BadgeTarget(
        onClick = onClick,
        contentDescription = moodLabel,
    ) {
        Text(text = emoji, fontSize = 18.sp)
    }
}

/**
 * Le badge d'humeur du compte courant — iOS `MyStoryButton` : l'humeur posée quand il y en a une,
 * le « 💭 » d'invite sinon. Toujours un bouton qui mène au composeur d'humeur.
 */
@Composable
internal fun BoxScope.StatusBadge(moodEmoji: String?, onClick: () -> Unit) {
    val changeLabel = stringResource(R.string.story_tray_a11y_changeMood)
    BadgeTarget(onClick = onClick, contentDescription = changeLabel) {
        Text(text = moodEmoji?.takeIf { it.isNotEmpty() } ?: MOOD_PROMPT_GLYPH, fontSize = 18.sp)
    }
}

@Composable
private fun BoxScope.BadgeTarget(
    onClick: (() -> Unit)?,
    contentDescription: String,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .align(Alignment.BottomEnd)
            .offset(x = BADGE_TARGET_BLEED, y = BADGE_TARGET_BLEED)
            .size(BADGE_TARGET)
            .then(
                if (onClick != null) {
                    Modifier.clickable(role = Role.Button, onClick = onClick)
                        .semantics { this.contentDescription = contentDescription }
                } else {
                    Modifier
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(StoryEntryMetrics.badge)
                .clip(CircleShape)
                .background(MeeshyTheme.tokens.backgroundTertiary),
            contentAlignment = Alignment.Center,
        ) { content() }
    }
}

@Composable
private fun BoxScope.PresenceDot(ring: StoryRing) {
    val presence = rememberPresence(ring.userId.takeUnless { ring.isMine }, ring.servedPresence)
    val color = meeshyPresenceDotColor(presence) ?: return
    Box(
        modifier = Modifier
            .align(Alignment.BottomEnd)
            .size(PRESENCE_DOT_SIZE)
            .clip(CircleShape)
            .background(MeeshyTheme.tokens.backgroundPrimary)
            .padding(3.dp)
            .clip(CircleShape)
            .background(color),
    )
}

@Composable
private fun StoryRingFrame(ring: StoryRing, content: @Composable BoxScope.() -> Unit) {
    val style = ring.style
    val brush = when (style.emphasis) {
        StoryRingEmphasis.Unread -> Brush.linearGradient(
            listOf(hexColor(ring.accentHex), MeeshyPalette.Indigo500, hexColor(ring.accentHex)),
        )
        StoryRingEmphasis.Read -> {
            val quiet = MeeshyTheme.tokens.textSecondary.copy(alpha = 0.35f)
            Brush.linearGradient(listOf(quiet, quiet))
        }
        StoryRingEmphasis.None -> null
    }
    val ringModifier = if (brush != null) {
        Modifier.border(style.widthDp.dp, brush, CircleShape)
    } else {
        Modifier
    }
    Box(
        modifier = Modifier.size(StoryEntryMetrics.ring).then(ringModifier),
        contentAlignment = Alignment.Center,
        content = content,
    )
}

/** Points de comptage sous l'anneau : stories VIVANTES seulement, 5 au plus puis « + ». */
@Composable
private fun StoryCountDotsRow(
    dots: StoryCountDots?,
    accentHex: String,
    unviewedCount: Int,
    storyCount: Int,
) {
    val activeColor = hexColor(accentHex)
    val inactiveColor = MeeshyTheme.tokens.textSecondary.copy(alpha = 0.35f)
    val description = stringResource(R.string.stories_count_dots, unviewedCount, storyCount)
    Row(
        modifier = Modifier
            .padding(top = StoryEntryMetrics.labelSpacing)
            .height(DOT_SIZE)
            .semantics { if (dots != null) contentDescription = description },
        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(DOT_SPACING),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (dots == null) return@Row
        repeat(dots.dotCount) { index ->
            Box(
                modifier = Modifier
                    .size(DOT_SIZE)
                    .clip(CircleShape)
                    .background(if (dots.isActive(index)) activeColor else inactiveColor),
            )
        }
        if (dots.hasOverflow) {
            Text(
                text = "+",
                style = MaterialTheme.typography.labelSmall,
                color = inactiveColor,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
internal fun StoryLabel(label: String, unread: Boolean) {
    Text(
        text = label,
        fontSize = StoryEntryMetrics.LABEL_FONT_SP.sp,
        color = if (unread) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textSecondary,
        fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Medium,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        textAlign = TextAlign.Center,
        modifier = Modifier.width(StoryEntryMetrics.labelWidth),
    )
}

private val BADGE_TARGET = 48.dp
private val BADGE_TARGET_BLEED = (BADGE_TARGET - StoryEntryMetrics.badge) / 2
private val ADD_BADGE = StoryEntryMetrics.badge * 0.625f
private val ADD_TARGET_BLEED = (BADGE_TARGET - ADD_BADGE) / 2
private const val MOOD_PROMPT_GLYPH = "\uD83D\uDCAD"
private val DOT_SIZE = 4.dp
private val DOT_SPACING = 3.dp
private val PRESENCE_DOT_SIZE = 22.dp
private const val CASCADE_DURATION_MILLIS = 260
private const val CASCADE_START_SCALE = 0.85f
