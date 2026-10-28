package me.meeshy.app.game.reveal

import android.content.res.Resources
import androidx.annotation.StringRes
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.engagement.AchievementFamily
import me.meeshy.sdk.model.game.engagement.EngagementAchievementKey
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import me.meeshy.sdk.model.game.engagement.EngagementRevealPlan
import me.meeshy.sdk.model.game.engagement.RevealBanner
import me.meeshy.sdk.model.game.engagement.RevealSubtitle
import me.meeshy.sdk.model.game.engagement.RevealTitle

/**
 * Les MOTS de la révélation d'un palier (miroir de `ProgressionCopy` + `AchievementCopy`, iOS) : le plan dit QUOI, ce
 * fichier le fait parler dans la langue du lecteur. Jamais une clé technique à l'écran : une famille sans gabarit tombe
 * sur le titre de sa section, un axe inconnu sur son seuil seul.
 */
internal object RevealCopy {

    fun title(res: Resources, locale: Locale, title: RevealTitle): String = when (title) {
        is RevealTitle.Legacy -> res.getString(legacyTitle(title.key))
        is RevealTitle.Composed -> familyLabel(res, locale, title.family, title.tier) ?: sectionTitle(res, title.family.section)
        is RevealTitle.BadgeTier -> "${title.threshold} ${axisInSentence(res.getString(axisName(title.axis)), locale)}"
        is RevealTitle.UnknownBadgeTier -> res.getString(R.string.reveal_badge_tier, title.threshold)
        is RevealTitle.Streak -> res.getQuantityString(R.plurals.progression_streak_days, title.days, title.days)
        is RevealTitle.Level -> res.getString(R.string.progression_level, title.rank)
    }

    fun subtitle(res: Resources, subtitle: RevealSubtitle): String = when (subtitle) {
        is RevealSubtitle.LegacyCondition -> res.getString(legacyCondition(subtitle.key))
        is RevealSubtitle.Composed -> res.getString(R.string.reveal_composed_subtitle, sectionTitle(res, subtitle.section))
        RevealSubtitle.BadgeAxis -> res.getString(R.string.reveal_badge_axis_subtitle)
        is RevealSubtitle.Streak -> res.getString(R.string.reveal_streak_subtitle, subtitle.days)
        RevealSubtitle.Level -> res.getString(R.string.reveal_level_subtitle)
    }

    fun banner(res: Resources, locale: Locale, banner: RevealBanner): String = when (banner) {
        RevealBanner.Achievement -> res.getString(R.string.reveal_badge_achievement)
        RevealBanner.Badge -> res.getString(R.string.reveal_badge_badge)
        RevealBanner.Streak -> res.getString(R.string.reveal_badge_streak)
        RevealBanner.Level -> res.getString(R.string.reveal_badge_level)
        RevealBanner.Locked -> res.getString(R.string.reveal_badge_locked)
        RevealBanner.Obtained -> res.getString(R.string.reveal_badge_unlocked)
        is RevealBanner.ObtainedOn -> obtainedOn(banner.reachedAt, locale)
            ?.let { res.getString(R.string.progression_obtained, it) }
            ?: res.getString(R.string.reveal_badge_unlocked)
    }

    /** La phrase lue d'un trait par le lecteur d'écran : « Succès débloqué. <titre>. <explication> ». */
    fun spoken(res: Resources, locale: Locale, plan: EngagementRevealPlan): String =
        "${banner(res, locale, plan.banner)}. ${title(res, locale, plan.title)}. ${subtitle(res, plan.subtitle)}"

    private fun obtainedOn(reachedAt: String, locale: Locale): String? = runCatching {
        DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(locale)
            .format(Instant.parse(reachedAt).atZone(ZoneId.systemDefault()))
    }.getOrNull()

    /** Le nombre est formaté selon la locale du LECTEUR : « 1 000 » en français, « 1,000 » en anglais. */
    private fun familyLabel(res: Resources, locale: Locale, family: AchievementFamily, tier: Int): String? {
        val labels = FAMILY_LABELS[family.id] ?: return null
        val number = NumberFormat.getIntegerInstance(locale).format(tier)
        val one = labels.second
        return res.getString(if (tier == 1 && one != null) one else labels.first, number)
    }

    private fun sectionTitle(res: Resources, section: String): String =
        SECTIONS[section]?.let(res::getString) ?: section

    /**
     * En allemand, un nom commun garde sa majuscule ; seul l'adjectif qui ouvre le groupe la perd après le numéral
     * (« 10 geknüpfte Freundschaften », « 100 Sprachnachrichten »). Les autres langues passent le nom en minuscule.
     */
    private fun axisInSentence(name: String, locale: Locale): String {
        if (!locale.language.equals("de", ignoreCase = true)) return name.lowercase(locale)
        val words = name.split(" ")
        val capitalised = words.size >= 2 && words[0].first().isUpperCase() && words[1].first().isUpperCase()
        return if (capitalised) name.replaceFirstChar { it.lowercase() } else name
    }

    @StringRes private fun legacyTitle(key: EngagementAchievementKey): Int = when (key) {
        EngagementAchievementKey.FIRST_CONTENT -> R.string.progression_achievement_first_content_title
        EngagementAchievementKey.ALL_CONTENT_TYPES -> R.string.progression_achievement_all_content_types_title
        EngagementAchievementKey.FIRST_VOICE -> R.string.progression_achievement_first_voice_title
        EngagementAchievementKey.EDITOR -> R.string.progression_achievement_editor_title
        EngagementAchievementKey.THREE_CONVERSATION_KINDS -> R.string.progression_achievement_three_conversation_kinds_title
    }

    @StringRes private fun legacyCondition(key: EngagementAchievementKey): Int = when (key) {
        EngagementAchievementKey.FIRST_CONTENT -> R.string.progression_achievement_first_content_condition
        EngagementAchievementKey.ALL_CONTENT_TYPES -> R.string.progression_achievement_all_content_types_condition
        EngagementAchievementKey.FIRST_VOICE -> R.string.progression_achievement_first_voice_condition
        EngagementAchievementKey.EDITOR -> R.string.progression_achievement_editor_condition
        EngagementAchievementKey.THREE_CONVERSATION_KINDS -> R.string.progression_achievement_three_conversation_kinds_condition
    }

    @StringRes private fun axisName(axis: EngagementAxisKey): Int = AXES.getValue(axis)

    private val AXES: Map<EngagementAxisKey, Int> = mapOf(
        EngagementAxisKey.AUDIO_MESSAGE to R.string.progression_axis_content_audio_message,
        EngagementAxisKey.TEXT_MESSAGE to R.string.progression_axis_content_text_message,
        EngagementAxisKey.POST to R.string.progression_axis_content_post,
        EngagementAxisKey.STORY to R.string.progression_axis_content_story,
        EngagementAxisKey.REEL to R.string.progression_axis_content_reel,
        EngagementAxisKey.AUDIO_COMMENT to R.string.progression_axis_comment_audio,
        EngagementAxisKey.TEXT_COMMENT to R.string.progression_axis_comment_text,
        EngagementAxisKey.PRIVATE_CONVERSATION to R.string.progression_axis_conversation_private,
        EngagementAxisKey.PUBLIC_CONVERSATION to R.string.progression_axis_conversation_public,
        EngagementAxisKey.COMMUNITY_CONVERSATION to R.string.progression_axis_conversation_community,
        EngagementAxisKey.GROUP_CREATED to R.string.progression_axis_conversation_group_created,
        EngagementAxisKey.STICKER to R.string.progression_axis_tool_sticker,
        EngagementAxisKey.IN_APP_EDIT to R.string.progression_axis_tool_in_app_edit,
        EngagementAxisKey.DIRECT_PUBLISH to R.string.progression_axis_tool_direct_publish,
        EngagementAxisKey.REACTION to R.string.progression_axis_tool_reaction,
        EngagementAxisKey.ATTACHMENT to R.string.progression_axis_tool_attachment,
        EngagementAxisKey.TRACKED_LINK to R.string.progression_axis_social_tracked_link,
        EngagementAxisKey.SHARE to R.string.progression_axis_social_share,
        EngagementAxisKey.INVITE_JOINED to R.string.progression_axis_social_invite_joined,
        EngagementAxisKey.FRIENDSHIP to R.string.progression_axis_social_friendship,
    )

    private val SECTIONS: Map<String, Int> = mapOf(
        "cercles" to R.string.achievement_section_cercles,
        "parole" to R.string.achievement_section_parole,
        "retouche" to R.string.achievement_section_retouche,
        "appels" to R.string.achievement_section_appels,
        "ambassade" to R.string.achievement_section_ambassade,
        "constance" to R.string.achievement_section_constance,
        "monnaie" to R.string.achievement_section_monnaie,
        "decouverte" to R.string.achievement_section_decouverte,
    )

    /** Famille → (gabarit pluriel, gabarit du palier 1 pour les familles de VOLUME). */
    private val FAMILY_LABELS: Map<String, Pair<Int, Int?>> = mapOf(
        "conversation.join.size" to (R.string.achievement_conversation_join_size to null),
        "conversation.join.count" to (R.string.achievement_conversation_join_count to R.string.achievement_conversation_join_count_one),
        "conversation.leave.count" to (R.string.achievement_conversation_leave_count to R.string.achievement_conversation_leave_count_one),
        "conversation.create.count" to (R.string.achievement_conversation_create_count to R.string.achievement_conversation_create_count_one),
        "community.join.size" to (R.string.achievement_community_join_size to null),
        "community.join.count" to (R.string.achievement_community_join_count to R.string.achievement_community_join_count_one),
        "community.create.size" to (R.string.achievement_community_create_size to null),
        "community.create.count" to (R.string.achievement_community_create_count to R.string.achievement_community_create_count_one),
        "message.send.count" to (R.string.achievement_message_send_count to R.string.achievement_message_send_count_one),
        "voice.send.count" to (R.string.achievement_voice_send_count to R.string.achievement_voice_send_count_one),
        "image.send.count" to (R.string.achievement_image_send_count to R.string.achievement_image_send_count_one),
        "video.send.count" to (R.string.achievement_video_send_count to R.string.achievement_video_send_count_one),
        "message.edit.count" to (R.string.achievement_message_edit_count to R.string.achievement_message_edit_count_one),
        "message.delete.count" to (R.string.achievement_message_delete_count to R.string.achievement_message_delete_count_one),
        "message.react.count" to (R.string.achievement_message_react_count to R.string.achievement_message_react_count_one),
        "call.join.count" to (R.string.achievement_call_join_count to R.string.achievement_call_join_count_one),
        "call.start.count" to (R.string.achievement_call_start_count to R.string.achievement_call_start_count_one),
        "call.start.size" to (R.string.achievement_call_start_size to null),
        "referral.complete.count" to (R.string.achievement_referral_complete_count to R.string.achievement_referral_complete_count_one),
        "link.click.count" to (R.string.achievement_link_click_count to R.string.achievement_link_click_count_one),
        "streak.hold.count" to (R.string.achievement_streak_hold_count to R.string.achievement_streak_hold_count_one),
        "meesh.mint.count" to (R.string.achievement_meesh_mint_count to R.string.achievement_meesh_mint_count_one),
    )
}
