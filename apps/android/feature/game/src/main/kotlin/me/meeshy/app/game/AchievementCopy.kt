package me.meeshy.app.game

import android.content.res.Resources
import java.text.NumberFormat
import java.util.Locale
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.engagement.AchievementFamily

/**
 * Les MOTS des succès générés (miroir de `AchievementCopy`, iOS, et de `achievement-labels.ts`) : UN gabarit par
 * FAMILLE, `%1$s` portant le palier, formaté selon la locale du LECTEUR (« 1 000 » en français, « 1,000 » en anglais).
 * Le palier 1 d'une famille de volume prend son singulier. Une famille hors catalogue rend `null`, jamais une clé
 * technique affichée.
 */
internal object AchievementCopy {

    fun knows(family: AchievementFamily): Boolean = FAMILY_LABELS.containsKey(family.id)

    fun label(res: Resources, locale: Locale, family: AchievementFamily, tier: Int): String? {
        val labels = FAMILY_LABELS[family.id] ?: return null
        val number = NumberFormat.getIntegerInstance(locale).format(tier)
        val one = labels.second
        return res.getString(if (tier == 1 && one != null) one else labels.first, number)
    }

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
