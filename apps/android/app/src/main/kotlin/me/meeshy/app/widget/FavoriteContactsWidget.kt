package me.meeshy.app.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
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
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.lazy.GridCells
import androidx.glance.appwidget.lazy.LazyVerticalGrid
import androidx.glance.appwidget.lazy.items
import androidx.glance.LocalSize
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.TextAlign
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import dagger.hilt.android.EntryPointAccessors
import me.meeshy.app.MainActivity
import me.meeshy.app.R
import me.meeshy.app.widget.kit.WidgetAvatarBitmap
import me.meeshy.app.widget.kit.WidgetPresence
import me.meeshy.sdk.model.PresenceState
import me.meeshy.app.widget.kit.WidgetTheme
import me.meeshy.app.widget.kit.widgetSurface
import androidx.glance.Image
import androidx.glance.ImageProvider

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
 * **Deliberately minimal**, same posture as the two sibling widgets: Room-only read
 * (no network), repainted when the cache or the presence tier of a shown contact
 * changes ([WidgetRepaintInitializer]).
 *
 * The presence dot mirrors iOS `WidgetFavoriteContact.presence` (#13747): the stable
 * state token (online / away / idle / offline, 1/3/5 rule), never a display string.
 * It is derived from the live `PresenceStore` at paint time — what the server served
 * for that peer, nothing fabricated — and `WidgetAvatarBitmap` draws it with the
 * central `meeshyPresenceDotColor` table (offline or unserved: no dot).
 */
internal class FavoriteContactsWidget : GlanceAppWidget() {

    /** La hauteur réelle décide 4 (moyen) ou 8 (grand) favoris, comme `family` sur iOS. */
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val entryPoint = EntryPointAccessors.fromApplication(context, WidgetEntryPoint::class.java)
        val conversations = entryPoint.conversationRepository().recentCachedConversations()
        val currentUserId = entryPoint.tokenStore().userId
        val presentation = FavoriteContactsWidgetPresentation.from(
            conversations = conversations,
            currentUserId = currentUserId,
            presence = WidgetPresenceTiers.forDisplay(entryPoint.presenceStore(), conversations, currentUserId),
        )

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
            .widgetSurface()
            .padding(12.dp),
    ) {
        Text(
            text = context.getString(R.string.widget_favorites_header),
            style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Bold, color = WidgetTheme.title),
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
                    style = TextStyle(fontSize = 12.sp, color = WidgetTheme.textSecondary),
                )
            }
        } else {
            val visible = presentation.visibleRows(LocalSize.current.height.value)
            LazyVerticalGrid(
                gridCells = GridCells.Adaptive(GRID_MIN_CELL_DP.dp),
                modifier = GlanceModifier.fillMaxSize().padding(top = 8.dp),
            ) {
                items(visible, itemId = { it.id.hashCode().toLong() }) { row ->
                    FavoriteContactCell(row)
                }
            }
        }
    }
}

@Composable
private fun FavoriteContactCell(row: FavoriteContactRow) {
    val context = LocalContext.current
    val description = FavoriteContactsWidgetPresentation.accessibilityLabel(row.name, presenceLabel(context, row.presence))
    Column(
        modifier = GlanceModifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .semantics { contentDescription = description }
            .clickable(actionStartActivityIntent(openConversationIntent(context, row.id))),
        horizontalAlignment = Alignment.Horizontal.CenterHorizontally,
    ) {
        Image(
            provider = ImageProvider(WidgetAvatarBitmap.render(context, row.name, row.accentHex, AVATAR_DP, presence = row.presence)),
            contentDescription = null,
            modifier = GlanceModifier.size(AVATAR_DP.dp),
        )
        Text(
            text = row.name,
            style = TextStyle(
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = WidgetTheme.textPrimary,
                textAlign = TextAlign.Center,
            ),
            maxLines = 1,
            modifier = GlanceModifier.padding(top = 4.dp),
        )
    }
}

/** Le libellé parlé du jeton de présence ; `null` quand rien n'a été servi. */
private fun presenceLabel(context: Context, token: String?): String? =
    when (WidgetPresence.parse(token)?.state) {
        PresenceState.ONLINE -> context.getString(R.string.widget_presence_online)
        PresenceState.AWAY -> context.getString(R.string.widget_presence_away)
        PresenceState.IDLE -> context.getString(R.string.widget_presence_idle)
        PresenceState.OFFLINE -> context.getString(R.string.widget_presence_offline)
        null -> null
    }

private const val AVATAR_DP = 50

/** iOS `GridItem(.adaptive(minimum: 65))`. */
private const val GRID_MIN_CELL_DP = 65

private fun openConversationIntent(context: Context, conversationId: String): Intent =
    Intent(
        Intent.ACTION_VIEW,
        Uri.parse(WidgetDeepLink.conversation(conversationId)),
        context,
        MainActivity::class.java,
    )

/** Registers [FavoriteContactsWidget] with the OS (AndroidManifest `<receiver>`). */
internal class FavoriteContactsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = FavoriteContactsWidget()
}
