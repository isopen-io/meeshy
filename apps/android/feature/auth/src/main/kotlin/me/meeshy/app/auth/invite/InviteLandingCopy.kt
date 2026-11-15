package me.meeshy.app.auth.invite

import androidx.annotation.StringRes
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.InviteChoiceCaption
import me.meeshy.sdk.model.InviteChoiceNotice
import me.meeshy.sdk.model.InviteGroupKind
import me.meeshy.sdk.model.InviteGuestRight
import me.meeshy.sdk.model.InviteLandingChoice
import me.meeshy.sdk.model.InviteRequestedField

/** Les libellés de la page d'invitation : une seule table des clés vers les ressources. */
internal object InviteLandingCopy {
    @StringRes
    fun kind(kind: InviteGroupKind): Int = when (kind) {
        InviteGroupKind.DIRECT -> R.string.join_flow_preview_type_direct
        InviteGroupKind.GROUP -> R.string.join_flow_preview_type_group
        InviteGroupKind.PUBLIC -> R.string.join_flow_preview_type_public
        InviteGroupKind.GLOBAL -> R.string.join_flow_preview_type_global
        InviteGroupKind.COMMUNITY -> R.string.join_flow_preview_type_community
        InviteGroupKind.CHANNEL -> R.string.join_flow_preview_type_channel
        InviteGroupKind.OTHER -> R.string.join_flow_preview_default_title
    }

    @StringRes
    fun right(right: InviteGuestRight): Int = when (right) {
        InviteGuestRight.MESSAGES -> R.string.invite_landing_terms_messages
        InviteGuestRight.IMAGES -> R.string.invite_landing_terms_images
        InviteGuestRight.HISTORY -> R.string.invite_landing_terms_history
        InviteGuestRight.FILES -> R.string.invite_landing_terms_files
    }

    @StringRes
    fun field(field: InviteRequestedField): Int = when (field) {
        InviteRequestedField.NAME -> R.string.invite_landing_terms_field_name
        InviteRequestedField.NICKNAME -> R.string.invite_landing_terms_field_nickname
        InviteRequestedField.EMAIL -> R.string.invite_landing_terms_field_email
        InviteRequestedField.BIRTHDAY -> R.string.invite_landing_terms_field_birthday
    }

    /** Le libellé d'un choix, selon la session (reprendre, rejoindre ou continuer en anonyme). */
    @StringRes
    fun choice(choice: InviteLandingChoice, isSignedIn: Boolean, resumesGuestSession: Boolean): Int = when (choice) {
        InviteLandingChoice.JOIN_WITH_ACCOUNT -> R.string.invite_landing_choice_join_with_account
        InviteLandingChoice.JOIN_ANONYMOUSLY -> when {
            resumesGuestSession -> R.string.share_link_resume_anonymously
            isSignedIn -> R.string.invite_landing_choice_join_anonymously
            else -> R.string.invite_landing_choice_continue_anonymously
        }
        InviteLandingChoice.SIGN_IN -> R.string.invite_landing_choice_sign_in
        InviteLandingChoice.SIGN_UP -> R.string.invite_landing_choice_sign_up
    }

    @StringRes
    fun caption(caption: InviteChoiceCaption): Int = when (caption) {
        InviteChoiceCaption.ANONYMOUS_SIGNED_OUT -> R.string.invite_landing_choice_caption_signed_out
        InviteChoiceCaption.ANONYMOUS_SIGNED_IN -> R.string.invite_landing_choice_caption_signed_in
    }

    @StringRes
    fun notice(notice: InviteChoiceNotice): Int = when (notice) {
        InviteChoiceNotice.ACCOUNT_REQUIRED -> R.string.join_flow_preview_account_required_message
        InviteChoiceNotice.CLOSED -> R.string.invite_landing_choice_closed
    }
}
