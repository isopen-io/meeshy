package me.meeshy.app.notifications

import androidx.annotation.StringRes
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.NotificationFilterCategory
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.hexColor

/** Une catégorie, vue de l'écran : icône, libellé de puce, titre de son vide et sa couleur de marque. */
internal fun NotificationFilterCategory.color(): Color = hexColor(accentHex)

internal fun NotificationFilterCategory.icon(): ImageVector = when (this) {
    NotificationFilterCategory.ALL -> MeeshyIcons.BellFilled
    NotificationFilterCategory.UNREAD -> MeeshyIcons.Record
    NotificationFilterCategory.MESSAGES -> MeeshyIcons.Chat
    NotificationFilterCategory.REACTIONS -> MeeshyIcons.HeartFilled
    NotificationFilterCategory.MENTIONS -> MeeshyIcons.Mention
    NotificationFilterCategory.SOCIAL -> MeeshyIcons.ForumFilled
    NotificationFilterCategory.ENGAGEMENT -> MeeshyIcons.Trophy
    NotificationFilterCategory.CONTACTS -> MeeshyIcons.PersonAdd
    NotificationFilterCategory.GROUPS -> MeeshyIcons.GroupsFilled
    NotificationFilterCategory.CALLS -> MeeshyIcons.Call
    NotificationFilterCategory.TRANSLATIONS -> MeeshyIcons.Translate
    NotificationFilterCategory.SYSTEM -> MeeshyIcons.SettingsFilled
}

@StringRes
internal fun NotificationFilterCategory.labelRes(): Int = when (this) {
    NotificationFilterCategory.ALL -> R.string.notifications_category_all
    NotificationFilterCategory.UNREAD -> R.string.notifications_category_unread
    NotificationFilterCategory.MESSAGES -> R.string.notifications_category_messages
    NotificationFilterCategory.REACTIONS -> R.string.notifications_category_reactions
    NotificationFilterCategory.MENTIONS -> R.string.notifications_category_mentions
    NotificationFilterCategory.SOCIAL -> R.string.notifications_category_social
    NotificationFilterCategory.ENGAGEMENT -> R.string.notifications_category_engagement
    NotificationFilterCategory.CONTACTS -> R.string.notifications_category_contacts
    NotificationFilterCategory.GROUPS -> R.string.notifications_category_groups
    NotificationFilterCategory.CALLS -> R.string.notifications_category_calls
    NotificationFilterCategory.TRANSLATIONS -> R.string.notifications_category_translations
    NotificationFilterCategory.SYSTEM -> R.string.notifications_category_system
}

@StringRes
internal fun NotificationFilterCategory.emptyRes(): Int = when (this) {
    NotificationFilterCategory.ALL -> R.string.notifications_empty
    NotificationFilterCategory.UNREAD -> R.string.notifications_empty_unread
    NotificationFilterCategory.MESSAGES -> R.string.notifications_empty_messages
    NotificationFilterCategory.REACTIONS -> R.string.notifications_empty_reactions
    NotificationFilterCategory.MENTIONS -> R.string.notifications_empty_mentions
    NotificationFilterCategory.SOCIAL -> R.string.notifications_empty_social
    NotificationFilterCategory.ENGAGEMENT -> R.string.notifications_empty_engagement
    NotificationFilterCategory.CONTACTS -> R.string.notifications_empty_contacts
    NotificationFilterCategory.GROUPS -> R.string.notifications_empty_groups
    NotificationFilterCategory.CALLS -> R.string.notifications_empty_calls
    NotificationFilterCategory.TRANSLATIONS -> R.string.notifications_empty_translations
    NotificationFilterCategory.SYSTEM -> R.string.notifications_empty_system
}
