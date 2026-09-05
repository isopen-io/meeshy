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
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import dagger.hilt.android.EntryPointAccessors
import me.meeshy.app.MainActivity
import me.meeshy.app.R
import me.meeshy.app.conversations.LastMessagePreviewLabels
import me.meeshy.feature.conversations.R as ConversationsR
import me.meeshy.ui.theme.hexColor
import androidx.glance.appwidget.action.actionStartActivity as actionStartActivityIntent

/**
 * Home-screen widget — parity target: iOS `MeeshyWidgets.RecentConversationsWidget`
 * (`.systemSmall`/`.systemMedium`/`.systemLarge`, here a single resizable face up to
 * 5 rows — Android widgets resize continuously rather than switching discrete
 * `WidgetFamily` layouts). Second sub-tranche of `feature-parity.md`'s "Home-screen
 * widgets" item, after `UnreadCountWidget`. Tapping a row deep-links straight into
 * that conversation (`meeshy://conversation/{id}`, matched by the app's own
 * `navDeepLink` — see `MeeshyApp.Routes.CONVERSATION_SINGULAR_DEEP_LINK`); tapping
 * the empty state or the header opens the app.
 *
 * **Deliberately minimal**, same posture as `UnreadCountWidget`: static/OS-triggered
 * refresh only (no push-refresh-on-data-change), Room-only read (no network — a
 * disconnected device still renders whatever is cached, never blocks), no mark-read
 * quick action yet (iOS's own `MarkConversationReadIntent` is the natural next
 * sub-tranche once a Glance `ActionCallback` wiring precedent exists in this app).
 */
internal class RecentConversationsWidget : GlanceAppWidget() {

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
        val presentation = RecentConversationsWidgetPresentation.from(conversations, currentUserId, labels)

        provideContent {
            RecentConversationsWidgetContent(presentation)
        }
    }
}

@Composable
private fun RecentConversationsWidgetContent(presentation: RecentConversationsWidgetPresentation) {
    val context = LocalContext.current
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Color.White)
            .padding(12.dp),
    ) {
        Text(
            text = context.getString(R.string.widget_recent_conversations_title),
            style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Bold, color = ColorProvider(Color(0xFF4338CA))),
        )
        if (presentation.isEmpty) {
            Column(
                modifier = GlanceModifier
                    .fillMaxSize()
                    .clickable(actionStartActivity<MainActivity>()),
                horizontalAlignment = Alignment.Horizontal.CenterHorizontally,
                verticalAlignment = Alignment.Vertical.CenterVertically,
            ) {
                Text(
                    text = context.getString(R.string.widget_recent_conversations_empty),
                    style = TextStyle(fontSize = 12.sp, color = ColorProvider(Color.Gray)),
                )
            }
        } else {
            LazyColumn(modifier = GlanceModifier.fillMaxSize()) {
                items(presentation.rows, itemId = { it.id.hashCode().toLong() }) { row ->
                    RecentConversationRowContent(row)
                }
            }
        }
    }
}

@Composable
private fun RecentConversationRowContent(row: RecentConversationRow) {
    val context = LocalContext.current
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .clickable(actionStartActivityIntent(openConversationIntent(context, row.id))),
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        Box(
            modifier = GlanceModifier
                .size(6.dp)
                .background(ColorProvider(hexColor(row.accentHex))),
            content = {},
        )
        Column(modifier = GlanceModifier.padding(start = 8.dp).fillMaxWidth()) {
            Text(
                text = row.title,
                style = TextStyle(
                    fontSize = 13.sp,
                    fontWeight = if (row.isUnread) FontWeight.Bold else FontWeight.Medium,
                    color = ColorProvider(Color.Black),
                ),
                maxLines = 1,
            )
            Text(
                text = row.preview,
                style = TextStyle(fontSize = 11.sp, color = ColorProvider(Color.DarkGray)),
                maxLines = 1,
            )
        }
        if (row.isUnread) {
            Box(
                modifier = GlanceModifier
                    .padding(start = 6.dp)
                    .size(8.dp)
                    .background(ColorProvider(Color(0xFF6366F1))),
                content = {},
            )
        }
    }
}

private fun openConversationIntent(context: Context, conversationId: String): Intent =
    Intent(
        Intent.ACTION_VIEW,
        Uri.parse("meeshy://conversation/$conversationId"),
        context,
        MainActivity::class.java,
    )

/** Registers [RecentConversationsWidget] with the OS (AndroidManifest `<receiver>`). */
internal class RecentConversationsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = RecentConversationsWidget()
}
