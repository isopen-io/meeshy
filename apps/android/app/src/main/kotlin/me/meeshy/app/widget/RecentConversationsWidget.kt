package me.meeshy.app.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity as actionStartActivityIntent
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.flow.first
import me.meeshy.app.MainActivity
import me.meeshy.app.R
import me.meeshy.app.widget.kit.WidgetAvatarBitmap
import me.meeshy.app.widget.kit.WidgetReaderPrismStore
import me.meeshy.app.widget.kit.WidgetRelativeTime
import me.meeshy.app.widget.kit.WidgetTheme
import me.meeshy.app.widget.kit.widgetEphemeralLabel
import me.meeshy.app.widget.kit.widgetPreviewLabels
import me.meeshy.app.widget.kit.widgetSurface

/**
 * Widget « Conversations récentes » — miroir d'iOS `RecentConversationsWidget` en trois faces
 * ([RecentConversationsFace]) choisies par la taille posée (`SizeMode.Responsive`) : la petite
 * (compteur + première conversation), la moyenne (en-tête + 2 lignes, coche « Marquer comme lu »)
 * et la grande (5 lignes, avatar 40 dp, épingle, heure relative). Lecture dans Room seule, sans
 * réseau : un cache non vide s'affiche toujours, sans spinner. La coche passe par
 * [MarkReadActionCallback] et l'outbox `READ_RECEIPT` existante.
 */
internal class RecentConversationsWidget : GlanceAppWidget() {

    override val sizeMode: SizeMode = SizeMode.Responsive(FACE_SIZES)

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val entryPoint = EntryPointAccessors.fromApplication(context, WidgetEntryPoint::class.java)
        val currentUserId = entryPoint.tokenStore().userId
        val signedIn = !currentUserId.isNullOrBlank()
        val conversations = if (signedIn) entryPoint.conversationRepository().recentCachedConversations() else emptyList()
        val shared = entryPoint.unreadBadgeCoordinator().state.value
        val presentation = RecentConversationsWidgetPresentation.from(
            conversations = conversations,
            currentUserId = currentUserId,
            previewLabels = widgetPreviewLabels(context),
            preferredLanguages = WidgetReaderPrismStore(context).load(),
            ephemeralLabel = widgetEphemeralLabel(context),
            presence = WidgetPresenceTiers.forDisplay(entryPoint.presenceStore(), conversations, currentUserId),
            totalUnread = if (!signedIn) 0 else if (shared.seeded) shared.total else entryPoint.conversationRepository().totalUnreadCount().first(),
            signedIn = signedIn,
        )

        provideContent {
            val size = LocalSize.current
            RecentConversationsWidgetContent(presentation, RecentConversationsFace.forSize(size.width.value, size.height.value))
        }
    }

    private companion object {
        val FACE_SIZES = setOf(DpSize(110.dp, 110.dp), DpSize(250.dp, 110.dp), DpSize(250.dp, 250.dp))
    }
}

@Composable
private fun RecentConversationsWidgetContent(presentation: RecentConversationsWidgetPresentation, face: RecentConversationsFace) {
    val context = LocalContext.current
    val rows = presentation.rowsFor(face)
    val openApp = actionStartActivity<MainActivity>()
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .widgetSurface()
            .padding(12.dp)
            .clickable(if (face == RecentConversationsFace.SMALL) actionStartActivityIntent(openIntent(context, WidgetDeepLink.RECENT)) else openApp),
    ) {
        Header(presentation, face)
        when {
            !presentation.signedIn || rows.isEmpty() -> EmptyState(context.getString(R.string.widget_recent_conversations_empty))
            else -> rows.forEach { row ->
                when (face) {
                    RecentConversationsFace.SMALL -> SmallRow(row)
                    RecentConversationsFace.MEDIUM -> MediumRow(row)
                    RecentConversationsFace.LARGE -> LargeRow(row)
                }
            }
        }
    }
}

@Composable
private fun Header(presentation: RecentConversationsWidgetPresentation, face: RecentConversationsFace) {
    val context = LocalContext.current
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Vertical.CenterVertically) {
        if (face == RecentConversationsFace.SMALL) {
            Text(
                text = presentation.unreadTotal.toString(),
                style = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Bold, color = WidgetTheme.title),
            )
        } else {
            Text(
                text = context.getString(
                    if (face == RecentConversationsFace.LARGE) R.string.widget_recent_conversations_title else R.string.widget_conversations,
                ),
                style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Bold, color = WidgetTheme.title),
                maxLines = 1,
            )
            if (presentation.showUnreadPill) {
                Spacer(modifier = GlanceModifier.defaultWeight())
                Text(
                    text = context.resources.getQuantityString(R.plurals.widget_unread_count, presentation.unreadTotal, presentation.unreadTotal),
                    style = TextStyle(fontSize = 11.sp, color = WidgetTheme.chipText),
                    modifier = GlanceModifier
                        .background(WidgetTheme.chipBackground)
                        .cornerRadius(8.dp)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun EmptyState(message: String) {
    Column(
        modifier = GlanceModifier.fillMaxSize().clickable(actionStartActivity<MainActivity>()),
        horizontalAlignment = Alignment.Horizontal.CenterHorizontally,
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        Text(text = message, style = TextStyle(fontSize = 12.sp, color = WidgetTheme.textSecondary))
    }
}

@Composable
private fun SmallRow(row: RecentConversationRow) {
    Row(modifier = GlanceModifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.Vertical.CenterVertically) {
        Avatar(row, SMALL_AVATAR_DP)
        Column(modifier = GlanceModifier.padding(start = 8.dp)) {
            Text(row.title, style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Bold, color = WidgetTheme.textPrimary), maxLines = 1)
            Text(row.preview, style = TextStyle(fontSize = 11.sp, color = WidgetTheme.textSecondary), maxLines = 2)
        }
    }
}

@Composable
private fun MediumRow(row: RecentConversationRow) {
    val context = LocalContext.current
    Row(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.Vertical.CenterVertically) {
        Row(
            modifier = GlanceModifier.defaultWeight().clickable(actionStartActivityIntent(openIntent(context, row.deepLink))),
            verticalAlignment = Alignment.Vertical.CenterVertically,
        ) {
            Avatar(row, MEDIUM_AVATAR_DP)
            Column(modifier = GlanceModifier.padding(start = 8.dp).defaultWeight()) {
                TitleLine(row, 13)
                Text(row.preview, style = TextStyle(fontSize = 11.sp, color = WidgetTheme.textSecondary), maxLines = 1)
            }
            if (row.isUnread) UnreadDot(8)
        }
        if (row.isUnread) MarkReadButton(row.id)
    }
}

@Composable
private fun LargeRow(row: RecentConversationRow) {
    val context = LocalContext.current
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clickable(actionStartActivityIntent(openIntent(context, row.deepLink))),
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        Avatar(row, LARGE_AVATAR_DP)
        Column(modifier = GlanceModifier.padding(start = 12.dp).defaultWeight()) {
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Vertical.CenterVertically) {
                Box(modifier = GlanceModifier.defaultWeight()) { TitleLine(row, 14) }
                row.epochMillis?.let {
                    Text(
                        text = WidgetRelativeTime.format(context, it),
                        style = TextStyle(fontSize = 10.sp, color = WidgetTheme.textSecondary),
                        maxLines = 1,
                    )
                }
            }
            Text(row.preview, style = TextStyle(fontSize = 11.sp, color = WidgetTheme.textSecondary), maxLines = 2)
        }
        if (row.isUnread) {
            Spacer(modifier = GlanceModifier.width(6.dp))
            UnreadDot(10)
        }
    }
}

@Composable
private fun TitleLine(row: RecentConversationRow, sizeSp: Int) {
    Row(verticalAlignment = Alignment.Vertical.CenterVertically) {
        Text(
            text = row.title,
            style = TextStyle(
                fontSize = sizeSp.sp,
                fontWeight = if (row.isUnread) FontWeight.Bold else FontWeight.Medium,
                color = WidgetTheme.textPrimary,
            ),
            maxLines = 1,
        )
        if (row.isPinned) {
            Spacer(modifier = GlanceModifier.width(4.dp))
            Image(
                provider = ImageProvider(R.drawable.ic_widget_pin),
                contentDescription = null,
                colorFilter = androidx.glance.ColorFilter.tint(WidgetTheme.pin),
                modifier = GlanceModifier.size(12.dp),
            )
        }
    }
}

@Composable
private fun Avatar(row: RecentConversationRow, sizeDp: Int) {
    Image(
        provider = ImageProvider(WidgetAvatarBitmap.render(LocalContext.current, row.title, row.accentHex, sizeDp, presence = row.presence)),
        contentDescription = null,
        modifier = GlanceModifier.size(sizeDp.dp),
    )
}

@Composable
private fun UnreadDot(sizeDp: Int) {
    Box(
        modifier = GlanceModifier.padding(start = 6.dp).size(sizeDp.dp).background(WidgetTheme.unreadBadge).cornerRadius((sizeDp / 2).dp),
        content = {},
    )
}

@Composable
private fun MarkReadButton(conversationId: String) {
    val context = LocalContext.current
    Box(
        modifier = GlanceModifier
            .size(MARK_READ_TARGET_DP.dp)
            .clickable(actionRunCallback<MarkReadActionCallback>(actionParametersOf(MarkReadParameters.conversationId to conversationId))),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            provider = ImageProvider(R.drawable.ic_widget_mark_read),
            contentDescription = context.getString(R.string.widget_mark_as_read),
            colorFilter = androidx.glance.ColorFilter.tint(WidgetTheme.unreadBadge),
            modifier = GlanceModifier.size(22.dp),
        )
    }
}

private const val SMALL_AVATAR_DP = 28
private const val MEDIUM_AVATAR_DP = 30
private const val LARGE_AVATAR_DP = 40
private const val MARK_READ_TARGET_DP = 44

private fun openIntent(context: Context, link: String): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity::class.java)

/** Registers [RecentConversationsWidget] with the OS (AndroidManifest `<receiver>`). */
internal class RecentConversationsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = RecentConversationsWidget()
}
