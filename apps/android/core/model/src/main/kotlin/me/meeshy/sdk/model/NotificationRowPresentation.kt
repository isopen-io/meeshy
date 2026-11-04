package me.meeshy.sdk.model

/** Le palier célébré par une notification d'engagement, lu dans ses champs STRUCTURÉS (jamais dans la prose). */
public sealed interface NotificationMilestone {
    public data class Badge(val axis: String, val threshold: Int?) : NotificationMilestone
    public data class Achievement(val key: String) : NotificationMilestone
    public data class Level(val level: Int?) : NotificationMilestone
    public data class Streak(val days: Int?) : NotificationMilestone
}

/** Mots de repli d'un palier sans titre servi — la couche UI les résout dans la langue de l'application. */
public interface NotificationRowCopy {
    public fun milestoneName(milestone: NotificationMilestone): String?
    public fun milestoneReason(milestone: NotificationMilestone, inviteeName: String?): String?

    public data object None : NotificationRowCopy {
        override fun milestoneName(milestone: NotificationMilestone): String? = null
        override fun milestoneReason(milestone: NotificationMilestone, inviteeName: String?): String? = null
    }
}

/** La tête de rangée : avatar de l'acteur, médaillon de palier, ou signature Meeshy sans acteur. */
public sealed interface RowLeading {
    public data object Avatar : RowLeading
    public data class Milestone(val milestone: NotificationMilestone) : RowLeading
    public data object Signature : RowLeading
}

/**
 * Les pièces d'une rangée de la page Notifications, composées UNE fois par une règle pure — miroir de
 * `NotificationRowPresentation` (iOS) : la vue les place, elle ne décide de rien. Chaque texte ne paraît
 * qu'une fois ([NotificationRowText.distinct]).
 */
public data class NotificationRowPresentation(
    val leading: RowLeading,
    val title: String,
    val body: String?,
    val quote: String?,
    val footer: NotificationRowFooter?,
) {
    public companion object {

        public fun of(
            notification: ApiNotification,
            headline: String,
            body: String?,
            nowMillis: Long = System.currentTimeMillis(),
            copy: NotificationRowCopy = NotificationRowCopy.None,
        ): NotificationRowPresentation {
            milestone(notification)?.let { return milestonePresentation(notification, it, headline, copy) }
            val detail = NotificationRowDetail.of(notification, headline, body, nowMillis)
            return NotificationRowPresentation(
                leading = if (wearsSignature(notification)) RowLeading.Signature else RowLeading.Avatar,
                title = headline,
                body = detail.body,
                quote = detail.quote,
                footer = detail.footer,
            )
        }

        public fun milestone(notification: ApiNotification): NotificationMilestone? {
            val metadata = notification.metadata
            return when (notification.notificationType) {
                MeeshyNotificationType.BADGE_EARNED ->
                    metadata?.axisKey?.takeIf { it.isNotBlank() }?.let { NotificationMilestone.Badge(it, metadata.threshold) }
                MeeshyNotificationType.ACHIEVEMENT_UNLOCKED, MeeshyNotificationType.LEGACY_ACHIEVEMENT_UNLOCKED ->
                    metadata?.achievementKey?.takeIf { it.isNotBlank() }?.let { NotificationMilestone.Achievement(it) }
                MeeshyNotificationType.LEVEL_UP -> NotificationMilestone.Level(metadata?.level ?: metadata?.threshold)
                MeeshyNotificationType.STREAK_MILESTONE -> NotificationMilestone.Streak(metadata?.threshold)
                else -> null
            }
        }

        /** Un palier qui porte `tierRank` a son titre et son corps composés par la passerelle : rendus tels quels. */
        private fun milestonePresentation(
            notification: ApiNotification,
            milestone: NotificationMilestone,
            headline: String,
            copy: NotificationRowCopy,
        ): NotificationRowPresentation {
            val served = notification.metadata?.tierRank != null
            val content = notification.content.nonEmpty()
            val name = (if (served) notification.title.nonEmpty() else null)
                ?: copy.milestoneName(milestone)
                ?: headline
            val reason = (if (served) content else null)
                ?: copy.milestoneReason(milestone, notification.actor?.displayedName?.takeIf { it.isNotBlank() })
                ?: content
            val texts = NotificationRowText.distinct(listOf(name, reason))
            return NotificationRowPresentation(RowLeading.Milestone(milestone), name, texts[1], null, null)
        }

        private fun wearsSignature(notification: ApiNotification): Boolean {
            val type = notification.notificationType
            if (type in GAME_SURFACES) return true
            val hasActor = notification.actor?.let { it.displayName.nonEmpty() != null || it.username.nonEmpty() != null } == true
            return !hasActor && type in SIGNED_WITHOUT_ACTOR
        }

        private fun String?.nonEmpty(): String? = this?.takeIf { it.isNotEmpty() }

        private val GAME_SURFACES = setOf(
            MeeshyNotificationType.GAME_LEAGUE_RESULT,
            MeeshyNotificationType.GAME_SEASON_STEP,
            MeeshyNotificationType.GAME_MISSION_WINDOW,
        )

        private val SIGNED_WITHOUT_ACTOR = setOf(
            MeeshyNotificationType.SECURITY_ALERT, MeeshyNotificationType.LOGIN_NEW_DEVICE,
            MeeshyNotificationType.PASSWORD_CHANGED, MeeshyNotificationType.TWO_FACTOR_ENABLED,
            MeeshyNotificationType.TWO_FACTOR_DISABLED, MeeshyNotificationType.SYSTEM,
            MeeshyNotificationType.MAINTENANCE, MeeshyNotificationType.UPDATE_AVAILABLE,
            MeeshyNotificationType.REPORT_RESOLVED, MeeshyNotificationType.CONTENT_REMOVED,
            MeeshyNotificationType.LEGACY_SYSTEM_ALERT,
        )
    }
}

/** Le texte lu par TalkBack : « Non lu. » puis titre, corps, citation, pied, heure — sans répétition. */
public fun NotificationRowPresentation.accessibilityDescription(
    isUnread: Boolean,
    unreadPrefix: String,
    footerText: String?,
    timeText: String?,
): String {
    val parts = listOf(title, body, quote, footerText, timeText).filter { !it.isNullOrEmpty() }
    return (if (isUnread) "$unreadPrefix " else "") + parts.joinToString(". ")
}
