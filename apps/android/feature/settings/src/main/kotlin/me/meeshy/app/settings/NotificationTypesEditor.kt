package me.meeshy.app.settings

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.NotificationCategory
import me.meeshy.sdk.model.NotificationType
import me.meeshy.sdk.model.NotificationTypeCatalog
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Éditeur des types d'événements : recherche puis bascule par type, groupé par catégorie. */
@Composable
internal fun NotificationTypesEditor(
    notifications: UserNotificationPreferences,
    query: String,
    onQueryChange: (String) -> Unit,
    onToggleType: (NotificationType, Boolean) -> Unit,
) {
    val labels: Map<NotificationType, String> =
        NotificationType.entries.associateWith { stringResource(notificationTypeLabelRes(it)) }
    val sections = NotificationTypeCatalog.sections(
        prefs = notifications,
        query = query,
        label = { labels.getValue(it) },
    )

    Text(
        text = stringResource(R.string.settings_notification_types_title),
        style = MaterialTheme.typography.labelMedium,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
    )
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        singleLine = true,
        leadingIcon = { Icon(MeeshyIcons.Search, contentDescription = null) },
        placeholder = { Text(stringResource(R.string.settings_notification_types_search)) },
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
    )
    if (sections.isEmpty()) {
        Text(
            text = stringResource(R.string.settings_notification_types_empty),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        return
    }
    sections.forEach { section ->
        Text(
            text = stringResource(notificationCategoryLabelRes(section.category)),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyPalette.Indigo500,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        )
        section.items.forEach { item ->
            NotificationToggleRow(
                label = labels.getValue(item.type),
                checked = item.enabled,
                enabled = notifications.pushEnabled,
                onCheckedChange = { onToggleType(item.type, it) },
            )
        }
    }
}

private fun notificationCategoryLabelRes(category: NotificationCategory): Int = when (category) {
    NotificationCategory.MESSAGES -> R.string.settings_notif_cat_messages
    NotificationCategory.CALLS -> R.string.settings_notif_cat_calls
    NotificationCategory.SOCIAL -> R.string.settings_notif_cat_social
    NotificationCategory.GROUPS -> R.string.settings_notif_cat_groups
    NotificationCategory.SYSTEM -> R.string.settings_notif_cat_system
}

private fun notificationTypeLabelRes(type: NotificationType): Int = when (type) {
    NotificationType.REPLY -> R.string.settings_notif_type_reply
    NotificationType.MENTION -> R.string.settings_notif_type_mention
    NotificationType.REACTION -> R.string.settings_notif_type_reaction
    NotificationType.CONVERSATION -> R.string.settings_notif_type_conversation
    NotificationType.INCOMING_CALL -> R.string.settings_notif_type_incoming_call
    NotificationType.MISSED_CALL -> R.string.settings_notif_type_missed_call
    NotificationType.VOICEMAIL -> R.string.settings_notif_type_voicemail
    NotificationType.POST_LIKE -> R.string.settings_notif_type_post_like
    NotificationType.POST_COMMENT -> R.string.settings_notif_type_post_comment
    NotificationType.POST_REPOST -> R.string.settings_notif_type_post_repost
    NotificationType.STORY_REACTION -> R.string.settings_notif_type_story_reaction
    NotificationType.COMMENT_REPLY -> R.string.settings_notif_type_comment_reply
    NotificationType.COMMENT_LIKE -> R.string.settings_notif_type_comment_like
    NotificationType.FRIEND_CONTENT -> R.string.settings_notif_type_friend_content
    NotificationType.GAME -> R.string.settings_notif_type_game
    NotificationType.CONTACT_ACTIVITY -> R.string.settings_notif_type_contact_activity
    NotificationType.CONTACT_REQUEST -> R.string.settings_notif_type_contact_request
    NotificationType.GROUP_INVITE -> R.string.settings_notif_type_group_invite
    NotificationType.MEMBER_JOINED -> R.string.settings_notif_type_member_joined
    NotificationType.MEMBER_LEFT -> R.string.settings_notif_type_member_left
    NotificationType.SYSTEM -> R.string.settings_notif_type_system
}
