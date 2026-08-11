package me.meeshy.app.shortcuts

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import me.meeshy.app.MainActivity
import me.meeshy.app.R
import me.meeshy.sdk.model.ApiConversation

/**
 * Publishes the app's dynamic launcher shortcuts (long-press the launcher icon) —
 * Android's closest local equivalent to iOS's `OpenRecentConversationIntent`/
 * `MeeshyAppShortcuts` "Recent Conversation" App Shortcut. Google Assistant "App
 * Actions" (the voice-triggered half of iOS's `AppShortcutsProvider` — send
 * message/call/translate) needs its own `shortcuts.xml` capability declarations
 * and is out of scope here; this covers only the always-local, always-verifiable
 * launcher long-press menu.
 *
 * **Deliberately minimal**, same posture as the home-screen widgets: no live
 * refresh hook of its own — [publish] is called once per [MainActivity.onResume],
 * a plain, cheap, idempotent re-publish (`setDynamicShortcuts` fully replaces the
 * set, so a stale entry from a since-deleted conversation is corrected on the very
 * next resume, never accumulates).
 */
internal object DynamicShortcutsPublisher {

    fun publish(context: Context, conversations: List<ApiConversation>, currentUserId: String?) {
        val maxCount = ShortcutManagerCompat.getMaxShortcutCountPerActivity(context)
        val presentation = DynamicShortcutsPresentation.from(conversations, currentUserId, maxCount)
        val icon = IconCompat.createWithResource(context, R.mipmap.ic_launcher)
        val shortcuts = presentation.rows.map { row ->
            ShortcutInfoCompat.Builder(context, row.id)
                .setShortLabel(row.shortLabel)
                .setLongLabel(row.shortLabel)
                .setIcon(icon)
                .setIntent(openConversationIntent(context, row.id))
                .build()
        }
        ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts)
    }
}

private fun openConversationIntent(context: Context, conversationId: String): Intent =
    Intent(
        Intent.ACTION_VIEW,
        Uri.parse("meeshy://conversation/$conversationId"),
        context,
        MainActivity::class.java,
    )
