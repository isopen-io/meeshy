package me.meeshy.app.stories

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.composer.AudienceCandidate
import me.meeshy.sdk.model.composer.ComposerAudienceReach
import me.meeshy.sdk.model.composer.ComposerAudienceSelection
import me.meeshy.sdk.model.composer.ComposerAudienceSubtitle
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Les pages de la feuille : une feuille montée sur une feuille est irreprésentable, le sélecteur remplace la page. */
private enum class AudiencePage { AUDIENCE, ONLY, EXCEPT, MENTION }

private val WarningTint = Color(0xFFFBBF24)

/**
 * La feuille d'AUDIENCE (vue `2l`) — qui verra, qui est nommé et sous quel mode, ce qui part avec
 * (hashtags). Présentée en feuille (croix + glissé vers le bas), comme le `.sheet` iOS. Les types
 * sont ceux de l'application (les six modes du serveur), pas une liste recopiée d'une maquette.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun StoryAudienceSheet(
    visibility: StoryVisibility,
    userIds: List<String>,
    mentions: List<PostMentionInput>,
    hashtags: List<String>,
    onChooseVisibility: (StoryVisibility) -> Unit,
    onUserIdsChange: (List<String>) -> Unit,
    onAddMention: (AudienceCandidate) -> Unit,
    onRemoveMention: (String) -> Unit,
    onRemoveHashtag: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var page by rememberSaveable { mutableStateOf(AudiencePage.AUDIENCE) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        AnimatedContent(
            targetState = page,
            transitionSpec = {
                val forward = targetState != AudiencePage.AUDIENCE
                (slideInHorizontally { if (forward) it / 4 else -it / 4 } + fadeIn()) togetherWith
                    (slideOutHorizontally { if (forward) -it / 4 else it / 4 } + fadeOut())
            },
            label = "audience-page",
        ) { current ->
            if (current == AudiencePage.AUDIENCE) {
                AudiencePage(
                    visibility = visibility,
                    userIds = userIds,
                    mentions = mentions,
                    hashtags = hashtags,
                    onChoose = { candidate ->
                        onChooseVisibility(candidate)
                        if (candidate.requiresUserSelection) {
                            page = if (candidate == StoryVisibility.ONLY) AudiencePage.ONLY else AudiencePage.EXCEPT
                        }
                    },
                    onAddMention = { page = AudiencePage.MENTION },
                    onRemoveMention = onRemoveMention,
                    onRemoveHashtag = onRemoveHashtag,
                    onClose = onDismiss,
                )
            } else {
                StoryAudiencePickerPage(
                    title = stringResource(current.titleRes()),
                    initialSelection = if (current == AudiencePage.MENTION) emptyList() else userIds,
                    single = current == AudiencePage.MENTION,
                    keepsBlocked = current == AudiencePage.EXCEPT,
                    onCancel = { page = AudiencePage.AUDIENCE },
                    onDone = { ids, people ->
                        if (current == AudiencePage.MENTION) people.forEach(onAddMention) else onUserIdsChange(ids)
                        page = AudiencePage.AUDIENCE
                    },
                )
            }
        }
    }
}

private fun AudiencePage.titleRes(): Int = when (this) {
    AudiencePage.ONLY -> R.string.audience_picker_only_title
    AudiencePage.EXCEPT -> R.string.audience_picker_except_title
    else -> R.string.stories_audience_pick_title_mention
}

@Composable
private fun AudiencePage(
    visibility: StoryVisibility,
    userIds: List<String>,
    mentions: List<PostMentionInput>,
    hashtags: List<String>,
    onChoose: (StoryVisibility) -> Unit,
    onAddMention: () -> Unit,
    onRemoveMention: (String) -> Unit,
    onRemoveHashtag: (String) -> Unit,
    onClose: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().navigationBarsPadding()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = MeeshySpacing.lg, end = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.composer_audience_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onClose) {
                Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.stories_audience_picker_cancel))
            }
        }
        HorizontalDivider()
        Column(
            modifier = Modifier
                .weight(1f, fill = false)
                .heightIn(max = 560.dp)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg),
        ) {
            ComposerAudienceSelection.offered.forEach { candidate ->
                AudienceRow(candidate, selected = candidate == visibility, count = userIds.size, onChoose = onChoose)
            }
            MentionsSection(visibility, userIds, mentions, onAddMention, onRemoveMention)
            HashtagsSection(hashtags, onRemoveHashtag)
            ScopeNote()
        }
        ApplyBar(visibility, onClose)
    }
}

@Composable
private fun AudienceRow(
    candidate: StoryVisibility,
    selected: Boolean,
    count: Int,
    onChoose: (StoryVisibility) -> Unit,
) {
    val haptics = LocalHapticFeedback.current
    val label = stringResource(candidate.labelRes())
    val subtitle = audienceSubtitle(candidate, count)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 60.dp)
            .clickable {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onChoose(candidate)
            }
            .semantics(mergeDescendants = true) {
                role = Role.RadioButton
                this.selected = selected
                contentDescription = label
                stateDescription = subtitle
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (selected) {
            Icon(MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = MeeshyPalette.Indigo500)
        }
    }
    HorizontalDivider()
}

@Composable
private fun audienceSubtitle(visibility: StoryVisibility, count: Int): String =
    when (ComposerAudienceSubtitle.of(visibility, count)) {
        ComposerAudienceSubtitle.Kind.PUBLIC -> stringResource(R.string.composer_audience_sub_public)
        ComposerAudienceSubtitle.Kind.COMMUNITY -> stringResource(R.string.composer_audience_sub_community)
        ComposerAudienceSubtitle.Kind.FRIENDS -> stringResource(R.string.composer_audience_sub_friends)
        ComposerAudienceSubtitle.Kind.PRIVATE -> stringResource(R.string.composer_audience_sub_private)
        ComposerAudienceSubtitle.Kind.PICK -> stringResource(R.string.composer_audience_sub_pick)
        ComposerAudienceSubtitle.Kind.COUNT -> stringResource(R.string.composer_audience_sub_count, count)
    }

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = MeeshySpacing.lg, bottom = MeeshySpacing.sm),
    )
}

@Composable
private fun MentionsSection(
    visibility: StoryVisibility,
    userIds: List<String>,
    mentions: List<PostMentionInput>,
    onAdd: () -> Unit,
    onRemove: (String) -> Unit,
) {
    SectionTitle(stringResource(R.string.composer_audience_mentions))
    mentions.forEach { mention ->
        val reach = ComposerAudienceReach.resolve(mention.userId, visibility, userIds)
        val handle = mention.username.orEmpty()
        Column(modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp), verticalArrangement = Arrangement.Center) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                Text("@$handle", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                Text(
                    stringResource(mentionModeRes(mention.display)),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.weight(1f))
                if (reach.warns) {
                    Icon(MeeshyIcons.WarningFilled, contentDescription = null, tint = WarningTint, modifier = Modifier.size(18.dp))
                }
                IconButton(onClick = { onRemove(handle) }) {
                    Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.stories_audience_mention_remove))
                }
            }
            if (reach.warns) {
                Text(
                    stringResource(R.string.composer_audience_mention_outside),
                    style = MaterialTheme.typography.bodySmall,
                    color = WarningTint,
                )
            }
        }
    }
    TextButton(onClick = onAdd) { Text(stringResource(R.string.stories_audience_mention_add)) }
}

private fun mentionModeRes(display: String?): Int = when (display) {
    "INLINE" -> R.string.composer_audience_mention_inline
    "PINNED" -> R.string.composer_audience_mention_pinned
    "SILENT" -> R.string.composer_audience_mention_silent
    else -> R.string.composer_audience_mention_note
}

@Composable
private fun HashtagsSection(hashtags: List<String>, onRemove: (String) -> Unit) {
    if (hashtags.isEmpty()) return
    val haptics = LocalHapticFeedback.current
    SectionTitle(stringResource(R.string.composer_audience_hashtags))
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        hashtags.forEach { tag ->
            val remove = stringResource(R.string.composer_audience_hashtag_remove)
            Row(
                modifier = Modifier
                    .heightIn(min = 44.dp)
                    .clickable(onClickLabel = remove) {
                        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onRemove(tag)
                    },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                Text("#$tag", style = MaterialTheme.typography.bodyMedium, color = MeeshyPalette.Indigo400)
                Icon(MeeshyIcons.Close, contentDescription = null, modifier = Modifier.size(14.dp))
            }
        }
    }
}

@Composable
private fun ScopeNote() {
    Text(
        text = stringResource(R.string.composer_audience_scope),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = MeeshySpacing.lg),
    )
}

@Composable
private fun ApplyBar(visibility: StoryVisibility, onApply: () -> Unit) {
    val label = stringResource(visibility.labelRes()).uppercase()
    Button(
        onClick = onApply,
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
    ) {
        Text("${stringResource(R.string.composer_audience_apply)} · $label")
    }
}
