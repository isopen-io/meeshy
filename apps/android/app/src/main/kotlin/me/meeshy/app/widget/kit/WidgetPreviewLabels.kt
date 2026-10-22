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
    ).withMediaKinds(ResourceMediaKindStrings(context))
