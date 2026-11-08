package me.meeshy.app.shortcuts

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import me.meeshy.app.MainActivity
import me.meeshy.app.R
import me.meeshy.app.navigation.LaunchShortcut
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
        val presentation = DynamicShortcutsPresentation.from(conversations, currentUserId, (EntryShortcut.conversationSlots(maxCount) - 1).coerceAtLeast(0))
        val icon = IconCompat.createWithResource(context, R.mipmap.ic_launcher)
        val entries = EntryShortcut.all.map { entry ->
            val label = context.getString(entry.labelRes)
            ShortcutInfoCompat.Builder(context, entry.shortcutId)
                .setShortLabel(label)
                .setLongLabel(label)
                .setIcon(icon)
                .setIntent(Intent(Intent.ACTION_VIEW, Uri.parse(entry.address), context, MainActivity::class.java))
                .build()
        }
        val publishLabel = context.getString(R.string.shortcut_publish_post)
        val publish = ShortcutInfoCompat.Builder(context, PUBLISH_POST_SHORTCUT_ID)
            .setShortLabel(publishLabel)
            .setLongLabel(publishLabel)
            .setIcon(icon)
            .setIntent(
                Intent(Intent.ACTION_MAIN, null, context, MainActivity::class.java)
                    .putExtra(LaunchShortcut.EXTRA, LaunchShortcut.COMPOSE_POST),
            )
            .build()
        val shortcuts = listOf(publish) + entries + presentation.rows.map { row ->
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

private const val PUBLISH_POST_SHORTCUT_ID = "entry-publish-post"

private fun openConversationIntent(context: Context, conversationId: String): Intent =
    Intent(
        Intent.ACTION_VIEW,
        Uri.parse("meeshy://conversation/$conversationId"),
        context,
        MainActivity::class.java,
    )
