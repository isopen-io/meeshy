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
import me.meeshy.ui.theme.hexColor

/**
 * Home-screen widget — parity target: iOS `MeeshyWidgets.FavoriteContactsWidget`
 * (`.systemMedium`/`.systemLarge`, here a single resizable face). Third sub-tranche
 * of `feature-parity.md`'s "Home-screen widgets" item, after `UnreadCountWidget`
 * and `RecentConversationsWidget`. A "favorite contact" is a pinned direct
 * conversation (mirrors iOS's own `WidgetDataManager.publishFavoriteContacts`
 * exactly — there is no separate favorites concept on either platform). Tapping a
 * row deep-links straight into that conversation; unlike iOS's own
 * `meeshy://contact/{id}` URI (which Android has no matching route for), this
 * reuses the already-wired `meeshy://conversation/{id}` deep link — arguably
 * better UX (opens the chat directly) and avoids inventing a second, redundant
 * route for the same underlying id.
 *
 * **Deliberately minimal**, same posture as the two sibling widgets: static/
 * OS-triggered refresh only, Room-only read (no network), no presence/online
 * status badge (Android's `ApiConversation.participants` carries no presence
 * fields the way `MeeshyConversation.lastSeenAt` does on iOS — a real,
 * documented gap, not an oversight; see `PROGRESS.md`).
 *
 * That gap is narrower than it reads. Until 2026-08-13, iOS shipped a presence
 * dot here that could never light: the app published a human label
 * (`lastSeenText`, hardcoded French) across the App Group while the widget
 * gated the dot on `status == "Online"`. iOS now publishes a stable
 * `PresenceState` token instead — so when Android closes this gap, the thing to
 * mirror is that TOKEN and the 1/3/5 colour rule (`Presence.kt`), never a
 * display string. What crosses a process boundary is data, not a label.
 */
internal class FavoriteContactsWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val entryPoint = EntryPointAccessors.fromApplication(context, WidgetEntryPoint::class.java)
        val conversations = entryPoint.conversationRepository().recentCachedConversations()
        val currentUserId = entryPoint.tokenStore().userId
        val presentation = FavoriteContactsWidgetPresentation.from(conversations, currentUserId)

        provideContent {
            FavoriteContactsWidgetContent(presentation)
        }
    }
}

@Composable
private fun FavoriteContactsWidgetContent(presentation: FavoriteContactsWidgetPresentation) {
    val context = LocalContext.current
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Color.White)
            .padding(12.dp),
    ) {
        Text(
            text = context.getString(R.string.widget_favorite_contacts_title),
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
                    text = context.getString(R.string.widget_favorite_contacts_empty),
                    style = TextStyle(fontSize = 12.sp, color = ColorProvider(Color.Gray)),
                )
            }
        } else {
            LazyColumn(modifier = GlanceModifier.fillMaxSize()) {
                items(presentation.rows, itemId = { it.id.hashCode().toLong() }) { row ->
                    FavoriteContactRowContent(row)
                }
            }
        }
    }
}

@Composable
private fun FavoriteContactRowContent(row: FavoriteContactRow) {
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
                .size(28.dp)
                .background(ColorProvider(hexColor(row.accentHex))),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = row.name.take(1).uppercase(),
                style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Bold, color = ColorProvider(Color.White)),
            )
        }
        Text(
            text = row.name,
            style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ColorProvider(Color.Black)),
            maxLines = 1,
            modifier = GlanceModifier.padding(start = 8.dp).fillMaxWidth(),
        )
    }
}

private fun openConversationIntent(context: Context, conversationId: String): Intent =
    Intent(
        Intent.ACTION_VIEW,
        Uri.parse("meeshy://conversation/$conversationId"),
        context,
        MainActivity::class.java,
    )

/** Registers [FavoriteContactsWidget] with the OS (AndroidManifest `<receiver>`). */
internal class FavoriteContactsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = FavoriteContactsWidget()
}
