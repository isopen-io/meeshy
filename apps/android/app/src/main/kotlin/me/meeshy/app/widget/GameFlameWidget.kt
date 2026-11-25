package me.meeshy.app.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import dagger.hilt.android.EntryPointAccessors
import me.meeshy.app.MainActivity
import me.meeshy.app.R
import me.meeshy.app.navigation.graph.GameRoutes
import me.meeshy.app.widget.kit.WidgetTheme
import me.meeshy.app.widget.kit.widgetSurface
import me.meeshy.sdk.model.game.GameFlameLook
import me.meeshy.sdk.model.game.GameFlameWidgetFace
import me.meeshy.sdk.model.game.GameFlameWidgetFeed
import me.meeshy.sdk.model.game.GameFlameWidgetState

/**
 * **« Ma Flamme »** (#20566, miroir Android de `MeeshyWidgets.GameFlameWidget` iOS, #20562) : la Flamme et les actes du
 * jour sur l'écran d'accueil, sans notification de plus.
 *
 * Le widget lit le DERNIER bloc `game` connu au disque ([me.meeshy.sdk.engagement.EngagementProgressRepository.cachedProgress]),
 * jamais le réseau, et ne tient aucune horloge : il se repeint quand ce bloc change ([GameFlameWidgetRepaintInitializer]).
 * Rien d'autrui. « Jeu masqué » le vide (aucun texte, aucun lien) ; sans session, il n'invite qu'au premier geste. Un
 * appui ouvre Ma Légende.
 */
internal class GameFlameWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val state = readState(context)
        provideContent {
            GameFlameWidgetContent(state)
        }
    }

    companion object {
        /** Ce que le widget montre, lu au disque seul : la même lecture sert la peinture et le guet des changements. */
        suspend fun readState(context: Context): GameFlameWidgetState {
            val entryPoint = EntryPointAccessors.fromApplication(context, WidgetEntryPoint::class.java)
            val userId = entryPoint.tokenStore().userId
            if (userId.isNullOrBlank()) return GameFlameWidgetFeed.state(null, hidden = false, signedIn = false)
            val hidden = entryPoint.gameDevicePrefs().forAccount(userId).hidden
            if (hidden) return GameFlameWidgetState.Hidden
            return GameFlameWidgetFeed.state(entryPoint.engagementProgress().cachedProgress()?.game, hidden = false, signedIn = true)
        }
    }
}

@Composable
private fun GameFlameWidgetContent(state: GameFlameWidgetState) {
    when (state) {
        GameFlameWidgetState.Hidden -> Box(modifier = GlanceModifier.fillMaxSize().widgetSurface()) {}
        is GameFlameWidgetState.Shown -> GameFlameFace(state.face)
    }
}

@Composable
private fun GameFlameFace(face: GameFlameWidgetFace) {
    val context = LocalContext.current
    val title = context.getString(R.string.widget_game_flame_title)
    val days = if (face.showsDays) context.resources.getQuantityString(R.plurals.widget_game_flame_days, face.days, face.days) else null
    val statusLine = face.look.statusLineRes()?.let(context::getString)
    val acts = if (face.showsActs) context.getString(R.string.widget_game_flame_acts, face.actsDoneShown, face.actsTotal) else null
    val description = listOfNotNull(title, days, statusLine, acts).joinToString(", ")

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .widgetSurface()
            .padding(12.dp)
            .semantics { contentDescription = description }
            .clickable(actionStartActivity(legendIntent(context))),
        verticalAlignment = Alignment.Vertical.Top,
    ) {
        Text(
            text = title,
            maxLines = 1,
            style = TextStyle(color = WidgetTheme.title, fontSize = 12.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(modifier = GlanceModifier.defaultWeight())
        Row(verticalAlignment = Alignment.Vertical.CenterVertically) {
            Image(
                provider = ImageProvider(R.drawable.ic_widget_flame),
                contentDescription = null,
                modifier = GlanceModifier.size(26.dp),
                colorFilter = ColorFilter.tint(face.look.tint()),
            )
            if (days != null) {
                Spacer(modifier = GlanceModifier.width(6.dp))
                Text(
                    text = days,
                    maxLines = 1,
                    style = TextStyle(color = WidgetTheme.textPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold),
                )
            }
        }
        if (statusLine != null) {
            Spacer(modifier = GlanceModifier.height(4.dp))
            Text(
                text = statusLine,
                maxLines = 2,
                style = TextStyle(color = WidgetTheme.textSecondary, fontSize = 11.sp),
            )
        }
        if (acts != null) {
            Spacer(modifier = GlanceModifier.height(4.dp))
            Text(
                text = acts,
                maxLines = 1,
                style = TextStyle(color = WidgetTheme.textPrimary, fontSize = 12.sp, fontWeight = FontWeight.Medium),
            )
        }
    }
}

/** La phrase d'état (iOS `GameFlameLook.statusLine`) : aucune pour une Flamme vive. */
private fun GameFlameLook.statusLineRes(): Int? = when (this) {
    GameFlameLook.Lit -> null
    GameFlameLook.AtRisk -> R.string.widget_game_flame_at_risk
    GameFlameLook.Covered -> R.string.widget_game_flame_covered
    GameFlameLook.Out -> R.string.widget_game_flame_out
    GameFlameLook.Unlit -> R.string.widget_game_flame_empty
}

private fun GameFlameLook.tint(): ColorProvider = when (this) {
    GameFlameLook.Lit -> WidgetTheme.flameLit
    GameFlameLook.AtRisk -> WidgetTheme.flameAtRisk
    GameFlameLook.Covered -> WidgetTheme.flameCovered
    GameFlameLook.Out, GameFlameLook.Unlit -> WidgetTheme.textSecondary
}

/** Ma Légende, où la Flamme et les actes du jour se jouent (iOS `GameFlameWidgetKeys.link` → `.legend`). */
private fun legendIntent(context: Context): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse(GameRoutes.PROGRESSION_DEEP_LINKS.first()), context, MainActivity::class.java)

/** Enregistre [GameFlameWidget] auprès du système (`<receiver>` du manifeste). */
internal class GameFlameWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = GameFlameWidget()
}
