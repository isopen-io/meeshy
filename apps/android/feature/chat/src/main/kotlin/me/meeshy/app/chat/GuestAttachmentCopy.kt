package me.meeshy.app.chat

import android.content.Context
import android.os.Build
import android.text.format.Formatter
import androidx.annotation.StringRes
import java.util.Locale
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.guest.GuestAttachmentAllowance
import me.meeshy.sdk.model.guest.GuestAttachmentKind
import me.meeshy.sdk.model.guest.GuestAttachmentRefusal

/** Les mots de la feuille d'un invite restreint (iOS `GuestAttachmentCopy`) : memes phrases, memes refus nommes. */
internal object GuestAttachmentCopy {
    @StringRes
    fun tileLabelRes(kind: GuestAttachmentKind): Int = when (kind) {
        GuestAttachmentKind.TEXT -> R.string.guest_attach_kind_text
        GuestAttachmentKind.AUDIO -> R.string.guest_attach_kind_audio
        GuestAttachmentKind.IMAGE -> R.string.guest_attach_kind_image
        GuestAttachmentKind.PDF -> R.string.guest_attach_kind_pdf
    }

    @StringRes
    private fun inlineLabelRes(kind: GuestAttachmentKind): Int = when (kind) {
        GuestAttachmentKind.TEXT -> R.string.guest_attach_inline_text
        GuestAttachmentKind.AUDIO -> R.string.guest_attach_inline_audio
        GuestAttachmentKind.IMAGE -> R.string.guest_attach_inline_image
        GuestAttachmentKind.PDF -> R.string.guest_attach_inline_pdf
    }

    /** Les familles ouvertes, jointes par la conjonction de la langue (« texte et audio »). */
    fun allowedList(context: Context, kinds: List<GuestAttachmentKind>): String {
        val labels = kinds.map { context.getString(inlineLabelRes(it)) }
        val locale = context.resources.configuration.locales[0] ?: Locale.getDefault()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            android.icu.text.ListFormatter.getInstance(locale).format(labels)
        } else {
            labels.joinToString(", ")
        }
    }

    fun note(context: Context, conversationTitle: String, kinds: List<GuestAttachmentKind>): String =
        context.getString(R.string.guest_attach_note, conversationTitle, allowedList(context, kinds))

    /** Le refus d'un fichier CHOISI, nomme. */
    fun refusal(context: Context, fileName: String, reason: GuestAttachmentRefusal.Reason, kinds: List<GuestAttachmentKind>): String =
        when (reason) {
            GuestAttachmentRefusal.Reason.KIND_NOT_ALLOWED ->
                context.getString(R.string.guest_attach_refused_kind, fileName, allowedList(context, kinds))
            GuestAttachmentRefusal.Reason.TOO_LARGE ->
                context.getString(R.string.guest_attach_refused_size, fileName, Formatter.formatShortFileSize(context, GuestAttachmentAllowance.MAX_BYTES))
        }
}
