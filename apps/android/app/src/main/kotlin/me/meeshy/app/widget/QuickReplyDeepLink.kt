package me.meeshy.app.widget

import java.net.URLEncoder

/**
 * Builds the `meeshy://conversation/{id}?draft={text}` deep link a Quick Reply chip
 * tap fires — consumed by `ChatViewModel.initialDraft`
 * (`java.net.URLDecoder`, its own `NOTES.md` entry explains why the JVM class is
 * preferred over `android.net.Uri` for anything exercised by a plain JVM unit
 * test). `URLEncoder` is the matching, equally testable counterpart — used here
 * rather than `android.net.Uri.encode` for the same reason.
 */
internal object QuickReplyDeepLink {
    fun uri(conversationId: String, draftText: String): String =
        "meeshy://conversation/$conversationId?draft=${URLEncoder.encode(draftText, "UTF-8")}"
}
