package me.meeshy.app.chat

import androidx.annotation.StringRes
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.e2ee.ConversationEncryptionExplanation
import me.meeshy.sdk.model.e2ee.ConversationEncryptionExplanation.Fact
import me.meeshy.sdk.model.e2ee.ConversationEncryptionExplanation.Topic
import me.meeshy.sdk.model.e2ee.ConversationEncryptionModeChoice
import me.meeshy.sdk.model.e2ee.ConversationEncryptionRegime
import me.meeshy.ui.icons.MeeshyIcons

/** Les mots et les glyphes de la fiche Chiffrement : une table, un endroit (miroir de `ConversationEncryptionExplanation+Text.swift`). */

@StringRes
internal fun Topic.titleRes(): Int = when (this) {
    Topic.WHO_READS -> R.string.encryption_topic_who_reads
    Topic.AVAILABLE -> R.string.encryption_topic_available
    Topic.ABSENT -> R.string.encryption_topic_absent
    Topic.NOT_YET -> R.string.encryption_topic_not_yet
    Topic.DEVICES -> R.string.encryption_topic_devices
    Topic.SWITCHING -> R.string.encryption_topic_switching
    Topic.PERMANENCE -> R.string.encryption_topic_permanence
}

/**
 * Un sujet de la fiche tel qu'il se dessine (#17697) : ce qui se lit au repos, et le détail secondaire
 * rangé derrière le (i) du sujet, dont le nom accessible est [questionRes]. Aucun fait ne disparaît :
 * [noted] est lu par le lecteur d'écran même replié.
 */
internal data class ExplanationTopicLayout(val topic: Topic, val visible: List<Fact>, val noted: List<Fact>) {
    @get:StringRes
    val questionRes: Int? get() = if (noted.isEmpty()) null else topic.noteQuestionRes()
}

private fun Topic.notedFacts(): Set<Fact> = when (this) {
    Topic.WHO_READS -> setOf(Fact.HYBRID_SECOND_LAYER)
    Topic.DEVICES -> setOf(Fact.DEVICE_LIMIT, Fact.RESTORED_DEVICE_IS_NEW)
    Topic.SWITCHING -> setOf(Fact.WHO_MAY_TOGGLE, Fact.SWITCH_KEEPS_HISTORY)
    else -> emptySet()
}

@StringRes
private fun Topic.noteQuestionRes(): Int? = when (this) {
    Topic.WHO_READS -> R.string.encryption_note_second_layer_question
    Topic.DEVICES -> R.string.encryption_note_devices_question
    Topic.SWITCHING -> R.string.encryption_note_switching_question
    else -> null
}

/**
 * Ce que la fiche dit au repos, sujet par sujet. [footerStatesFinality] : le pied d'activation, déjà
 * visible près du bouton, dit l'irréversibilité en entier ; la phrase courte quitte alors le sujet
 * « Changer de mode » au lieu de la redire. Le sujet garde le fait « change visible dans la
 * conversation » ; l'irréversibilité reste visible (au pied, ou dans le sujet quand il n'y a pas de pied).
 */
internal fun ConversationEncryptionExplanation.layout(footerStatesFinality: Boolean): List<ExplanationTopicLayout> =
    sections.mapNotNull { section ->
        val facts = section.facts.filterNot { footerStatesFinality && it == Fact.END_TO_END_IS_FINAL }
        val noted = section.topic.notedFacts()
        ExplanationTopicLayout(section.topic, facts.filterNot { it in noted }, facts.filter { it in noted })
            .takeIf { it.visible.isNotEmpty() || it.noted.isNotEmpty() }
    }

@StringRes
internal fun Fact.textRes(): Int = when (this) {
    Fact.TRANSIT_PROTECTED -> R.string.encryption_fact_transit_protected
    Fact.STORED_WITHOUT_ENCRYPTION -> R.string.encryption_fact_stored_without_encryption
    Fact.ENCRYPTED_ON_SERVER_SERVER_READS -> R.string.encryption_fact_encrypted_on_server_server_reads
    Fact.HYBRID_IS_SERVER_TODAY -> R.string.encryption_fact_hybrid_is_server_today
    Fact.HYBRID_SECOND_LAYER -> R.string.encryption_fact_hybrid_second_layer
    Fact.ONLY_PARTICIPANTS_READ -> R.string.encryption_fact_only_participants_read
    Fact.EVERY_SERVER_FEATURE -> R.string.encryption_fact_every_server_feature
    Fact.TRANSLATED_ON_DEVICE -> R.string.encryption_fact_translated_on_device
    Fact.NO_SERVER_TRANSCRIPTION -> R.string.encryption_fact_no_server_transcription
    Fact.NO_NOTIFICATION_PREVIEW -> R.string.encryption_fact_no_notification_preview
    Fact.NO_SEARCH -> R.string.encryption_fact_no_search
    Fact.NO_EDIT -> R.string.encryption_fact_no_edit
    Fact.NO_FORWARD -> R.string.encryption_fact_no_forward
    Fact.NO_OFFLINE_SENDING -> R.string.encryption_fact_no_offline_sending
    Fact.NOT_YET_ATTACHMENTS -> R.string.encryption_fact_not_yet_attachments
    Fact.NOT_YET_DECRYPTED_NOTIFICATIONS -> R.string.encryption_fact_not_yet_decrypted_notifications
    Fact.NOT_YET_GROUPS -> R.string.encryption_fact_not_yet_groups
    Fact.GROUP_SENDING_UNAVAILABLE -> R.string.encryption_fact_group_sending_unavailable
    Fact.NOT_YET_SAFETY_NUMBERS -> R.string.encryption_fact_not_yet_safety_numbers
    Fact.ONE_KEY_PER_DEVICE -> R.string.encryption_fact_one_key_per_device
    Fact.DEVICE_LIMIT -> R.string.encryption_fact_device_limit
    Fact.RESTORED_DEVICE_IS_NEW -> R.string.encryption_fact_restored_device_is_new
    Fact.WHO_MAY_TOGGLE -> R.string.encryption_fact_who_may_toggle
    Fact.SWITCH_KEEPS_HISTORY -> R.string.encryption_fact_switch_keeps_history
    Fact.SWITCH_IS_SHOWN_IN_THREAD -> R.string.encryption_fact_switch_is_shown_in_thread
    Fact.END_TO_END_IS_FINAL -> R.string.encryption_fact_end_to_end_is_final
    Fact.END_TO_END_NEVER_TURNED_OFF -> R.string.encryption_fact_end_to_end_never_turned_off
    Fact.END_TO_END_NEVER_TURNED_OFF_DIRECT -> R.string.encryption_fact_end_to_end_never_turned_off_direct
    Fact.SERVER_CANNOT_TURN_IT_OFF -> R.string.encryption_fact_server_cannot_turn_it_off
}

internal fun Fact.icon(): ImageVector = when (this) {
    Fact.TRANSIT_PROTECTED -> MeeshyIcons.SwapHorizontal
    Fact.STORED_WITHOUT_ENCRYPTION -> MeeshyIcons.LockOpen
    Fact.ENCRYPTED_ON_SERVER_SERVER_READS -> MeeshyIcons.Cloud
    Fact.HYBRID_IS_SERVER_TODAY -> MeeshyIcons.Info
    Fact.HYBRID_SECOND_LAYER -> MeeshyIcons.VerifiedUser
    Fact.ONLY_PARTICIPANTS_READ -> MeeshyIcons.ShieldFilled
    Fact.EVERY_SERVER_FEATURE -> MeeshyIcons.CheckCircle
    Fact.TRANSLATED_ON_DEVICE -> MeeshyIcons.Globe
    Fact.NO_SERVER_TRANSCRIPTION -> MeeshyIcons.Waveform
    Fact.NO_NOTIFICATION_PREVIEW -> MeeshyIcons.BellOff
    Fact.NO_SEARCH -> MeeshyIcons.Search
    Fact.NO_EDIT -> MeeshyIcons.Edit
    Fact.NO_FORWARD -> MeeshyIcons.Forward
    Fact.NO_OFFLINE_SENDING -> MeeshyIcons.WifiOff
    Fact.NOT_YET_ATTACHMENTS -> MeeshyIcons.AttachFile
    Fact.NOT_YET_DECRYPTED_NOTIFICATIONS -> MeeshyIcons.Bell
    Fact.NOT_YET_GROUPS -> MeeshyIcons.Groups
    Fact.GROUP_SENDING_UNAVAILABLE -> MeeshyIcons.GroupsFilled
    Fact.NOT_YET_SAFETY_NUMBERS -> MeeshyIcons.VerifiedUser
    Fact.ONE_KEY_PER_DEVICE -> MeeshyIcons.Key
    Fact.DEVICE_LIMIT -> MeeshyIcons.Smartphone
    Fact.RESTORED_DEVICE_IS_NEW -> MeeshyIcons.Refresh
    Fact.WHO_MAY_TOGGLE -> MeeshyIcons.PersonVerified
    Fact.SWITCH_KEEPS_HISTORY -> MeeshyIcons.History
    Fact.SWITCH_IS_SHOWN_IN_THREAD -> MeeshyIcons.Chat
    Fact.END_TO_END_IS_FINAL -> MeeshyIcons.LockFilled
    Fact.END_TO_END_NEVER_TURNED_OFF, Fact.END_TO_END_NEVER_TURNED_OFF_DIRECT -> MeeshyIcons.Shield
    Fact.SERVER_CANNOT_TURN_IT_OFF -> MeeshyIcons.Smartphone
}

@StringRes
internal fun ConversationEncryptionRegime.summaryRes(): Int = when (this) {
    ConversationEncryptionRegime.NONE -> R.string.encryption_summary_none
    ConversationEncryptionRegime.SERVER -> R.string.encryption_summary_server
    ConversationEncryptionRegime.HYBRID -> R.string.encryption_summary_hybrid
    ConversationEncryptionRegime.END_TO_END -> R.string.encryption_summary_end_to_end
}

internal fun ConversationEncryptionRegime.icon(): ImageVector = when (this) {
    ConversationEncryptionRegime.NONE -> MeeshyIcons.LockOpen
    ConversationEncryptionRegime.SERVER, ConversationEncryptionRegime.HYBRID -> MeeshyIcons.Cloud
    ConversationEncryptionRegime.END_TO_END -> MeeshyIcons.ShieldFilled
}

@StringRes
internal fun ConversationEncryptionModeChoice.labelRes(): Int = when (this) {
    ConversationEncryptionModeChoice.E2EE -> R.string.encryption_mode_e2ee_label
    ConversationEncryptionModeChoice.SERVER -> R.string.encryption_mode_server_label
    ConversationEncryptionModeChoice.HYBRID -> R.string.encryption_mode_hybrid_label
}

@StringRes
internal fun ConversationEncryptionModeChoice.descriptionRes(): Int = when (this) {
    ConversationEncryptionModeChoice.E2EE -> R.string.encryption_mode_e2ee_description
    ConversationEncryptionModeChoice.SERVER -> R.string.encryption_mode_server_description
    ConversationEncryptionModeChoice.HYBRID -> R.string.encryption_mode_hybrid_description
}

@StringRes
internal fun ConversationEncryptionNotice.textRes(): Int = when (this) {
    ConversationEncryptionNotice.READ_FAILED -> R.string.encryption_read_failed
    ConversationEncryptionNotice.OFFLINE -> R.string.encryption_offline
    ConversationEncryptionNotice.REGIME_CHANGED -> R.string.encryption_detail_regime_changed
    ConversationEncryptionNotice.IRREVERSIBLE -> R.string.encryption_irreversible_refused
    ConversationEncryptionNotice.FORBIDDEN -> R.string.encryption_toggle_forbidden
    ConversationEncryptionNotice.RESTRICTED -> R.string.encryption_activation_restricted
    ConversationEncryptionNotice.ALREADY_ENABLED -> R.string.encryption_already_enabled
    ConversationEncryptionNotice.DIRECT_ALREADY_END_TO_END -> R.string.encryption_detail_direct_already_end_to_end
    ConversationEncryptionNotice.DIRECT_NOT_A_PAIR -> R.string.encryption_detail_direct_not_a_pair
    ConversationEncryptionNotice.FAILED -> R.string.encryption_action_failed
}
