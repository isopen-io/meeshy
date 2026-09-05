package me.meeshy.app.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.actionStartActivity as actionStartActivityIntent
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import dagger.hilt.android.EntryPointAccessors
import me.meeshy.app.MainActivity
import me.meeshy.app.R
import me.meeshy.app.conversations.LastMessagePreviewLabels
import me.meeshy.feature.conversations.R as ConversationsR

/**
 * Home-screen widget — parity target: iOS `MeeshyWidgets.QuickReplyWidget`
 * (`.systemMedium`/`.systemLarge`, here a single resizable face). Fourth
 * sub-tranche of `feature-parity.md`'s "Home-screen widgets" item. Features the
 * SAME conversation iOS's own `QuickReplyWidgetView` would (first unread, else
 * first, over the same pinned-first-then-recency ordering the sibling widgets
 * already apply) with 4 canned-reply chips (👍/OK/Thanks!/Call me — the exact
 * set iOS ships).
 *
 * **Genuinely functional, unlike its iOS counterpart**: iOS's own quick-reply
 * buttons deep-link to `meeshy://quickreply/{id}?text=...`, a host
 * `DeepLinkRouter.swift` never handles — dead in production (confirmed by
 * reading the full router before this slice; see `NOTES.md`/`PROGRESS.md` for
 * the `dynamic-launcher-shortcuts` slice that found it). Android's chips
 * deep-link via the real, newly-wired `meeshy://conversation/{id}?draft={text}`
 * (`chat-composer-prefill-draft` slice) — tapping one opens the conversation with
 * the reply text already typed in the composer, ready to confirm. Deliberately
 * PREFILLS rather than auto-sends: a blind background send from a cold widget
 * process has no confirmation step, prefilling matches the "opens the app with
 * the reply ready" posture instead.
 */
internal class QuickReplyWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val entryPoint = EntryPointAccessors.fromApplication(context, WidgetEntryPoint::class.java)
        val conversations = entryPoint.conversationRepository().recentCachedConversations()
        val currentUserId = entryPoint.tokenStore().userId
        val labels = LastMessagePreviewLabels(
            photo = context.getString(ConversationsR.string.conversations_preview_photo),
            video = context.getString(ConversationsR.string.conversations_preview_video),
            voice = context.getString(ConversationsR.string.conversations_preview_voice),
            file = context.getString(ConversationsR.string.conversations_preview_file),
            location = context.getString(ConversationsR.string.conversations_preview_location),
            none = context.getString(ConversationsR.string.conversations_no_messages),
            you = context.getString(ConversationsR.string.conversations_preview_you),
            senderFormat = context.getString(ConversationsR.string.conversations_preview_sender_format),
            draftPrefix = context.getString(ConversationsR.string.conversations_preview_draft_prefix),
        )
        val presentation = QuickReplyWidgetPresentation.from(conversations, currentUserId, labels)

        provideContent {
            QuickReplyWidgetContent(presentation)
        }
    }
}

@Composable
private fun QuickReplyWidgetContent(presentation: QuickReplyWidgetPresentation?) {
    val context = LocalContext.current
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Color.White)
            .padding(12.dp),
    ) {
        Text(
            text = context.getString(R.string.widget_quick_reply_title),
            style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Bold, color = ColorProvider(Color(0xFF4338CA))),
        )
        if (presentation == null) {
            Column(
                modifier = GlanceModifier
                    .fillMaxSize()
                    .clickable(actionStartActivity<MainActivity>()),
                horizontalAlignment = Alignment.Horizontal.CenterHorizontally,
                verticalAlignment = Alignment.Vertical.CenterVertically,
            ) {
                Text(
                    text = context.getString(R.string.widget_quick_reply_empty),
                    style = TextStyle(fontSize = 12.sp, color = ColorProvider(Color.Gray)),
                )
            }
        } else {
            Text(
                text = presentation.title,
                style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ColorProvider(Color.Black)),
                maxLines = 1,
                modifier = GlanceModifier.padding(top = 8.dp),
            )
            Text(
                text = presentation.preview,
                style = TextStyle(fontSize = 11.sp, color = ColorProvider(Color.DarkGray)),
                maxLines = 2,
            )
            Row(modifier = GlanceModifier.fillMaxWidth().padding(top = 8.dp)) {
                QuickReplyChip(text = "👍", conversationId = presentation.conversationId)
                QuickReplyChip(
                    text = context.getString(R.string.widget_quick_reply_ok),
                    conversationId = presentation.conversationId,
                )
                QuickReplyChip(
                    text = context.getString(R.string.widget_quick_reply_thanks),
                    conversationId = presentation.conversationId,
                )
                QuickReplyChip(
                    text = context.getString(R.string.widget_quick_reply_call_me),
                    conversationId = presentation.conversationId,
                )
            }
        }
    }
}

@Composable
private fun QuickReplyChip(text: String, conversationId: String) {
    val context = LocalContext.current
    Box(
        modifier = GlanceModifier
            .padding(end = 6.dp)
            .background(ColorProvider(Color(0xFFEEF2FF)))
            .clickable(actionStartActivityIntent(quickReplyIntent(context, conversationId, text)))
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Text(text = text, style = TextStyle(fontSize = 12.sp, color = ColorProvider(Color(0xFF4338CA))))
    }
}

private fun quickReplyIntent(context: Context, conversationId: String, text: String): Intent =
    Intent(
        Intent.ACTION_VIEW,
        Uri.parse(QuickReplyDeepLink.uri(conversationId, text)),
        context,
        MainActivity::class.java,
    )

/** Registers [QuickReplyWidget] with the OS (AndroidManifest `<receiver>`). */
internal class QuickReplyWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = QuickReplyWidget()
}
