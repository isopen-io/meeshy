package me.meeshy.app.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.notifications.NotificationBannerViewModel
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.app.startup.AppOverlay
import me.meeshy.app.sync.SyncPillDockHolder
import me.meeshy.app.sync.SyncPillHost
import me.meeshy.app.sync.SyncPillNavigation
import me.meeshy.app.sync.SyncPillVisibility
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.syncpill.SyncPillPlacement
import me.meeshy.ui.component.chrome.LocalSyncPillDock
import me.meeshy.ui.motion.meeshyEnter
import me.meeshy.ui.motion.meeshyExit
import me.meeshy.ui.theme.MeeshyMotion

/**
 * La pastille globale de synchronisation, au-dessus du `NavHost` : hors ligne, reconnexion, envois en cours et qui
 * écrit, sur TOUS les écrans. Elle se pose juste au-dessus du chrome bas déclaré par l'écran (`Modifier.syncPillDock`)
 * et monte avec le clavier. Elle cède la place au visionneur de stories, aux réels et à la bannière de notification
 * in-app ; les feuilles modales, posées dans leur propre fenêtre, la recouvrent d'elles-mêmes (iOS : une présentation
 * modale ne traverse pas la pastille, qui ne porte que des ÉTATS).
 */
class SyncPillOverlay @Inject constructor(
    private val toasts: FeedbackToastCenter,
    private val dock: SyncPillDockHolder,
) : AppOverlay {
    override val order: Int = 300

    @Composable
    override fun Content(navController: NavHostController) {
        val entry by navController.currentBackStackEntryAsState()
        val banner = hiltViewModel<NotificationBannerViewModel>().banner.collectAsState().value
        val visible = SyncPillVisibility.isVisible(entry?.destination?.route, inAppBannerPresenting = banner != null)
        val density = LocalDensity.current
        val safeBottom = with(density) { WindowInsets.navigationBars.getBottom(density).toDp().value }
        val keyboard = with(density) { WindowInsets.ime.getBottom(density).toDp().value }
        val docked by dock.registry.observeHeight().collectAsState(initial = 0f)
        val bottom = SyncPillPlacement.bottomFromScreenEdge(safeBottom, keyboard, docked)
        Box(Modifier.fillMaxSize().padding(bottom = bottom.dp), contentAlignment = Alignment.BottomCenter) {
            SyncPillLayer(visible = visible, reduce = FeedOverlayTransition.reduceMotion) {
                SyncPillHost(
                    toasts = toasts,
                    onOpen = { source ->
                        SyncPillNavigation.route(source)?.let { route -> navController.navigate(route) { launchSingleTop = true } }
                    },
                )
            }
        }
    }
}

/** La pastille cède la place sans disparaître d'un coup : son hôte reste composé pendant la sortie. */
@Composable
internal fun SyncPillLayer(visible: Boolean, reduce: Boolean, content: @Composable () -> Unit) {
    AnimatedVisibility(
        visible = visible,
        enter = meeshyEnter(reduce, fadeIn(MeeshyMotion.springDefault())),
        exit = meeshyExit(reduce, fadeOut(MeeshyMotion.springDefault())),
        modifier = if (visible) Modifier else Modifier.clearAndSetSemantics {},
    ) {
        content()
    }
}

/** Rend le registre d'amarrage à tout l'arbre de navigation : un écran déclare sa barre basse par `Modifier.syncPillDock`. */
class SyncPillDockLocals @Inject constructor(private val dock: SyncPillDockHolder) : AppLocalsProvider {
    override val order: Int = 300

    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalSyncPillDock provides dock.registry, content = content)
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SyncPillOverlayModule {
    @Binds
    @IntoSet
    fun bindOverlay(overlay: SyncPillOverlay): AppOverlay

    @Binds
    @IntoSet
    fun bindLocals(provider: SyncPillDockLocals): AppLocalsProvider
}
