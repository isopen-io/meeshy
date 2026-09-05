package me.meeshy.app.widget

import android.content.Context
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
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.flow.first
import me.meeshy.app.MainActivity
import me.meeshy.app.R

/**
 * Home-screen widget scaffold — first slice of `feature-parity.md`'s "Home-screen
 * widgets" cross-cutting item (a categorical gap: zero `GlanceAppWidget`/
 * `AppWidgetProvider` anywhere in `apps/android` before this slice). Mirrors iOS
 * `MeeshyWidgets.UnreadCountWidget`'s `.systemSmall` face: a single number (or an
 * "all caught up" state), tapping opens the app.
 *
 * **Deliberately minimal/static** — the "first foundation slice" the routine's own
 * notes called for, not a full port. No push-refresh-on-data-change (the Android
 * analogue of `WidgetCenter.reloadAllTimelines()`), no additional widget sizes/
 * kinds (iOS ships 4 + a Live Activity), no resizing/multiple layouts. Those are
 * the natural next sub-slices of this epic.
 *
 * Data source: [me.meeshy.sdk.conversation.ConversationRepository.totalUnreadCount]
 * — Room-only, no network, a SQL `SUM` rather than a decode of every cached
 * conversation (#5190) — so the widget renders instantly from whatever is
 * already cached even with no connectivity at refresh time, never a fabricated
 * placeholder count (an empty/never-synced cache is a real, honest "0 unread").
 */
internal class UnreadCountWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repository = EntryPointAccessors.fromApplication(
            context,
            WidgetEntryPoint::class.java,
        ).conversationRepository()

        val total = repository.totalUnreadCount().first()
        val presentation = UnreadWidgetPresentation.from(total)

        provideContent {
            UnreadCountWidgetContent(presentation)
        }
    }
}

@Composable
private fun UnreadCountWidgetContent(presentation: UnreadWidgetPresentation) {
    val context = LocalContext.current
    val white = ColorProvider(Color.White)

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Color(0xFF6366F1))
            .padding(12.dp)
            .clickable(actionStartActivity<MainActivity>()),
        horizontalAlignment = Alignment.Horizontal.CenterHorizontally,
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        if (presentation.hasUnread) {
            Text(
                text = presentation.count.toString(),
                style = TextStyle(color = white, fontSize = 28.sp, fontWeight = FontWeight.Bold),
            )
            Text(
                text = context.getString(R.string.widget_unread_label),
                style = TextStyle(color = white, fontSize = 12.sp),
            )
        } else {
            Text(
                text = context.getString(R.string.widget_all_read_label),
                style = TextStyle(color = white, fontSize = 14.sp, fontWeight = FontWeight.Medium),
            )
        }
    }
}

/** Registers [UnreadCountWidget] with the OS (AndroidManifest `<receiver>`). */
internal class UnreadCountWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = UnreadCountWidget()
}
