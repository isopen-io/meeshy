package me.meeshy.app.widget.kit

import android.content.Context
import me.meeshy.app.conversations.LastMessagePreviewLabels
import me.meeshy.app.conversations.withMediaKinds
import me.meeshy.feature.conversations.R as ConversationsR
import me.meeshy.ui.component.media.ResourceMediaKindStrings

/** Libellés d'aperçu uniques, partagés par tous les widgets de conversations. */
internal fun widgetPreviewLabels(context: Context): LastMessagePreviewLabels =
    LastMessagePreviewLabels(
        photo = "",
        video = "",
        voice = "",
        file = "",
        location = "",
        none = context.getString(ConversationsR.string.conversations_no_messages),
        you = context.getString(ConversationsR.string.conversations_preview_you),
        senderFormat = context.getString(ConversationsR.string.conversations_preview_sender_format),
        draftPrefix = context.getString(ConversationsR.string.conversations_preview_draft_prefix),
        expired = context.getString(ConversationsR.string.conversations_preview_expired),
        hidden = context.getString(ConversationsR.string.conversations_preview_hidden),
        viewOnce = context.getString(ConversationsR.string.conversations_preview_view_once),
        encrypted = context.getString(ConversationsR.string.conversations_preview_end_to_end),
    ).withMediaKinds(ResourceMediaKindStrings(context))

/** Le libellé d'un contenu qui disparaît (flamme à durée ou après lecture) : iOS `exit.preview.ephemeral`. */
internal fun widgetEphemeralLabel(context: Context): String =
    context.getString(ConversationsR.string.conversations_preview_ephemeral_content_description)
